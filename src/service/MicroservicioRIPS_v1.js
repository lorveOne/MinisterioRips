const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const https = require('https');
const ValidatorRIPS = require('../validator/rips.validator');
const { log } = require('console');

class MicroservicioRIPS {
    constructor() {
        // Rutas base para carpetas originales
        this.rutaBaseCarpetas = process.env.RUTA_BASE_CARPETAS || 'C:\\Users\\USER\\Desktop\\Json_enviar';
        
        // Rutas para archivos procesados
        this.rutaArchivosPorEnviar = process.env.RUTA_ARCHIVOS_GENERADOS || 'C:\\Users\\USER\\Desktop\\Json_enviar\\porEnviar';
        this.rutaArchivosEnviados = process.env.RUTA_ARCHIVOSENVIADOS || 'C:\\Users\\USER\\Desktop\\Json_enviar\\procesados';
        this.rutaArchivosRechazados = process.env.RUTA_ARCHIVOSRECHAZADOS || 'C:\\Users\\USER\\Desktop\\Json_enviar\\rechazados';

        this.baseURL = process.env.BASE_URL || 'https://localhost:9443/api';
        this.usuario = process.env.USUARIO_SISPRO;
        this.password = process.env.PASSWORD_SISPRO;
        this.token = null;
        
        // Configurar para ignorar certificados SSL (solo desarrollo)
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    }

    /**
     * PASO 0: Ajustar carpetas JSON antes del procesamiento
     */
    async ajustarCarpetasJson() {
        console.log('🔧 PASO 0: Ajustando carpetas JSON...');
        const rutasAjustadas = [];

        try {
            // Verificar que existe la ruta base
            await fs.access(this.rutaBaseCarpetas);
            
            const carpetas = await fs.readdir(this.rutaBaseCarpetas, { withFileTypes: true });
            const carpetasDirectorios = carpetas.filter(dirent => dirent.isDirectory());

            if (carpetasDirectorios.length === 0) {
                console.log('ℹ️ No se encontraron carpetas para ajustar');
                return rutasAjustadas;
            }

            console.log(`📁 Encontradas ${carpetasDirectorios.length} carpetas para procesar`);

            for (const dirent of carpetasDirectorios) {
                const nombreCarpeta = dirent.name;
                const carpetaSalida = path.join(this.rutaBaseCarpetas, `${nombreCarpeta}_ajustada`);
                const jsonAjustado = path.join(carpetaSalida, `${nombreCarpeta}_ajustado.json`);

                // Verificar si ya existe el archivo ajustado
                try {
                    await fs.access(jsonAjustado);
                    console.log(`⏩ Ya ajustada: ${nombreCarpeta}, se omite`);
                    rutasAjustadas.push(jsonAjustado);
                    continue;
                } catch {
                    // El archivo no existe, proceder con el ajuste
                }

                const carpetaCompleta = path.join(this.rutaBaseCarpetas, nombreCarpeta);

                try {
                    const archivos = await fs.readdir(carpetaCompleta);
                    const jsonFile = archivos.find(f => f.toLowerCase().endsWith('.json'));
                    const xmlFile = archivos.find(f => f.toLowerCase().endsWith('.xml'));

                    if (!jsonFile || !xmlFile) {
                        console.warn(`⚠️ Archivos faltantes en carpeta ${nombreCarpeta}`);
                        continue;
                    }

                    const jsonPath = path.join(carpetaCompleta, jsonFile);
                    const xmlPath = path.join(carpetaCompleta, xmlFile);

                    // Leer archivos
                    const jsonContent = await fs.readFile(jsonPath, 'utf8');
                    const xmlContent = await fs.readFile(xmlPath);
                    
                    const jsonOriginal = JSON.parse(jsonContent);
                    const xmlBase64 = xmlContent.toString('base64');

                    // Crear estructura ajustada
                    const nuevoJson = {
                        rips: jsonOriginal,
                        xmlFevFile: xmlBase64
                    };
                    log(`🔧 Ajustando carpeta: ${nuevoJson}`);
                    // Crear carpeta de salida y escribir archivo
                    await fs.mkdir(carpetaSalida, { recursive: true });
                    await fs.writeFile(jsonAjustado, JSON.stringify(nuevoJson, null, 2), 'utf8');

                    console.log(`✅ Ajustado: ${nombreCarpeta}`);
                    rutasAjustadas.push(jsonAjustado);

                } catch (errorInterno) {
                    console.error(`❌ Error en carpeta ${nombreCarpeta}:`, errorInterno.message);
                }
            }

            console.log(`🔧 Proceso de ajuste completado. ${rutasAjustadas.length} archivos ajustados`);
            return rutasAjustadas;

        } catch (errorGeneral) {
            console.error('❌ Error al procesar carpetas:', errorGeneral.message);
            throw errorGeneral;
        }
    }

