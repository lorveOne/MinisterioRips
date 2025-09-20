const fs = require('fs').promises;
const path = require('path');
const ValidatorRIPS = require('../validator/rips.validator');
const hacerPeticionHTTPS = require('../helper/HttpClient');
const DateUtils = require('../utils/date.utils');
const config = require('../config/config');
const AuthService = require('./auth.service');
const FileService = require('./file.service');

const {
    extractInvoicePeriodWithXml2js,
    formatInvoicePeriod,
} =  require('../validator/extraerPeridos');

class MicroservicioRIPS {
    constructor() {
        this.httpClient = new hacerPeticionHTTPS();
        this.paths = config.paths;
        this.authService = new AuthService();
        this.fileService = new FileService();
        this.fileUserPaths = new Map(); // Initialize the map
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
        // Usar carpeta porEnviar por defecto si no hay configuración explícita
        this.useStaging = (typeof this.paths.usarPorEnviar === 'undefined') ? true : !!this.paths.usarPorEnviar;
    }

    /**
     * Ajustar RIPS se encarga de ajustar los datos de los RIPS para que cumplan con el formato requerido por el SISPRO
     * @param {Object} ripsData - Datos RIPS
     * @param {string} billingPeriod - Período de facturación
     * @returns {Object} Datos RIPS ajustados
     */
    async ajustarRIPS(ripsData, billingPeriod) {
        console.log(`🔧 Ajustando RIPS...`);
        if (!ripsData?.rips?.usuarios) {
            throw new Error('Datos RIPS inválidos o incompletos');
        }

        let adjustmentsMade = 0;
        const { usuarios } = ripsData.rips;

        usuarios.forEach(usuario => {
            const { servicios } = usuario;

            // Ajustes para urgencias
            if (servicios.urgencias?.length > 0) {
                servicios.urgencias.forEach((urgencia, index) => {
                    if (urgencia.condicionDestinoUsuarioEgreso?.length === 1) {
                        urgencia.condicionDestinoUsuarioEgreso = `0${urgencia.condicionDestinoUsuarioEgreso}`;
                        console.log(`📝 Urgencia[${index}] - Ajustado condicionDestinoUsuarioEgreso`);
                        adjustmentsMade++;
                    }

                    if (urgencia.fechaEgreso) {
                        const originalDate = urgencia.fechaEgreso;
                        urgencia.fechaEgreso = DateUtils.validateAndAdjustDate(originalDate, index, 'Urgencia', billingPeriod);
                        if (urgencia.fechaEgreso !== originalDate) adjustmentsMade++;
                    }
                });
            }

            // Ajustes para medicamentos
            if (servicios.medicamentos?.length > 0) {
                servicios.medicamentos.forEach((medicamento, index) => {
                    if (medicamento.diasTratamiento === 0) {
                        medicamento.diasTratamiento = 1;
                        console.log(`📝 Medicamento - Ajustado diasTratamiento: 0 → 1`);
                        adjustmentsMade++;
                    }
                    if (medicamento.fechaDispensAdmon) {
                        const originalDate = medicamento.fechaDispensAdmon;
                        medicamento.fechaDispensAdmon = DateUtils.validateAndAdjustDate(originalDate, index, 'Medicamento', billingPeriod);
                        if (medicamento.fechaDispensAdmon !== originalDate) adjustmentsMade++;
                    }
                });
            }

            // Ajustes para consultas
            if (servicios.consultas?.length > 0) {
                servicios.consultas.forEach((consulta, index) => {
                    if (consulta.fechaInicioAtencion) {
                        const originalDate = consulta.fechaInicioAtencion;
                        consulta.fechaInicioAtencion = DateUtils.validateAndAdjustDate(originalDate, index, 'Consulta', billingPeriod);
                        if (consulta.fechaInicioAtencion !== originalDate) adjustmentsMade++;
                    }
                });
            }

            // Ajustes para hospitalización
            if (servicios.hospitalizacion?.length > 0) {
                servicios.hospitalizacion.forEach((hospita, index) => {
                    if (hospita.viaIngresoServicioSalud?.length === 1) {
                        hospita.viaIngresoServicioSalud = '02';
                        console.log(`📝 Hospitalización[${index}] - Ajustado viaIngresoServicioSalud`);
                        adjustmentsMade++;
                    }

                    if (hospita.condicionDestinoUsuarioEgreso?.trim() === '') {
                        hospita.condicionDestinoUsuarioEgreso = '01';
                        console.log(`📝 Hospitalización[${index}] - Ajustado condicionDestinoUsuarioEgreso`);
                        adjustmentsMade++;
                    }

                    if (hospita.fechaInicioAtencion) {
                        const originalDate = hospita.fechaInicioAtencion;
                        hospita.fechaInicioAtencion = DateUtils.validateAndAdjustDate(originalDate, index, 'Hospitalización', billingPeriod);
                        if (hospita.fechaInicioAtencion !== originalDate) adjustmentsMade++;
                    }

                    if (hospita.fechaEgreso) {
                        const originalDate = hospita.fechaEgreso;
                        hospita.fechaEgreso = DateUtils.validateAndAdjustDate(originalDate, index, 'Hospitalización', billingPeriod);
                        if (hospita.fechaEgreso !== originalDate) adjustmentsMade++;
                    }
                });
            }

            // Ajustes para procedimientos
            if (servicios.procedimientos?.length > 0) {
                servicios.procedimientos.forEach((procedimiento, index) => {
                    if (procedimiento.finalidadTecnologiaSalud?.toString().length === 1) {
                        procedimiento.finalidadTecnologiaSalud = '44';
                        console.log(`📝 Procedimiento[${index}] - Ajustado finalidadTecnologiaSalud`);
                        adjustmentsMade++;
                    }

                    if (procedimiento.fechaInicioAtencion) {
                        const originalDate = procedimiento.fechaInicioAtencion;
                        procedimiento.fechaInicioAtencion = DateUtils.validateAndAdjustDate(originalDate, index, 'Procedimiento', billingPeriod);
                        if (procedimiento.fechaInicioAtencion !== originalDate) adjustmentsMade++;
                    }
                });
            }

            // Ajustes para otros servicios
            if (servicios.otrosServicios?.length > 0) {
                servicios.otrosServicios.forEach((otro, index) => {
                    if (otro.codTecnologiaSalud === 'TAB-SC-URBU') {
                        otro.codTecnologiaSalud = '601T01';  ///ENCONTRADO EN TABLAS SISPROS 
                        console.log(`📝 OtroServicio - Ajustado codTecnologiaSalud`);
                        adjustmentsMade++;
                    }
                    if (otro.fechaSuministroTecnologia) {
                        const originalDate = otro.fechaSuministroTecnologia;
                        otro.fechaSuministroTecnologia = DateUtils.validateAndAdjustDate(originalDate, index, 'Otros Servicios', billingPeriod);
                        if (otro.fechaSuministroTecnologia !== originalDate) adjustmentsMade++;
                    }
                });
            }
        });

        console.log(`✅ Total de ajustes realizados: ${adjustmentsMade}`);
        return ripsData;
    }

