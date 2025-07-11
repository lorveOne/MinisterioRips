const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');

class FileService {
    constructor() {
        this.paths = config.paths;
    }

    async createNecessaryFolders() {
        console.log('📁 Verificando y creando carpetas necesarias...');
        
        try {
            await fs.mkdir(this.paths.base, { recursive: true });
            await fs.mkdir(this.paths.porEnviar, { recursive: true });
            await fs.mkdir(this.paths.procesados, { recursive: true });
            await fs.mkdir(this.paths.rechazados, { recursive: true });
            
            console.log('✅ Carpetas verificadas/creadas correctamente');
        } catch (error) {
            console.log(`❌ Error creando carpetas: ${error.message}`);
            throw error;
        }
    }
    async moveFile(fileName, destinationType, additionalData, numeroFactura) {
        try {
            const sourcePath = path.join(this.paths.porEnviar, fileName);
            let destinationPath;
            const fileContent = await fs.readFile(sourcePath, 'utf8');
            const jsonData = JSON.parse(fileContent);
            
            // Obtener número de factura del JSON original (con rips)
            if (jsonData.rips && jsonData.rips.numFactura) {
                numeroFactura = jsonData.rips.numFactura; // "HS1597968"
            }
            
            // Reestructurar el JSON: sacar el contenido de rips al nivel raíz
            const newJsonData = {
                ...jsonData.rips  // Extraer todo el contenido de rips al nivel raíz
            };
            
            // Convertir el JSON reestructurado a string
            const newJsonContent = JSON.stringify(newJsonData, null, 2);
            
            // EDITAR EL ARCHIVO ORIGINAL con la nueva estructura
            await fs.writeFile(sourcePath, newJsonContent, 'utf8');
            console.log(`📝 Archivo ${fileName} editado - estructura JSON reestructurada`);
            
            switch (destinationType) {
                case 'procesados':
                    if (!numeroFactura) {
                        throw new Error('Se requiere numeroFactura para mover a procesados');
                    }
                    // Crear carpeta con número de factura dentro de procesados
                    destinationPath = path.join(this.paths.procesados, String(numeroFactura));
                    await fs.mkdir(destinationPath, { recursive: true });
                    console.log(`📁 Carpeta creada: ${destinationPath}`);
                    break;
                                         
                case 'rechazados':
                    // Para rechazados, usar directamente la carpeta rechazados
                    destinationPath = this.paths.rechazados;
                    // Asegurar que la carpeta rechazados existe
                    await fs.mkdir(destinationPath, { recursive: true });
                    break;
                                         
                default:
                    throw new Error(`Tipo de destino no válido: ${destinationType}`);
            }
                         
            // Crear nombre del archivo usando el número de factura
            const extension = path.extname(fileName);
            const newFileName = `${numeroFactura}${extension}`;
            
            // Construir ruta final usando la carpeta correcta
            const finalPath = path.join(destinationPath, newFileName);
                         
            // Mover el archivo ya editado
            await fs.rename(sourcePath, finalPath);
                         
            console.log(`📁 ${fileName} editado y movido a: ${finalPath}`);
                         
            // Crear log de procesamiento
            await this.createProcessingLog(fileName, destinationType, additionalData, finalPath, numeroFactura);
                     
        } catch (error) {
            console.log(`⚠️ No se pudo procesar ${fileName}: ${error.message}`);
        }
    }
    async createProcessingLog(fileName, state, additionalData, filePath, numeroFactura) {
        try {
            console.log(`📝 Creando log para ${additionalData}`);
            const parsedData = JSON.parse(additionalData);
            const baseName = path.parse(fileName).name;
            const number = baseName.split('_')[0];
            
            // Función para extraer ProcesoId de las observaciones
            const extractProcesoId = (resultadosValidacion) => {
                if (!resultadosValidacion || !Array.isArray(resultadosValidacion)) return null;
                
                for (const resultado of resultadosValidacion) {
                    if (resultado.Observaciones) {
                        console.log(`🔍 Buscando ProcesoId en: ${resultado.Observaciones}`);
                        
                        // Buscar "ProcesoId" seguido de espacios y números al final o en cualquier parte
                        const match = resultado.Observaciones.match(/ProcesoId\s+(\d+)/i);
                        if (match) {
                            console.log(`✅ ProcesoId encontrado: ${match[1]}`);
                            return parseInt(match[1]);
                        }
                        
                        console.log(`❌ No se encontró ProcesoId en esta observación`);
                    }
                }
                console.log(`❌ ProcesoId no encontrado en ningún ResultadosValidacion`);
                return null;
            };
            
            // Transformar la estructura de datos al formato esperado
            let logData;
            
            if (state === 'procesados' && parsedData.respuestaCompleta) {
                // Para archivos procesados exitosamente
                logData = {
                    ResultState: true,
                    ProcesoId:  
                    extractProcesoId(parsedData.respuestaCompleta.ResultadosValidacion) ||  parsedData.respuestaCompleta.ProcesoId || null,
                    NumFactura: numeroFactura,
                    CodigoUnicoValidacion: parsedData.cuv || null,
                    FechaRadicacion: parsedData.fechaProceso || new Date().toISOString(),
                    RutaArchivos: path.dirname(filePath),
                    ResultadosValidacion: []
                };
            } else if (state === 'rechazados' && parsedData.respuestaCompleta) {
                // Para archivos rechazados
                const procesoId = parsedData.respuestaCompleta.ProcesoId || 
                                extractProcesoId(parsedData.respuestaCompleta.ResultadosValidacion) || null;
                
                logData = {
                    ResultState: false,
                    ProcesoId: procesoId,
                    NumFactura: numeroFactura,
                    CodigoUnicoValidacion: parsedData.cuv || "No aplica a paquetes procesados en estado [RECHAZADO] o validaciones realizadas antes del envío al Ministerio de Salud y Protección Social",
                    FechaRadicacion: parsedData.fechaProceso || new Date().toISOString(),
                    RutaArchivos: null,
                    ResultadosValidacion: parsedData.respuestaCompleta.ResultadosValidacion || []
                };
            } else {
                // Formato fallback para otros casos
                logData = {
                    ResultState: state === 'procesados',
                    ProcesoId: null,
                    NumFactura: numeroFactura,
                    CodigoUnicoValidacion: parsedData.cuv || null,
                    FechaRadicacion: parsedData.fechaProceso || new Date().toISOString(),
                    RutaArchivos: state === 'procesados' ? path.dirname(filePath) : null,
                    ResultadosValidacion: []
                };
            }
            
            const logFileName = state === 'procesados' ? `${numeroFactura}_CUV.json` : `${numeroFactura}_RECHAZADO.json`;
            
            const logPath = path.join(path.dirname(filePath), logFileName);
            
            let existingLogs = [];
            try {
                const logContent = await fs.readFile(logPath, 'utf8');
                existingLogs = JSON.parse(logContent);
            } catch (error) {
                // Si no existe el archivo de log, se crea uno nuevo
            }
            
            existingLogs.push(logData);
            await fs.writeFile(logPath, JSON.stringify(existingLogs, null, 2), 'utf8');
            
            if (parsedData.response && (state === 'rechazados' || parsedData.guardarRespuesta)) {
                await this.saveResponseFile(fileName, parsedData.response, filePath);
            }
            
        } catch (error) {
            console.log(`⚠️ No se pudo crear log: ${error.message}`);
        }
    }