    /**
     * Copiar archivos ajustados a la carpeta de envío
     */
    async copiarArchivosAjustados(rutasAjustadas) {
        console.log('📋 Copiando archivos ajustados a carpeta de envío...');
        
        const archivosCopiados = [];
        
        for (const rutaAjustada of rutasAjustadas) {
            try {
                const nombreArchivo = path.basename(rutaAjustada);
                const rutaDestino = path.join(this.rutaArchivosPorEnviar, nombreArchivo);
                
                // Copiar archivo (no mover para mantener respaldo)
                const contenido = await fs.readFile(rutaAjustada);
                await fs.writeFile(rutaDestino, contenido);
                
                archivosCopiados.push(nombreArchivo);
                console.log(`📄 Copiado: ${nombreArchivo}`);
                
            } catch (error) {
                console.error(`❌ Error copiando ${rutaAjustada}:`, error.message);
            }
        }
        
        console.log(`📋 ${archivosCopiados.length} archivos copiados a carpeta de envío`);
        return archivosCopiados;
    }

    /**
     * Crear todas las carpetas necesarias si no existen
     */
    async crearCarpetasNecesarias() {
        console.log('📁 Verificando y creando carpetas necesarias...');
        
        try {
            await fs.mkdir(this.rutaBaseCarpetas, { recursive: true });
            await fs.mkdir(this.rutaArchivosPorEnviar, { recursive: true });
            await fs.mkdir(this.rutaArchivosEnviados, { recursive: true });
            await fs.mkdir(this.rutaArchivosRechazados, { recursive: true });
            
            console.log('✅ Carpetas verificadas/creadas correctamente');
        } catch (error) {
            console.log(`❌ Error creando carpetas: ${error.message}`);
            throw error;
        }
    }

    /**
     * 1. Validar carpeta y archivos
     */
    async validarArchivos() {
        console.log('🔍 PASO 1: Validando archivos...');
        
        try {
            await fs.access(this.rutaArchivosPorEnviar);
            console.log('✅ Carpeta encontrada');
            
            const archivos = await fs.readdir(this.rutaArchivosPorEnviar);
            const archivosJSON = archivos.filter(archivo => archivo.toLowerCase().endsWith('.json'));
            
            if (archivosJSON.length === 0) {
                throw new Error('No se encontraron archivos JSON');
            }
            
            console.log(`📄 Encontrados ${archivosJSON.length} archivos JSON`);
            
            // Validar estructura de cada archivo
            const archivosValidos = [];
            for (const archivo of archivosJSON) {
                const esValido = await this.validarEstructuraRIPS(archivo);
                if (esValido.valido) {
                    archivosValidos.push(archivo);
                    console.log(`✅ ${archivo} - Válido`);
                } else {
                    console.log(`❌ ${archivo} - ${esValido.error}`);
                }
            }
            
            return archivosValidos;
            
        } catch (error) {
            console.log(`❌ Error validando archivos: ${error.message}`);
            throw error;
        }
    }

