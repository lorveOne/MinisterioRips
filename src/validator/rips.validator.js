const fs = require('fs').promises;
const path = require('path');

class ValidadorRIPS {
    constructor(rutaCarpeta) {
        this.ruta = rutaCarpeta;
        this.camposRequeridos = {
            rips: {
                obligatorios: ['numDocumentoIdObligado', 'numFactura', 'usuarios'],
                usuarios: {
                    obligatorios: ['tipoDocumentoIdentificacion', 'numDocumentoIdentificacion', 'tipoUsuario', 'fechaNacimiento', 'codSexo', 'consecutivo', 'servicios'],
                    servicios: {
                        procedimientos: ['codPrestador', 'fechaInicioAtencion', 'codProcedimiento', 'vrServicio', 'consecutivo'],
                        consultas: ['codPrestador', 'fechaInicioAtencion', 'vrServicio', 'consecutivo'],
                        medicamentos: ['codPrestador', 'fechaDispensAdmon', 'codTecnologiaSalud', 'vrServicio', 'consecutivo']
                    }
                }
            },
             xmlFevFile: {}
                
        };
    }

    /**
     * Verifica si la carpeta existe
     */
    async existeCarpeta() {
        try {
            await fs.access(this.ruta);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Valida la estructura del JSON RIPS
     */
    validarEstructuraRIPS(json) {
        try {            
            // Verificar estructura principal
            if (!json.rips) {
                return { valido: false, error: 'Falta objeto "rips"' };
            }
            if (!json.xmlFevFile) {
                return { valido: false, error: 'Falta objeto xmlFevFile' };
            }

            const rips = json.rips;

            // Validar campos obligatorios del RIPS
            for (const campo of this.camposRequeridos.rips.obligatorios) {
                if (!rips[campo]) {
                    return { valido: false, error: `Falta campo obligatorio: rips.${campo}` };
                }
            }

            // Validar usuarios
            if (!Array.isArray(rips.usuarios) || rips.usuarios.length === 0) {
                return { valido: false, error: 'El campo "usuarios" debe ser un array con al menos un usuario' };
            }

            // Validar cada usuario
            for (let i = 0; i < rips.usuarios.length; i++) {
                const validacionUsuario = this.validarUsuario(rips.usuarios[i], i);
                if (!validacionUsuario.valido) {
                    return validacionUsuario;
                }
            }

            return { valido: true, mensaje: 'Estructura RIPS válida' };

        } catch (error) {
            return { valido: false, error: `Error validando estructura: ${error.message}` };
        }
    }

    /**
     * Valida un usuario específico
     */
    validarUsuario(usuario, indice) {
        // Validar campos obligatorios del usuario
        for (const campo of this.camposRequeridos.rips.usuarios.obligatorios) {
            if (usuario[campo] === undefined || usuario[campo] === null) {
                return { valido: false, error: `Usuario ${indice}: Falta campo obligatorio "${campo}"` };
            }
        }

        // Validar servicios
        if (!usuario.servicios) {
            return { valido: false, error: `Usuario ${indice}: Falta objeto "servicios"` };
        }

        const servicios = usuario.servicios;

        // Validar procedimientos si existen
        if (servicios.procedimientos && Array.isArray(servicios.procedimientos)) {
            for (let j = 0; j < servicios.procedimientos.length; j++) {
                const validacion = this.validarServicio(servicios.procedimientos[j], 'procedimiento', indice, j);
                if (!validacion.valido) return validacion;
            }
        }

        // Validar consultas si existen
        if (servicios.consultas && Array.isArray(servicios.consultas)) {
            for (let j = 0; j < servicios.consultas.length; j++) {
                const validacion = this.validarServicio(servicios.consultas[j], 'consulta', indice, j);
                if (!validacion.valido) return validacion;
            }
        }

        // Validar medicamentos si existen
        if (servicios.medicamentos && Array.isArray(servicios.medicamentos)) {
            for (let j = 0; j < servicios.medicamentos.length; j++) {
                const validacion = this.validarServicio(servicios.medicamentos[j], 'medicamento', indice, j);
                if (!validacion.valido) return validacion;
            }
        }

        return { valido: true };
    }

    /**
     * Valida un servicio específico (procedimiento, consulta o medicamento)
     */
    validarServicio(servicio, tipo, indiceUsuario, indiceServicio) {
        const camposRequeridos = this.camposRequeridos.rips.usuarios.servicios[tipo + 's'] || [];
        
        for (const campo of camposRequeridos) {
            if (servicio[campo] === undefined || servicio[campo] === null) {
                return { 
                    valido: false, 
                    error: `Usuario ${indiceUsuario}, ${tipo} ${indiceServicio}: Falta campo obligatorio "${campo}"` 
                };
            }
        }

        return { valido: true };
    }

    /**
     * Proceso principal: verificar carpeta y validar archivos
     */
    async procesar() {
        // 1. Verificar carpeta
        console.log(`🔍 Verificando carpeta: ${this.ruta}`);
        const existeCarpeta = await this.existeCarpeta();
        
        if (!existeCarpeta) {
            console.log(`❌ Carpeta NO encontrada: ${this.ruta}`);
            return { error: 'Carpeta no encontrada' };
        }

        console.log(`✅ Carpeta encontrada`);

        // 2. Listar archivos JSON
        try {
            const archivos = await fs.readdir(this.ruta);
            const archivosJSON = archivos.filter(archivo => archivo.toLowerCase().endsWith('.json'));

            if (archivosJSON.length === 0) {
                console.log('❌ No se encontraron archivos JSON');
                return { error: 'No hay archivos JSON' };
            }

            console.log(`📄 Encontrados ${archivosJSON.length} archivos JSON`);

            // 3. Validar cada archivo
            const resultados = [];
            for (const archivo of archivosJSON) {
                const resultado = await this.validarArchivo(archivo);
                resultados.push(resultado);
            }

            return { archivos: resultados };

        } catch (error) {
            console.log(`❌ Error leyendo carpeta: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Valida un archivo JSON específico
     */
    async validarArchivo(nombreArchivo) {
        const rutaArchivo = path.join(this.ruta, nombreArchivo);
        
        try {
            console.log(`🔍 Validando: ${nombreArchivo}`);
            
            // Leer archivo
            const contenido = await fs.readFile(rutaArchivo, 'utf8');
            const json = JSON.parse(contenido);
            
            // Validar estructura RIPS
            const validacion = this.validarEstructuraRIPS(json);
            
            if (validacion.valido) {
                console.log(`✅ ${nombreArchivo} - Estructura válida`);
                return {
                    archivo: nombreArchivo,
                    valido: true,
                    usuarios: json.rips.usuarios.length,
                    factura: json.rips.numFactura
                };
            } else {
                console.log(`❌ ${nombreArchivo} - ${validacion.error}`);
                return {
                    archivo: nombreArchivo,
                    valido: false,
                    error: validacion.error
                };
            }

        } catch (error) {
            console.log(`❌ ${nombreArchivo} - Error: ${error.message}`);
            return {
                archivo: nombreArchivo,
                valido: false,
                error: error.message
            };
        }
    }
}

// Uso
async function validarRIPS(jsonPath) {
    if (!jsonPath) {
        console.error('❌ Ruta de carpeta no especificada');
        return;
    }
    const validador = new ValidadorRIPS(jsonPath);
    const resultado = await validador.procesar();
    
    if (resultado.error) {
        console.log('❌ Error:', resultado.error);
    } else {
        console.log('\n📊 Resumen:');
        resultado.archivos.forEach(archivo => {
            const estado = archivo.valido ? '✅' : '❌';
            console.log(`${estado} ${archivo.archivo}`);
        });
    }
}

module.exports = ValidadorRIPS;

// Ejecutar
if (require.main === module) {
    validarRIPS().catch(console.error);
}