    async saveResponseFile(fileName, response, basePath) {
        const responseFileName = `respuesta_${path.basename(fileName, path.extname(fileName))}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const responsePath = path.join(path.dirname(basePath), 'respuestas', responseFileName);
        
        const responseDir = path.dirname(responsePath);
        await fs.mkdir(responseDir, { recursive: true });
        
        await fs.writeFile(responsePath, JSON.stringify(response, null, 2), 'utf8');
    }

    async getFolderStatus() {
        console.log('\n📁 Estado de las carpetas:');
        
        try {
            const folders = [
                { name: 'porEnviar', path: this.paths.porEnviar },
                { name: 'procesados', path: this.paths.procesados },
                { name: 'rechazados', path: this.paths.rechazados }
            ];
            
            for (const folder of folders) {
                try {
                    const files = await fs.readdir(folder.path);
                    const jsonFiles = files.filter(file => file.toLowerCase().endsWith('.json'));
                    console.log(`   - ${folder.name}: ${jsonFiles.length} archivos JSON`);
                } catch (error) {
                    console.log(`   - ${folder.name}: No accesible o vacía`);
                }
            }
            
            await this.checkUnprocessedFolders();
            
        } catch (error) {
            console.log('❌ Error mostrando estado de carpetas');
        }
    }

    async checkUnprocessedFolders() {
        try {
            const folders = await fs.readdir(this.paths.base, { withFileTypes: true });
            const unprocessedFolders = folders.filter(dirent => 
                dirent.isDirectory() && 
                !['porEnviar', 'procesados', 'rechazados'].includes(dirent.name) &&
                !dirent.name.endsWith('_ajustada')
            ).length;
            
            console.log(`   - Carpetas originales sin procesar: ${unprocessedFolders}`);
            
            if (unprocessedFolders === 0) {
                console.log('✅ Todas las carpetas han sido procesadas');
            }
            
        } catch (error) {
            console.log('   - Error verificando carpetas originales');
        }
    }
}

module.exports = FileService; 