    /**
     * Validar estructura RIPS de un archivo (ahora adaptado para la nueva estructura)
     */
    async validarEstructuraRIPS(nombreArchivo) {
        const rutaArchivo = path.join(this.rutaArchivosPorEnviar, nombreArchivo);
        
        try {
            const contenido = await fs.readFile(rutaArchivo, 'utf8');
            
            const json = JSON.parse(contenido);
            
            // Verificar estructura ajustada
            if (!json.rips || !json.xmlFevFile) {
                return { valido: false, error: 'Estructura no válida: faltan propiedades rips o xmlFevFile' };
            }
            
            // Validar que xmlFevFile sea base64
            if (typeof json.xmlFevFile !== 'string') {
                return { valido: false, error: 'xmlFevFile debe ser una cadena base64' };
            }
            
            // Llamar al validador RIPS para validar la estructura del JSON interno
            const validator = new ValidatorRIPS();
            const resultadoValidacion = validator.validarEstructuraRIPS(json);
            console.log(`🔍 Validando estructura de ${nombreArchivo}...`);

            if (!resultadoValidacion.valido) {
                return { valido: false, error: resultadoValidacion.error };
            }
            
            return { valido: true };
            
        } catch (error) {
            return { valido: false, error: error.message };
        }
    }

    /**
     * 2. Hacer login en SISPRO
     */
    async loginSISPRO() {
        console.log('🔐 PASO 2: Autenticando en SISPRO...');
        
        const loginData = {
            persona: {
                identificacion: {
                    tipo: 'CC',
                    numero: "1093218566"
                }
            },
            clave: "Laclavedetodo2025*",
            nit: "901685966",
        };

        try {
            const response = await this.hacerPeticionHTTPS('POST', '/Auth/LoginSISPRO', loginData);
            
            if (response.token) {
                this.token = response.token;
                console.log('✅ Login exitoso - Token obtenido');
                return true;
            } else {
                throw new Error('No se recibió token en la respuesta');
            }
            
        } catch (error) {
            console.log(`❌ Error en login: ${error.message}`);
            throw error;
        }
    }

    /**
     * 3. Enviar archivo RIPS (adaptado para la nueva estructura)
     */
    async enviarRIPS(nombreArchivo) {
        console.log(`📤 PASO 3: Enviando ${nombreArchivo}...`);
        
        if (!this.token) {
            throw new Error('No hay token válido. Hacer login primero.');
        }

        try {
            const rutaArchivo = path.join(this.rutaArchivosPorEnviar, nombreArchivo);
            const contenidoArchivo = await fs.readFile(rutaArchivo, 'utf8');
            const jsonData = JSON.parse(contenidoArchivo);

            // Enviar la estructura completa (rips + xmlFevFile)
            const response = await this.hacerPeticionHTTPS('POST', '/PaquetesFevRips/CargarFevRips', jsonData, {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            });

            console.log(`✅ ${nombreArchivo} enviado exitosamente`);
            
            // Mover archivo a carpeta de enviados
            await this.moverArchivo(nombreArchivo, 'procesados');
            
            return response;
            
        } catch (error) {
            console.log(`❌ Error enviando ${nombreArchivo}: ${error.message}`);
            
            // Mover archivo a carpeta de rechazados
            await this.moverArchivo(nombreArchivo, 'rechazados', `Error: ${error.message}`);
            
            throw error;
        }
    }

