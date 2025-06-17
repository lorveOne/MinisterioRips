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

    async moveFile(fileName, destinationType, additionalData) {
        try {
            const sourcePath = path.join(this.paths.porEnviar, fileName);
            let destinationPath;
            
            switch (destinationType) {
                case 'procesados':
                    destinationPath = this.paths.procesados;
                    break;
                case 'rechazados':
                    destinationPath = this.paths.rechazados;
                    break;
                default:
                    throw new Error(`Tipo de destino no válido: ${destinationType}`);
            }
            
            await fs.access(sourcePath);
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const extension = path.extname(fileName);
            const baseName = path.basename(fileName, extension);
            const newFileName = `${baseName}_${timestamp}${extension}`;
            
            const finalPath = path.join(destinationPath, newFileName);
            await fs.rename(sourcePath, finalPath);
            
            console.log(`📁 ${fileName} movido a carpeta: ${destinationType}`);
            
            await this.createProcessingLog(fileName, destinationType, additionalData, finalPath);
            
        } catch (error) {
            console.log(`⚠️ No se pudo mover ${fileName}: ${error.message}`);
        }
    }

    async createProcessingLog(fileName, state, additionalData, filePath) {
        try {
            const parsedData = JSON.parse(additionalData);
            const baseName = path.parse(fileName).name;
            const number = baseName.split('_')[0];
            
            const logData = {
                factura: number,
                cuv: parsedData.cuv || null,
                errores: state === 'procesados' ? '' : 
                        state === 'rechazados' ? 
                        (parsedData.respuestaCompleta ?? parsedData.error ?? null) : 
                        null
            };
            
            const logFileName = `log_${new Date().toISOString().split('T')[0]}.json`;
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