    /**
     * Ajustar carpetas JSON y enviar directamente a porEnviar se encarga de ajustar las carpetas JSON y enviarlas a la carpeta porEnviar
     * @returns {Array} Archivos ajustados
     */
    async ajustarCarpetasJson() {
        console.log('🔧 PASO 0: Ajustando carpetas JSON y enviando a porEnviar...');
        const archivosAjustados = [];

        try {
            // Verificar que existe la ruta base
            await fs.access(this.paths.base);
            
            const directoriosBase = await fs.readdir(this.paths.base, { withFileTypes: true });
            const carpetasUsuario = directoriosBase.filter(dirent => dirent.isDirectory() &&
                                                      !['porEnviar', 'procesados', 'rechazados'].includes(dirent.name.toLowerCase()));

            if (carpetasUsuario.length === 0) {
                console.log('ℹ️ No se encontraron carpetas de usuario para ajustar');
                return archivosAjustados;
            }

            console.log(`📁 Encontradas ${carpetasUsuario.length} carpetas de usuario para revisar`);

            for (const direntUsuario of carpetasUsuario) {
                const nombreCarpetaUsuario = direntUsuario.name;
                const rutaCarpetaUsuario = path.join(this.paths.base, nombreCarpetaUsuario);

                // Crear carpetas procesados y rechazados dentro de la carpeta del usuario
                const rutaProcesadosUsuario = path.join(rutaCarpetaUsuario, 'procesados');
                const rutaRechazadosUsuario = path.join(rutaCarpetaUsuario, 'rechazados');
                await fs.mkdir(rutaProcesadosUsuario, { recursive: true });
                await fs.mkdir(rutaRechazadosUsuario, { recursive: true });
                // Marcar como ocultas en Windows (no afecta *nix)
              
                console.log(`✅ Carpetas 'procesados' y 'rechazados' creadas en ${nombreCarpetaUsuario}`);

                const archivosEnCarpetaUsuario = await fs.readdir(rutaCarpetaUsuario, { withFileTypes: true });
                const carpetasContenedoras = archivosEnCarpetaUsuario.filter(dirent => dirent.isDirectory() &&
                                                                         !['procesados', 'rechazados'].includes(dirent.name.toLowerCase()));
                
                if (carpetasContenedoras.length === 0) {
                    console.log(`ℹ️ No se encontraron subcarpetas con JSON/XML en ${nombreCarpetaUsuario}`);
                    continue;
                }

                for (const direntContenedora of carpetasContenedoras) {
                    const nombreCarpetaContenedora = direntContenedora.name;
                    const carpetaCompletaContenedora = path.join(rutaCarpetaUsuario, nombreCarpetaContenedora);
                    
                    try {
                        const archivos = await fs.readdir(carpetaCompletaContenedora);
                        const jsonFile = archivos.find(f => f.toLowerCase().endsWith('.json'));
                        const xmlFile = archivos.find(f => f.toLowerCase().endsWith('.xml'));
    
                        if (!jsonFile || !xmlFile) {
                            console.warn(`⚠️ Archivos faltantes en carpeta ${nombreCarpetaUsuario}/${nombreCarpetaContenedora}, moviendo a rechazados`);
                            await this.fileService.moveFolder(carpetaCompletaContenedora, rutaRechazadosUsuario, `Archivos faltantes: JSON o XML`);
                            continue;
                        }
    
                        const jsonPath = path.join(carpetaCompletaContenedora, jsonFile);
                        const xmlPath = path.join(carpetaCompletaContenedora, xmlFile);
    
                        // Leer archivos
                        const jsonContent = await fs.readFile(jsonPath, 'utf8');
                        const xmlContent = await fs.readFile(xmlPath);
                        
                        const jsonOriginal = JSON.parse(jsonContent);
                        const xmlBase64 = xmlContent.toString('base64');
                        const periodo = await extractInvoicePeriodWithXml2js(xmlPath);
                        const periodoFormateado = formatInvoicePeriod(periodo);
            
                        console.log('Período de facturación:', periodoFormateado);
                       
                        // Crear estructura ajustada
                        const nuevoJson = {
                            rips: jsonOriginal,
                            xmlFevFile: xmlBase64
                        };
                        console.log(`🔧 Ajustando carpeta: ${nombreCarpetaContenedora} para usuario ${nombreCarpetaUsuario}`);
                        const newversion =  await this.ajustarRIPS(nuevoJson, periodoFormateado);
                        
                        // Escribir el archivo ajustado en la carpeta porEnviar principal
                        const nombreArchivoAjustado = `${nombreCarpetaUsuario}_${nombreCarpetaContenedora}_ajustado.json`;
                        const rutaArchivoEnPorEnviar = path.join(this.paths.porEnviar, nombreArchivoAjustado);
                        await fs.writeFile(rutaArchivoEnPorEnviar, JSON.stringify(newversion, null, 2), 'utf8');
    
                        console.log(`✅ Ajustado y guardado en porEnviar: ${nombreArchivoAjustado}`);
                        archivosAjustados.push(nombreArchivoAjustado);
    
                        // Store user-specific paths for later use
                        this.fileUserPaths.set(nombreArchivoAjustado, { userProcessedPath: rutaProcesadosUsuario, userRejectedPath: rutaRechazadosUsuario });
    
                        // Mover la carpeta original completa a procesados del usuario
                        await this.fileService.moveFolder(carpetaCompletaContenedora, rutaProcesadosUsuario, 'ajustado_exitosamente');
    
                    } catch (errorInterno) {
                        console.error(`❌ Error procesando ${nombreCarpetaUsuario}/${nombreCarpetaContenedora}:`, errorInterno.message);
                        // Mover la carpeta original completa a rechazados del usuario
                        await this.fileService.moveFolder(carpetaCompletaContenedora, rutaRechazadosUsuario, `Error: ${errorInterno.message}`);
                    }
                }
            }

            console.log(`🔧 Proceso de ajuste completado. ${archivosAjustados.length} archivos ajustados y guardados en porEnviar`);
            return archivosAjustados;

        } catch (errorGeneral) {
            console.error('❌ Error al procesar carpetas:', errorGeneral.message);
            throw errorGeneral;
        }
    }