    /**
     * Hacer petición HTTPS
     */
    async hacerPeticionHTTPS(metodo, endpoint, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.baseURL + endpoint);
            
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: metodo,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                rejectUnauthorized: false // Solo para desarrollo
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const jsonResponse = JSON.parse(responseData);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(jsonResponse);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${jsonResponse.message || responseData}`));
                        }
                    } catch (error) {
                        reject(new Error(`Error parsing response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data && (metodo === 'POST' || metodo === 'PUT')) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }

    /**
     * Mover archivo a carpeta específica con log detallado
     */
    async moverArchivo(nombreArchivo, tipoDestino, motivo = '') {
        try {
            const rutaOrigen = path.join(this.rutaArchivosPorEnviar, nombreArchivo);
            
            let carpetaDestino;
            let nombreCarpeta;
            
            switch (tipoDestino) {
                case 'procesados':
                    carpetaDestino = this.rutaArchivosEnviados;
                    nombreCarpeta = 'procesados';
                    break;
                case 'rechazados':
                    carpetaDestino = this.rutaArchivosRechazados;
                    nombreCarpeta = 'rechazados';
                    break;
                default:
                    throw new Error(`Tipo de destino no válido: ${tipoDestino}`);
            }
            
            // Verificar que el archivo origen existe
            await fs.access(rutaOrigen);
            
            // Crear nombre único para evitar sobrescribir
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const extension = path.extname(nombreArchivo);
            const nombreBase = path.basename(nombreArchivo, extension);
            const nombreArchivoDestino = `${nombreBase}_${timestamp}${extension}`;
            
            const rutaDestino = path.join(carpetaDestino, nombreArchivoDestino);
            
            // Mover el archivo
            await fs.rename(rutaOrigen, rutaDestino);
            
            console.log(`📁 ${nombreArchivo} movido a carpeta: ${nombreCarpeta}`);
            if (motivo) {
                console.log(`   📝 Motivo: ${motivo}`);
            }
            
            // Crear archivo de log con detalles del procesamiento
            await this.crearLogProcesamiento(nombreArchivo, tipoDestino, motivo, rutaDestino);
            
        } catch (error) {
            console.log(`⚠️ No se pudo mover ${nombreArchivo}: ${error.message}`);
        }
    }

    /**
     * Crear log de procesamiento
     */
    async crearLogProcesamiento(nombreArchivo, estado, motivo, rutaArchivo) {
        try {
            const logData = {
                archivo: nombreArchivo,
                fechaProcesamiento: new Date().toISOString(),
                estado: estado,
                motivo: motivo,
                rutaFinal: rutaArchivo
            };
            
            const nombreLog = `log_${new Date().toISOString().split('T')[0]}.json`;
            const rutaLog = path.join(path.dirname(rutaArchivo), nombreLog);
            
            let logsExistentes = [];
            try {
                const contenidoLog = await fs.readFile(rutaLog, 'utf8');
                logsExistentes = JSON.parse(contenidoLog);
            } catch (error) {
                // Si no existe el archivo de log, se crea uno nuevo
            }
            
            logsExistentes.push(logData);
            
            await fs.writeFile(rutaLog, JSON.stringify(logsExistentes, null, 2), 'utf8');
            
        } catch (error) {
            console.log(`⚠️ No se pudo crear log: ${error.message}`);
        }
    }

    /**
     * Proceso principal actualizado
     */
    async ejecutar() {
        console.log('🚀 INICIANDO MICROSERVICIO RIPS\n');
        
        try {
            // 0. Crear carpetas necesarias
            await this.crearCarpetasNecesarias();
            
            // 1. Ajustar carpetas JSON
            const rutasAjustadas = await this.ajustarCarpetasJson();
            
            if (rutasAjustadas.length === 0) {
                console.log('ℹ️ No hay archivos para procesar');
                return;
            }
            
            // 2. Copiar archivos ajustados a carpeta de envío
            await this.copiarArchivosAjustados(rutasAjustadas);

            // 3. Validar archivos
            const archivosValidos = await this.validarArchivos();
            
            if (archivosValidos.length === 0) {
                console.log('ℹ️ No hay archivos válidos para enviar');
                return;
            }

            // 4. Hacer login
            await this.loginSISPRO();

            // 5. Enviar cada archivo válido
            console.log(`\n📤 Enviando ${archivosValidos.length} archivos...`);
            
            for (const archivo of archivosValidos) {
                try {
                    await this.enviarRIPS(archivo);
                    
                    // Esperar un poco entre envíos
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    console.log(`❌ Error con ${archivo}, continuando con el siguiente...`);
                }
            }

            console.log('\n✅ Proceso completado');
            
        } catch (error) {
            console.log(`❌ Error general: ${error.message}`);
        }
    }
}

// Exportar para uso como módulo
module.exports = MicroservicioRIPS;

// Ejecutar si se llama directamente
if (require.main === module) {
    const microservicio = new MicroservicioRIPS();
    microservicio.ejecutar().catch(console.error);
}