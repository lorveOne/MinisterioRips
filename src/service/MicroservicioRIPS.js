const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const ValidatorRIPS = require('../validator/rips.validator');
const { log } = require('console');

class MicroservicioRIPS {
    constructor() {
        this.rutaArchivosPorEnviar = process.env.RUTA_ARCHIVOSPORENVIAR || 'C:\\Users\\USER\\Desktop\\Json_enviar\\porEnviar';
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
     * Crear todas las carpetas necesarias si no existen
     */
    async crearCarpetasNecesarias() {
        console.log('📁 Verificando y creando carpetas necesarias...');
        
        try {
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
     * Validar estructura RIPS de un archivo
     */
    async validarEstructuraRIPS(nombreArchivo) {
        const rutaArchivo = path.join(this.rutaArchivosPorEnviar, nombreArchivo);
        
        try {
            const contenido = await fs.readFile(rutaArchivo, 'utf8');
            const json = JSON.parse(contenido);
            
            // llamamos al validador RIPS se encarga de validar la estructura del JSON
            const validator = new ValidatorRIPS();
            const resultadoValidacion = validator.validarEstructuraRIPS(json);
            log(`🔍 Validando estructura de ${nombreArchivo}...`);
            // Validaciones básicas
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
            persona : {
                identificacion: {
                    tipo: 'CC', // Cambiar según sea necesario
                    numero:  "1093218566" // Usar el usuario como número de identificación
                }
            },
            clave: "Laclavedetodo2025*", // Usar la contraseña como clave
            nit: "901685966",
        };

       /*  if (!this.usuario || !this.password) {
            throw new Error('Usuario o contraseña no configurados en las variables de entorno');
        } */

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
     * 3. Enviar archivo RIPS
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

            const response = await this.hacerPeticionHTTPS('POST', '/PaquetesFevRips/CargarFevRips', jsonData, {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            });

            console.log(`✅ ${nombreArchivo} enviado exitosamente`);
            
            // Mover archivo a carpeta de enviados
            await this.moverArchivo(nombreArchivo, 'enviados');
            
            return response;
            
        } catch (error) {
            console.log(`❌ Error enviando ${nombreArchivo}: ${error.message}`);
            
            // Mover archivo a carpeta de errores
            await this.moverArchivo(nombreArchivo, 'rechazados');
            
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
     * Proceso principal
     */
    async ejecutar() {
        console.log('🚀 INICIANDO MICROSERVICIO RIPS\n');
        
        try {
            // 1. Validar archivos
            const archivosValidos = await this.validarArchivos();
            
            if (archivosValidos.length === 0) {
                console.log('ℹ️ No hay archivos válidos para enviar');
                return;
            }

            // 2. Hacer login
            await this.loginSISPRO();

            // 3. Enviar cada archivo válido
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