const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
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
            
            console.log('✅ Carpetas verificadas/creadas correctamente');
        } catch (error) {
            console.log(`❌ Error creando carpetas: ${error.message}`);
            throw error;
        }
    }
    async moveFile(fileName, destinationType, additionalData, numeroFactura, userProcessedPath, userRejectedPath) {
        try {
            const sourcePath = path.join(this.paths.porEnviar, fileName);
            // Remove _ajustado.json from the filename to get base name and split into usuario/subcarpeta
            const baseFileName = fileName.replace(/_ajustado\.json$/i, '');
            const lastUnderscore = baseFileName.lastIndexOf('_');
            const userName = lastUnderscore !== -1 ? baseFileName.substring(0, lastUnderscore) : '';
            const containerFolder = lastUnderscore !== -1 ? baseFileName.substring(lastUnderscore + 1) : baseFileName;
            let destinationPath;
            
            // Leer y procesar el archivo JSON
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
            
            // Determinar la ruta de destino
            switch (destinationType) {
                case 'procesados':
                    if (!numeroFactura) {
                        throw new Error('Se requiere numeroFactura para mover a procesados');
                    }
                    // Crear carpeta con número de factura dentro de procesados
                    destinationPath = path.join(userProcessedPath, String(numeroFactura));
                    await fs.mkdir(destinationPath, { recursive: true });
                    console.log(`📁 Carpeta creada: ${destinationPath}`);
                    break;
                                     
                case 'rechazados':
                    if (!numeroFactura) {
                        throw new Error('Se requiere numeroFactura para mover a rechazados');
                    }
                    // Crear carpeta con número de factura dentro de rechazados
                    destinationPath = path.join(userRejectedPath, String(numeroFactura));
                    await fs.mkdir(destinationPath, { recursive: true });
                    console.log(`📁 Carpeta de rechazados creada: ${destinationPath}`);
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
            // Intentar localizar y mover XMLs relacionados desde la carpeta del usuario
            try {
                // Candidatos donde podrían estar los XMLs asociados a la factura
                const xmlSourceCandidates = [
                    userProcessedPath ? path.join(userProcessedPath, containerFolder) : null,
                    userRejectedPath ? path.join(userRejectedPath, containerFolder) : null,
                    userName ? path.join(this.paths.base, userName, containerFolder) : null
                ].filter(Boolean);

                let xmlSourceDir = null;
                for (const candidate of xmlSourceCandidates) {
                    try {
                        await fs.access(candidate);
                        xmlSourceDir = candidate;
                        break;
                    } catch (_) { /* seguir con el siguiente */ }
                }

                if (xmlSourceDir) {
                    const files = await fs.readdir(xmlSourceDir);
                    const xmlFiles = files.filter(f => f.toLowerCase().endsWith('.xml'));
                    if (xmlFiles.length > 0) {
                        console.log(`🔍 Encontrados ${xmlFiles.length} XML en ${xmlSourceDir}`);
                        for (const xmlFile of xmlFiles) {
                            const sourceXmlPath = path.join(xmlSourceDir, xmlFile);
                            const destXmlPath = path.join(destinationPath, xmlFile);
                            await fs.rename(sourceXmlPath, destXmlPath);
                            console.log(`📄 XML ${xmlFile} movido a: ${destXmlPath}`);
                        }
                    }
                    // Intentar limpiar la carpeta fuente si queda vacía
                    try {
                        await fs.rm(xmlSourceDir, { recursive: true, force: true });
                        console.log(`🗑️ Carpeta fuente de XML eliminada: ${xmlSourceDir}`);
                    } catch (error) {
                        console.log(`⚠️ No se pudo eliminar ${xmlSourceDir}: ${error.message}`);
                    }
                } else {
                    console.log('ℹ️ No se encontró carpeta fuente de XML asociada a la factura');
                }
            } catch (error) {
                console.log(`⚠️ Advertencia al mover XMLs asociados: ${error.message}`);
            }
           
                             
            // Crear log de procesamiento
            await this.createProcessingLog(fileName, destinationType, additionalData, finalPath, numeroFactura);
            
            return { success: true, destinationPath };
                         
        } catch (error) {
            console.log(`⚠️ No se pudo procesar ${fileName}: ${error.message}`);
            throw error; // Relanzar el error para que el llamador lo maneje
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
                const parsed = JSON.parse(logContent);
                existingLogs = Array.isArray(parsed) ? parsed : [parsed];
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

    async moveFolder(sourceFolderPath, destinationFolderPath, reason = 'sin_razon') {
        try {
            const folderName = path.basename(sourceFolderPath);
            const finalDestinationPath = path.join(destinationFolderPath, folderName);
            
            await fs.rename(sourceFolderPath, finalDestinationPath);
            console.log(`📁 Carpeta movida: ${sourceFolderPath} -> ${finalDestinationPath} (Razón: ${reason})`);
            return { success: true, finalDestinationPath };
        } catch (error) {
            console.error(`❌ Error moviendo carpeta ${sourceFolderPath}: ${error.message}`);
            throw error; 
        }
    }
}

module.exports = FileService; 