    /**
     * Validar estructura del objeto ajustado en memoria (sin leer archivo)
     * @param {object} json - Objeto con estructura { rips, xmlFevFile }
     * @returns {{valido: boolean, error?: string}}
     */
    async validarEstructuraRIPSObj(json) {
        try {
            if (!json || typeof json !== 'object') {
                return { valido: false, error: 'Objeto inválido' };
            }
            if (!json.rips) {
                return { valido: false, error: 'Falta propiedad rips' };
            }
            if (!json.xmlFevFile || typeof json.xmlFevFile !== 'string') {
                return { valido: false, error: 'xmlFevFile debe existir y ser string base64' };
            }
            const validator = new ValidatorRIPS();
            const resultadoValidacion = validator.validarEstructuraRIPS(json);
            if (!resultadoValidacion.valido) {
                return { valido: false, error: resultadoValidacion.error };
            }
            return { valido: true };
        } catch (error) {
            return { valido: false, error: error.message };
        }
    }


    /**
     * Crear todas las carpetas necesarias si no existen
     * @returns {void}
     */
    async crearCarpetasNecesarias() {
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

    /**
     * Validar carpeta y archivos se encarga de validar las carpetas y archivos para que cumplan con el formato requerido por el SISPRO
     * @returns {Array} Archivos válidos
     */
    async validarArchivos() {
        console.log('🔍 PASO 1: Validando archivos...');
        
        try {
            await fs.access(this.paths.porEnviar);
            console.log('✅ Carpeta encontrada');
            
            const archivos = await fs.readdir(this.paths.porEnviar);
            const archivosJSON = archivos.filter(archivo => archivo.toLowerCase().endsWith('.json'));
            
            if (archivosJSON.length === 0) {
                console.log('ℹ️ No se encontraron archivos JSON en porEnviar');
                return [];
            }
            
            console.log(`📄 Encontrados ${archivosJSON.length} archivos JSON en porEnviar`);
            
            // Validar estructura de cada archivo
            const archivosValidos = [];
            for (const archivo of archivosJSON) {
                const esValido = await this.validarEstructuraRIPS(archivo);
                if (esValido.valido) {
                    archivosValidos.push(archivo);
                    console.log(`✅ ${archivo} - Válido`);
                } else {
                    console.log(`❌ ${archivo} - ${esValido.error}`);
                    // Mover archivo inválido a rechazados
                    const userPaths = this.fileUserPaths.get(archivo);
                    if (userPaths) {
                        await this.fileService.moveFile(archivo, 'rechazados', `Validación fallida: ${esValido.error}`, null, userPaths.userProcessedPath, userPaths.userRejectedPath);
                    } else {
                        // Fallback if paths are not found (e.g., file not from initial adjustment)
                        await this.fileService.moveFile(archivo, 'rechazados', `Validación fallida: ${esValido.error}`, null, this.paths.procesados, this.paths.rechazados);
                    }
                }
            }
            
            return archivosValidos;
            
        } catch (error) {
            console.log(`❌ Error validando archivos: ${error.message}`);
            return [];
        }
    }

    /**
     * valida estructura Rips Nuevamente si tiene xml y principal Rips
     * @param {string} nombreArchivo - Nombre del archivo a validar
     * @returns {Object} Resultado de la validación
     */
    async validarEstructuraRIPS(nombreArchivo) {
        const rutaArchivo = path.join(this.paths.porEnviar, nombreArchivo);
        
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
     * Enviar archivo RIPS se encarga de enviar el archivo a la API del SISPRO
     * @param {string} fileName - Nombre del archivo a enviar
     * @returns {Object} Resultado de la validación
     */
    async sendRips(fileName) {
        console.log(`📤 Enviando ${fileName}...`);
        
        try {
            const filePath = path.join(this.paths.porEnviar, fileName);
            const fileContent = await fs.readFile(filePath, 'utf8');
            const jsonData = JSON.parse(fileContent);

            const response = await this.httpClient.hacerPeticionHTTPS(
                'POST', 
                '/PaquetesFevRips/CargarFevRips', 
                jsonData,
                {
                    'Authorization': `Bearer ${this.authService.getToken()}`,
                    'Content-Type': 'application/json'
                }
            );

            console.log(`📡 ${fileName} enviado al servidor`);

            const resultState = response?.ResultState;
            const cuv = response?.CodigoUnicoValidacion;
            
            let foundCuv = cuv;
            let isDuplicate = false;
            
            if (resultState === false && response?.ResultadosValidacion) {
                const duplicateError = response.ResultadosValidacion.find(r => 
                    r.Clase === 'RECHAZADO' && r.Codigo === 'RVG18'
                );
                
                if (duplicateError?.Observaciones) {
                    foundCuv = duplicateError.Observaciones.trim();
                    isDuplicate = true;
                    console.log(`🔄 Archivo ya procesado anteriormente`);
                    console.log(`🎯 CUV recuperado de proceso anterior: ${foundCuv}`);
                }
                
                if (!foundCuv || foundCuv.includes('No aplica')) {
                    const rvg02Error = response.ResultadosValidacion.find(r => 
                        r.Clase === 'RECHAZADO' && r.Codigo === 'RVG02'
                    );
                    
                    if (rvg02Error?.Observaciones) {
                        const matchCuv = rvg02Error.Observaciones.match(/CUV\s+([a-f0-9]{64})/i);
                        if (matchCuv?.[1]) {
                            foundCuv = matchCuv[1];
                            isDuplicate = true;
                            console.log(`🎯 CUV extraído de RVG02: ${foundCuv}`);
                        }
                    }
                }
            }
            
            if (resultState === true) {
                console.log(`✅ ${fileName} procesado exitosamente`);
                if (foundCuv && !foundCuv.includes('No aplica')) {
                    console.log(`🎯 CUV obtenido: ${foundCuv}`);
                }
                
                const userPaths = this.fileUserPaths.get(fileName);
                if (userPaths) {
                    await this.fileService.moveFile(fileName, 'procesados', JSON.stringify({
                        estado: 'EXITOSO',
                        fechaProceso: new Date().toISOString(),
                        cuv: foundCuv,
                        respuestaCompleta: response,
                        numeroFactura: fileName,
                    }, null, 2), null, userPaths.userProcessedPath, userPaths.userRejectedPath);
                } else {
                    await this.fileService.moveFile(fileName, 'procesados', JSON.stringify({
                        estado: 'EXITOSO',
                        fechaProceso: new Date().toISOString(),
                        cuv: foundCuv,
                        respuestaCompleta: response,
                        numeroFactura: fileName,
                    }, null, 2), null, this.paths.procesados, this.paths.rechazados);
                }
                
                return { success: true, response, cuv: foundCuv };
                
            } else if (isDuplicate && foundCuv && !foundCuv.includes('No aplica')) {
                console.log(`✅ ${fileName} ya fue procesado anteriormente (duplicado)`);
                
                const userPaths = this.fileUserPaths.get(fileName);
                if (userPaths) {
                    await this.fileService.moveFile(fileName, 'procesados', JSON.stringify({
                        estado: 'DUPLICADO_CON_CUV',
                        fechaProceso: new Date().toISOString(),
                        cuv: foundCuv,
                        motivo: 'Archivo ya procesado en proceso anterior',
                        respuestaCompleta: response
                    }, null, 2), null, userPaths.userProcessedPath, userPaths.userRejectedPath);
                } else {
                    await this.fileService.moveFile(fileName, 'procesados', JSON.stringify({
                        estado: 'DUPLICADO_CON_CUV',
                        fechaProceso: new Date().toISOString(),
                        cuv: foundCuv,
                        motivo: 'Archivo ya procesado en proceso anterior',
                        respuestaCompleta: response
                    }, null, 2), null, this.paths.procesados, this.paths.rechazados);
                }
                
                return { success: true, response, cuv: foundCuv, isDuplicate: true };
                
            } else {
                console.log(`❌ ${fileName} rechazado por el servidor`);
                
                if (response?.ResultadosValidacion) {
                    const errors = response.ResultadosValidacion.filter(r => r.Clase === 'RECHAZADO');
                    const notifications = response.ResultadosValidacion.filter(r => r.Clase === 'NOTIFICACION');
                    
                    if (errors.length > 0) {
                        console.log(`🚫 Errores encontrados (${errors.length}):`);
                        errors.forEach((error, index) => {
                            console.log(`   ${index + 1}. [${error.Codigo}] ${error.Descripcion}`);
                            if (error.Observaciones) {
                                console.log(`      📌 ${error.Observaciones}`);
                            }
                        });
                    }
                    
                    if (notifications.length > 0) {
                        console.log(`⚠️ Notificaciones (${notifications.length})`);
                    }
                }
                
                const userPaths = this.fileUserPaths.get(fileName);
                if (userPaths) {
                    await this.fileService.moveFile(fileName, 'rechazados', JSON.stringify({
                        estado: 'RECHAZADO',
                        fechaProceso: new Date().toISOString(),
                        motivo: 'ResultState: false',
                        cuv: foundCuv || null,
                        respuestaCompleta: response
                    }, null, 2), null, userPaths.userProcessedPath, userPaths.userRejectedPath);
                } else {
                    await this.fileService.moveFile(fileName, 'rechazados', JSON.stringify({
                        estado: 'RECHAZADO',
                        fechaProceso: new Date().toISOString(),
                        motivo: 'ResultState: false',
                        cuv: foundCuv || null,
                        respuestaCompleta: response
                    }, null, 2), null, this.paths.procesados, this.paths.rechazados);
                }
                
                return { success: false, response, errors: response?.ResultadosValidacion, cuv: foundCuv };
            }

        } catch (error) {
            console.log(`❌ Error enviando ${fileName}: ${error.message}`);
            
            const errorData = error.message.includes('HTTP 400:') 
                ? JSON.parse(error.message.split('HTTP 400: ')[1]).ResultadosValidacion?.filter(r => r.Clase === 'RECHAZADO') || error.message
                : error.message;
            
            const userPaths = this.fileUserPaths.get(fileName);
            if (userPaths) {
                await this.fileService.moveFile(fileName, 'rechazados', JSON.stringify({
                    estado: 'ERROR_COMUNICACION',
                    fechaProceso: new Date().toISOString(),
                    error: errorData
                }, null, 2), null, userPaths.userProcessedPath, userPaths.userRejectedPath);
            } else {
                await this.fileService.moveFile(fileName, 'rechazados', JSON.stringify({
                    estado: 'ERROR_COMUNICACION',
                    fechaProceso: new Date().toISOString(),
                    error: errorData
                }, null, 2), null, this.paths.procesados, this.paths.rechazados);
            }
            
            throw error;
        }
    }

    /**
     * Ejecutar el microservicio se encarga de ejecutar el proceso principal del microservicio
     * @returns {void}
     */
    async execute() {
        console.log('🚀 INICIANDO MICROSERVICIO RIPS\n');
        
        try {
            // 0. Crear carpetas necesarias
            await this.crearCarpetasNecesarias();

            if (this.useStaging) {
                // Flujo actual con porEnviar
                const archivosAjustados = await this.ajustarCarpetasJson();
                console.log(`📋 Archivos ajustados en esta ejecución: ${archivosAjustados.length}`);

                const archivosValidos = await this.validarArchivos();
                if (archivosValidos.length === 0) {
                    console.log('ℹ️ No hay archivos válidos para enviar');
                    console.log('📁 Estado actual:');
                    console.log(`   - Archivos ajustados: ${archivosAjustados.length}`);
                    console.log(`   - Archivos válidos en porEnviar: ${archivosValidos.length}`);
                    await this.fileService.getFolderStatus();
                    return;
                }

                console.log(`✅ Se encontraron ${archivosValidos.length} archivos válidos para enviar`);
                await this.authService.login();
                console.log(`\n📤 Enviando ${archivosValidos.length} archivos...`);
                let archivosEnviados = 0;
                let archivosRechazados = 0;
                for (const archivo of archivosValidos) {
                    try {
                        await this.sendRips(archivo);
                        archivosEnviados++;
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                        console.log(`❌ Error con ${archivo}, continuando con el siguiente...`);
                        archivosRechazados++;
                    }
                }
                console.log('\n✅ Proceso completado');
                console.log(`📊 Resumen:`);
                console.log(`   - Archivos enviados exitosamente: ${archivosEnviados}`);
                console.log(`   - Archivos rechazados: ${archivosRechazados}`);
                console.log(`   - Total procesados: ${archivosEnviados + archivosRechazados}`);
            } else {
                // Flujo sin porEnviar: procesar directamente en memoria
                console.log('🔧 PASO 0 (sin porEnviar): Ajustando y enviando directamente...');
                await fs.access(this.paths.base);
                const directoriosBase = await fs.readdir(this.paths.base, { withFileTypes: true });
                const carpetasUsuario = directoriosBase.filter(d => d.isDirectory() && !['porEnviar', 'procesados', 'rechazados'].includes(d.name.toLowerCase()));

                if (carpetasUsuario.length === 0) {
                    console.log('ℹ️ No se encontraron carpetas de usuario para procesar');
                    await this.fileService.getFolderStatus();
                    return;
                }

                await this.authService.login();

                let enviados = 0;
                let rechazados = 0;

                for (const direntUsuario of carpetasUsuario) {
                    const nombreCarpetaUsuario = direntUsuario.name;
                    const rutaCarpetaUsuario = path.join(this.paths.base, nombreCarpetaUsuario);
                    const rutaProcesadosUsuario = path.join(rutaCarpetaUsuario, 'procesados');
                    const rutaRechazadosUsuario = path.join(rutaCarpetaUsuario, 'rechazados');
                    await fs.mkdir(rutaProcesadosUsuario, { recursive: true });
                    await fs.mkdir(rutaRechazadosUsuario, { recursive: true });

                    const archivosEnCarpetaUsuario = await fs.readdir(rutaCarpetaUsuario, { withFileTypes: true });
                    const carpetasContenedoras = archivosEnCarpetaUsuario.filter(d => d.isDirectory() && !['procesados', 'rechazados'].includes(d.name.toLowerCase()));
                    for (const direntContenedora of carpetasContenedoras) {
                        const nombreCarpetaContenedora = direntContenedora.name;
                        const carpetaCompletaContenedora = path.join(rutaCarpetaUsuario, nombreCarpetaContenedora);
                        try {
                            const archivos = await fs.readdir(carpetaCompletaContenedora);
                            const jsonFile = archivos.find(f => f.toLowerCase().endsWith('.json'));
                            const xmlFile = archivos.find(f => f.toLowerCase().endsWith('.xml'));
                            if (!jsonFile || !xmlFile) {
                                console.warn(`⚠️ Archivos faltantes en carpeta ${nombreCarpetaUsuario}/${nombreCarpetaContenedora}, moviendo a rechazados`);
                                await this.fileService.moveFolder(carpetaCompletaContenedora, rutaRechazadosUsuario, `Archivos faltantes: JSON o XML`);
                                continue;
                            }

                            const jsonPath = path.join(carpetaCompletaContenedora, jsonFile);
                            const xmlPath = path.join(carpetaCompletaContenedora, xmlFile);
                            const jsonOriginal = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
                            const xmlBase64 = (await fs.readFile(xmlPath)).toString('base64');
                            const periodo = await extractInvoicePeriodWithXml2js(xmlPath);
                            const periodoFormateado = formatInvoicePeriod(periodo);
                            const nuevoJson = { rips: jsonOriginal, xmlFevFile: xmlBase64 };
                            const ajustado = await this.ajustarRIPS(nuevoJson, periodoFormateado);

                            const valid = await this.validarEstructuraRIPSObj(ajustado);
                            if (!valid.valido) {
                                await this.fileService.finalizeWithoutStaging(
                                    `${nombreCarpetaUsuario}_${nombreCarpetaContenedora}`,
                                    'rechazados',
                                    JSON.stringify({ estado: 'VALIDACION_FALLIDA', error: valid.error, fechaProceso: new Date().toISOString() }, null, 2),
                                    ajustado?.rips?.numFactura || nombreCarpetaContenedora,
                                    rutaProcesadosUsuario,
                                    rutaRechazadosUsuario,
                                    carpetaCompletaContenedora,
                                    ajustado
                                );
                                rechazados++;
                                continue;
                            }

                            // Enviar y finalizar
                            await this.sendRipsData(ajustado, `${nombreCarpetaUsuario}_${nombreCarpetaContenedora}`, rutaProcesadosUsuario, rutaRechazadosUsuario, carpetaCompletaContenedora);
                            enviados++;
                            await new Promise(r => setTimeout(r, 1000));
                        } catch (errorInterno) {
                            console.error(`❌ Error procesando ${nombreCarpetaUsuario}/${nombreCarpetaContenedora}:`, errorInterno.message);
                            await this.fileService.moveFolder(carpetaCompletaContenedora, rutaRechazadosUsuario, `Error: ${errorInterno.message}`);
                            rechazados++;
                        }
                    }
                }

                console.log('\n✅ Proceso completado (sin porEnviar)');
                console.log(`📊 Resumen:`);
                console.log(`   - Archivos enviados exitosamente: ${enviados}`);
                console.log(`   - Archivos rechazados: ${rechazados}`);
                console.log(`   - Total procesados: ${enviados + rechazados}`);
            }
            
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