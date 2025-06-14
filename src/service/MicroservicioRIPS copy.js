const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const ValidatorRIPS = require('../validator/rips.validator');
const hacerPeticionHTTPS = require('../helper/HttpClient');
const moment = require('moment');


const {
    extractInvoicePeriodWithXml2js,
    extractInvoicePeriodWithDOM,
    extractInvoicePeriodWithRegex,
    formatInvoicePeriod,
    extractFromXmlString
} =  require('../validator/extraerPeridos');

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
     * PASO 0: Ajustar carpetas JSON y enviar directamente a porEnviar
     */
    async ajustarCarpetasJson() {
        console.log('🔧 PASO 0: Ajustando carpetas JSON y enviando a porEnviar...');
        const archivosAjustados = [];

        try {
            // Verificar que existe la ruta base
            await fs.access(this.rutaBaseCarpetas);
            
            const carpetas = await fs.readdir(this.rutaBaseCarpetas, { withFileTypes: true });
            const carpetasDirectorios = carpetas.filter(dirent => dirent.isDirectory());

            if (carpetasDirectorios.length === 0) {
                console.log('ℹ️ No se encontraron carpetas para ajustar');
                return archivosAjustados;
            }

            console.log(`📁 Encontradas ${carpetasDirectorios.length} carpetas para revisar`);

            for (const dirent of carpetasDirectorios) {
                const nombreCarpeta = dirent.name;
                
                // Saltar carpetas que ya son de procesamiento (evitar procesar porEnviar, procesados, rechazados)
                if (['porEnviar', 'procesados', 'rechazados'].includes(nombreCarpeta) || 
                    nombreCarpeta.endsWith('_ajustada') || 
                    nombreCarpeta.endsWith('_procesada')) {
                    continue;
                }

                const carpetaCompleta = path.join(this.rutaBaseCarpetas, nombreCarpeta);
                const nombreArchivoAjustado = `${nombreCarpeta}_ajustado.json`;

                // Verificar si esta carpeta ya fue procesada anteriormente
                const yaFueProcesada = await this.verificarCarpetaProcesada(nombreCarpeta);
                if (yaFueProcesada) {
                    console.log(`⏩ Carpeta ${nombreCarpeta} ya fue procesada anteriormente, se omite`);
                    continue;
                }

                try {
                    const archivos = await fs.readdir(carpetaCompleta);
                    const jsonFile = archivos.find(f => f.toLowerCase().endsWith('.json'));
                    const xmlFile = archivos.find(f => f.toLowerCase().endsWith('.xml'));

                    if (!jsonFile || !xmlFile) {
                        console.warn(`⚠️ Archivos faltantes en carpeta ${nombreCarpeta}`);
                        // Marcar como procesada para no intentarlo de nuevo
                        await this.marcarCarpetaComoProcesada(nombreCarpeta, 'error_archivos_faltantes');
                        continue;
                    }

                    const jsonPath = path.join(carpetaCompleta, jsonFile);
                    const xmlPath = path.join(carpetaCompleta, xmlFile);


                  
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
                      console.log(`🔧 Ajustando carpeta: ${nombreCarpeta}`, nuevoJson);
                    console.log(`🔧 Ajustando carpeta: ${nombreCarpeta}`);
                    const newversion =  await this.ajustarRIPS(nuevoJson, periodoFormateado);

                    console.log("aqui la nueva version",newversion);
                    
                    // Escribir directamente en la carpeta porEnviar
                    const rutaArchivoEnPorEnviar = path.join(this.rutaArchivosPorEnviar, nombreArchivoAjustado);
                    await fs.writeFile(rutaArchivoEnPorEnviar, JSON.stringify(newversion, null, 2), 'utf8');

                    console.log(`✅ Ajustado y guardado en porEnviar: ${nombreArchivoAjustado}`);
                    archivosAjustados.push(nombreArchivoAjustado);

                    // Marcar la carpeta como procesada
                    await this.marcarCarpetaComoProcesada(nombreCarpeta, 'ajustado_exitosamente');

                } catch (errorInterno) {
                    console.error(`❌ Error en carpetasssss ${nombreCarpeta}:`, errorInterno.message);
                    // Marcar como procesada con error para no intentarlo de nuevo
                    await this.marcarCarpetaComoProcesada(nombreCarpeta, `error: ${errorInterno.message}`);
                }
            }

            console.log(`🔧 Proceso de ajuste completado. ${archivosAjustados.length} archivos ajustados y guardados en porEnviar`);
            return archivosAjustados;

        } catch (errorGeneral) {
            console.error('❌ Error al procesar carpetas bbb:', errorGeneral.message);
            throw errorGeneral;
        }
    }

    async ajustarRIPS (ripsData, periodoFacturacion)  {
  console.log(`🔧 Ajustando RIPS.............................................................`);
  
    if (!ripsData || !ripsData.rips || !ripsData.rips.usuarios) {
        throw new Error('Datos RIPS inválidos o incompletos');
    }
    let ajustesRealizados = 0;

    // Recorrer todos los usuarios
    ripsData.rips.usuarios.forEach(usuario => {
        // Ajustar condicionDestinoUsuarioEgreso en urgencias
        if (usuario.servicios.urgencias && usuario.servicios.urgencias.length > 0) {
            usuario.servicios.urgencias.forEach((urgencia, urgindex) => {
                if (urgencia.condicionDestinoUsuarioEgreso && urgencia.condicionDestinoUsuarioEgreso.length === 1) {
                    const antes = urgencia.condicionDestinoUsuarioEgreso;
                    urgencia.condicionDestinoUsuarioEgreso = `0${urgencia.condicionDestinoUsuarioEgreso}`;
                    console.log(`📝 Ajustado condicionDestinoUsuarioEgreso:`);
                    console.log(`   Antes: "${antes}" → Después: "${urgencia.condicionDestinoUsuarioEgreso}"`);
                    ajustesRealizados++;
                }
                if (urgencia.fechaEgreso) {
    console.log("↪️ Validando fecha de egreso");
    
    try {
        // 1. Función mejorada de normalización
        const normalizarFecha = (fecha) => {
            // Primero intentar con formato ISO (UTC)
            let fechaMoment = moment.utc(fecha, moment.ISO_8601, true);
            
            // Si no es válido, intentar otros formatos locales
            if (!fechaMoment.isValid()) {
                const formatosLocales = [
                    'YYYY-MM-DD HH:mm:ss',
                    'YYYY-MM-DD HH:mm',
                    'YYYY-MM-DD',
                    'DD/MM/YYYY HH:mm:ss',
                    'DD/MM/YYYY HH:mm',
                    'DD/MM/YYYY'
                ];
                fechaMoment = moment(fecha, formatosLocales, true);
            }
            
            // Si sigue sin ser válido, intentar parsing flexible
            if (!fechaMoment.isValid()) {
                fechaMoment = moment(fecha);
                console.warn("⚠️ Usando parsing flexible para fecha:", fecha);
            }
            
            return fechaMoment;
        };

        // 2. Normalizar fechas del período (convertir a local time primero)
        const inicioPeriodo = moment(periodoFacturacion.startDateTime).local();
        const finPeriodo = moment(periodoFacturacion.endDateTime).local();
        
        // Ajustar finPeriodo para que sea el mismo día que endDate
        if (finPeriodo.format('YYYY-MM-DD') !== periodoFacturacion.endDate) {
            console.warn("⚠️ Ajustando finPeriodo para coincidir con endDate");
            finPeriodo.set({
                year: moment(periodoFacturacion.endDate).year(),
                month: moment(periodoFacturacion.endDate).month(),
                date: moment(periodoFacturacion.endDate).date(),
                hour: 23,
                minute: 59,
                second: 59
            });
        }

        // 3. Normalizar fecha de egreso
        const fechaEgreso = normalizarFecha(urgencia.fechaEgreso).local();

        // 4. Validaciones
        if (!fechaEgreso.isValid()) {
            console.error(`❌ Fecha de egreso inválida: ${urgencia.fechaEgreso}`);
            return;
        }

        // 5. Comparación y ajuste
        console.log('🔍 Rango de fechas válido:', 
            inicioPeriodo.format('YYYY-MM-DD HH:mm:ss'), 
            'a', 
            finPeriodo.format('YYYY-MM-DD HH:mm:ss'));

        if (fechaEgreso.isBefore(inicioPeriodo)) {
            console.log(`📅 Fecha anterior al período (${fechaEgreso.format('YYYY-MM-DD HH:mm:ss')})`);
            urgencia.fechaEgreso = inicioPeriodo.format('YYYY-MM-DD HH:mm');
            ajustesRealizados++;
        } else if (fechaEgreso.isAfter(finPeriodo)) {
            console.log(`📅 Fecha posterior al período (${fechaEgreso.format('YYYY-MM-DD HH:mm:ss')})`);
            urgencia.fechaEgreso = finPeriodo.format('YYYY-MM-DD HH:mm');
            ajustesRealizados++;
        } else {
            console.log(`✅ Fecha dentro del período válido`);
            // Formatear fecha al formato deseado
            urgencia.fechaEgreso = fechaEgreso.format('YYYY-MM-DD HH:mm');
        }

        // 6. Log detallado
        console.log('📝 Resultado final:', {
            fechaOriginal: urgencia.fechaEgreso,
            fechaAjustada: urgencia.fechaEgreso,
            periodo: {
                start: inicioPeriodo.format('YYYY-MM-DD HH:mm:ss'),
                end: finPeriodo.format('YYYY-MM-DD HH:mm:ss')
            }
        });
        
    } catch (error) {
        console.error(`💥 Error en validación de fechas:`, error);
        console.error('Contexto:', {
            fechaEgreso: urgencia.fechaEgreso,
            periodo: periodoFacturacion
        });
    }
} else {
    console.log('⚠️ Sin fecha de egreso');
}

            });
        }


       ///Ajustando Consultas
        if (usuario.servicios.consultas && usuario.servicios.consultas.length > 0) {
            usuario.servicios.consultas.forEach((consulta, index) => {
                if (consulta.fechaInicioAtencion) {
                    // Tu lógica original - ajustar formato si es necesario
                    if (consulta.fechaInicioAtencion.length === 1) {
                        const antes = consulta.fechaInicioAtencion;
                        consulta.fechaInicioAtencion = `${consulta.fechaInicioAtencion}`;
                        console.log(`📝 Ajustado fechaInicioAtencion:`);
                        console.log(`   Antes: "${antes}" → Después: "${consulta.fechaInicioAtencion}"`);
                        ajustesRealizados++;
                    }
                    
                    // Validar si la fecha está dentro del período de facturación
                    try {
                        let fechaServicio;
                        
                        // Parsear la fecha del servicio
                        if (consulta.fechaInicioAtencion.includes('/')) {
                            // Formato: DD/MM/YYYY HH:mm:ss
                            const [fechaParte] = consulta.fechaInicioAtencion.split(' ');
                            const [dia, mes, año] = fechaParte.split('/');
                            fechaServicio = new Date(`${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`);
                        } else {
                            // Formato: YYYY-MM-DD
                            fechaServicio = new Date(consulta.fechaInicioAtencion.split(' ')[0]);
                        }
                        
                        // Crear fechas del período de facturación (solo fecha, sin hora)
                        const fechaInicio = new Date(periodoFacturacion.startDate);
                        const fechaFin = new Date(periodoFacturacion.endDate);
                        
                        // Verificar si la fecha está fuera del período
                        if (fechaServicio < fechaInicio || fechaServicio > fechaFin) {
                            const fechaOriginal = consulta.fechaInicioAtencion;
                            
                            // Extraer la hora original si existe
                            const [, horaOriginal] = fechaOriginal.split(' ');
                            const hora = horaOriginal || '00:00:00';
                            
                            // Crear nueva fecha usando endDate del período
                            const [año, mes, dia] = periodoFacturacion.endDate.split('-');
                            let fechaNueva;
                            
                            if (fechaOriginal.includes('/')) {
                                // Mantener formato DD/MM/YYYY HH:mm:ss
                                fechaNueva = `${dia}/${mes}/${año} ${hora}`;
                            } else {
                                // Mantener formato YYYY-MM-DD HH:mm:ss
                                fechaNueva = `${periodoFacturacion.endDate} ${hora}`;
                            }
                            
                            consulta.fechaInicioAtencion = fechaNueva;
                            
                            console.log(`⚠️  Consulta[${index}] - fecha fuera del período:`);
                            console.log(`   Fecha original: ${fechaOriginal}`);
                            console.log(`   Período válido: ${periodoFacturacion.startDate} al ${periodoFacturacion.endDate}`);
                            console.log(`   ✅ Fecha ajustada: ${fechaNueva}`);
                            ajustesRealizados++;
                        }
                        
                    } catch (error) {
                        console.error(`❌ Error validando fecha en consulta[${index}]:`, error.message);
                    }
                }
            });
        }

        ///Ajustar Hospitalizacion 
         if (usuario.servicios.hospitalizacion && usuario.servicios.hospitalizacion.length > 0) {
            usuario.servicios.hospitalizacion.forEach(hospita => {
                if (hospita.viaIngresoServicioSalud && hospita.viaIngresoServicioSalud.length === 1) {
                    const antes = hospita.viaIngresoServicioSalud;
                    hospita.viaIngresoServicioSalud = `02`;
                    console.log(`📝 Ajustado viaIngresoServicioSalud:`);
                    console.log(`   Antes: "${antes}" → Después: "${hospita.viaIngresoServicioSalud}"`);
                    ajustesRealizados++;
                }
                if (hospita.condicionDestinoUsuarioEgreso.trim() === '') {
                    const antes = hospita.condicionDestinoUsuarioEgreso;
                    hospita.condicionDestinoUsuarioEgreso = `01`;
                    console.log(`📝 Ajustado condicionDestinoUsuarioEgreso:`);
                    console.log(`   Antes: "${antes}" → Después: "${hospita.condicionDestinoUsuarioEgreso}"`);
                    ajustesRealizados++;
                }
                  if (hospita.fechaInicioAtencion) {
                    // Tu lógica original - ajustar formato si es necesario
                    if (hospita.fechaInicioAtencion.length === 1) {
                        const antes = hospita.fechaInicioAtencion;
                        hospita.fechaInicioAtencion = `${hospita.fechaInicioAtencion}`;
                        console.log(`📝 Ajustado fechaInicioAtencion:`);
                        console.log(`   Antes: "${antes}" → Después: "${hospita.fechaInicioAtencion}"`);
                        ajustesRealizados++;
                    }
                    
                    // Validar si la fecha está dentro del período de facturación
                    try {
                        let fechaServicio;
                        
                        // Parsear la fecha del servicio
                        if (hospita.fechaInicioAtencion.includes('/')) {
                            // Formato: DD/MM/YYYY HH:mm:ss
                            const [fechaParte] = hospita.fechaInicioAtencion.split(' ');
                            const [dia, mes, año] = fechaParte.split('/');
                            fechaServicio = new Date(`${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`);
                        } else {
                            // Formato: YYYY-MM-DD
                            fechaServicio = new Date(hospita.fechaInicioAtencion.split(' ')[0]);
                        }
                        
                        // Crear fechas del período de facturación (solo fecha, sin hora)
                        const fechaInicio = new Date(periodoFacturacion.startDate);
                        const fechaFin = new Date(periodoFacturacion.endDate);
                        
                        // Verificar si la fecha está fuera del período
                        if (fechaServicio < fechaInicio || fechaServicio > fechaFin) {
                            const fechaOriginal = hospita.fechaInicioAtencion;
                            
                            // Extraer la hora original si existe
                            const [, horaOriginal] = fechaOriginal.split(' ');
                            const hora = horaOriginal || '00:00:00';
                            
                            // Crear nueva fecha usando endDate del período
                            const [año, mes, dia] = periodoFacturacion.endDate.split('-');
                            let fechaNueva;
                            
                            if (fechaOriginal.includes('/')) {
                                // Mantener formato DD/MM/YYYY HH:mm:ss
                                fechaNueva = `${dia}/${mes}/${año} ${hora}`;
                            } else {
                                // Mantener formato YYYY-MM-DD HH:mm:ss
                                fechaNueva = `${periodoFacturacion.endDate} ${hora}`;
                            }
                            
                            hospita.fechaInicioAtencion = fechaNueva;
                            
                            console.log(`⚠️  Consulta[${index}] - fecha fuera del período:`);
                            console.log(`   Fecha original: ${fechaOriginal}`);
                            console.log(`   Período válido: ${periodoFacturacion.startDate} al ${periodoFacturacion.endDate}`);
                            console.log(`   ✅ Fecha ajustada: ${fechaNueva}`);
                            ajustesRealizados++;
                        }
                        
                    } catch (error) {
                        console.error(`❌ Error validando fecha en consulta[${index}]:`, error.message);
                    }
                }
            });
        }

        // Ajustar diasTratamiento en medicamentos
        if (usuario.servicios.medicamentos && usuario.servicios.medicamentos.length > 0) {
            usuario.servicios.medicamentos.forEach(medicamento => {
                if (medicamento.diasTratamiento === 0) {
                    const antes = medicamento.diasTratamiento;
                    medicamento.diasTratamiento = 1;
                    console.log(`📝 Ajustado diasTratamiento:`);
                    console.log(`   Antes: ${antes} → Después: ${medicamento.diasTratamiento}`);
                    ajustesRealizados++;
                }
            });
        }

        // Ajustar diasTratamiento en Procedimientos
            if (usuario.servicios.procedimientos && usuario.servicios.procedimientos.length > 0) {
                usuario.servicios.procedimientos.forEach((procedimiento, procedimientoIndex) => {
                    
                    // 1. Ajustar finalidadTecnologiaSalud - LÓGICA CORREGIDA
                    if (procedimiento.finalidadTecnologiaSalud && 
                        procedimiento.finalidadTecnologiaSalud.toString().length === 1) {
                        const antes = procedimiento.finalidadTecnologiaSalud;
                        procedimiento.finalidadTecnologiaSalud = "44";
                        console.log(`📝 Procedimiento[${procedimientoIndex}] - Ajustado finalidadTecnologiaSalud:`);
                        console.log(`   Antes: ${antes} → Después: ${procedimiento.finalidadTecnologiaSalud}`);
                        ajustesRealizados++;
                    }
                    
                    // 2. Procesar fechaInicioAtencion
                    if (procedimiento.fechaInicioAtencion) {
                        // Remover lógica redundante de ajuste de longitud
                        
                        // Validar si la fecha está dentro del período de facturación
                        try {
                            const fechaServicio = parsearFecha(procedimiento.fechaInicioAtencion);
                            
                            if (!fechaServicio) {
                                console.error(`❌ Procedimiento[${procedimientoIndex}] - Formato de fecha inválido: ${procedimiento.fechaInicioAtencion}`);
                                return;
                            }
                            
                            // Crear fechas del período de facturación (solo fecha, sin hora)
                            const fechaInicio = new Date(periodoFacturacion.startDate);
                            const fechaFin = new Date(periodoFacturacion.endDate);
                            
                            // Verificar si la fecha está fuera del período
                            if (fechaServicio < fechaInicio || fechaServicio > fechaFin) {
                                const fechaOriginal = procedimiento.fechaInicioAtencion;
                                const fechaNueva =  ajustarFechaAlPeriodo(fechaOriginal, periodoFacturacion.endDate);
                                
                                procedimiento.fechaInicioAtencion = fechaNueva;
                                
                                console.log(`⚠️  Procedimiento[${procedimientoIndex}] - fecha fuera del período:`);
                                console.log(`   Fecha original: ${fechaOriginal}`);
                                console.log(`   Período válido: ${periodoFacturacion.startDate} al ${periodoFacturacion.endDate}`);
                                console.log(`   ✅ Fecha ajustada: ${fechaNueva}`);
                                ajustesRealizados++;
                            }
                            
                        } catch (error) {
                            console.error(`❌ Error validando fecha en Procedimiento[${procedimientoIndex}]:`, error.message);
                            console.error(`   Fecha problemática: ${procedimiento.fechaInicioAtencion}`);
                        }
                    }
                });
            }
        //Ajustando servicios esto es personalizado
        if (usuario.servicios.otrosServicios && usuario.servicios.otrosServicios.length > 0) {
            usuario.servicios.otrosServicios.forEach(otros => {
                if (otros.codTecnologiaSalud && otros.codTecnologiaSalud === 'TAB-SC-URBU') {
                    const antes = otros.codTecnologiaSalud;
                    otros.codTecnologiaSalud  = `T2387G`;
                    console.log(`📝 Ajustado codTecnologiaSalud:`);
                    console.log(`   Antes: ${antes} → Después: ${otros.codTecnologiaSalud}`);
                    ajustesRealizados++;
                }
            });
        }


    });

    console.log(`✅ Total de ajustes realizados: ${ajustesRealizados}`);
    return ripsData;
}


    async parsearFecha(fechaString) {
    try {
        let fechaServicio;
        
        if (fechaString.includes('/')) {
            // Formato: DD/MM/YYYY HH:mm:ss o DD/MM/YYYY
            const [fechaParte] = fechaString.split(' ');
            const [dia, mes, año] = fechaParte.split('/');
            
            // Validar que tenemos los 3 componentes
            if (!dia || !mes || !año) {
                throw new Error(`Formato DD/MM/YYYY incompleto: ${fechaString}`);
            }
            
            fechaServicio = new Date(`${año}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`);
        } else {
            // Formato: YYYY-MM-DD HH:mm:ss o YYYY-MM-DD
            const fechaParte = fechaString.split(' ')[0];
            fechaServicio = new Date(fechaParte);
        }
        
        // Verificar que la fecha es válida
        if (isNaN(fechaServicio.getTime())) {
            throw new Error(`Fecha inválida: ${fechaString}`);
        }
        
        return fechaServicio;
    } catch (error) {
        console.error(`Error parseando fecha: ${fechaString}`, error.message);
        return null;
    }
}

async ajustarFechaAlPeriodo(fechaOriginal, fechaFinPeriodo) {
    // Extraer la hora original si existe
    const [, horaOriginal] = fechaOriginal.split(' ');
    const hora = horaOriginal || '00:00:00';
    
    // Crear nueva fecha usando endDate del período
    const [año, mes, dia] = fechaFinPeriodo.split('-');
    
    if (fechaOriginal.includes('/')) {
        // Mantener formato DD/MM/YYYY HH:mm:ss
        return `${dia}/${mes}/${año} ${hora}`;
    } else {
        // Mantener formato YYYY-MM-DD HH:mm:ss
        return `${fechaFinPeriodo} ${hora}`;
    }
}

    /**
     * Verificar si una carpeta ya fue procesada anteriormente
     */
    async verificarCarpetaProcesada(nombreCarpeta) {
        try {
            const archivoControl = path.join(this.rutaBaseCarpetas, '.carpetas_procesadas.json');
            const contenido = await fs.readFile(archivoControl, 'utf8');
            const carpetasProcesadas = JSON.parse(contenido);
            
            return carpetasProcesadas.hasOwnProperty(nombreCarpeta);
        } catch (error) {
            // Si no existe el archivo de control, significa que no hay carpetas procesadas
            return false;
        }
    }

    /**
     * Marcar una carpeta como procesada
     */
    async marcarCarpetaComoProcesada(nombreCarpeta, estado) {
        try {
            const archivoControl = path.join(this.rutaBaseCarpetas, '.carpetas_procesadas.json');
            
            let carpetasProcesadas = {};
            try {
                const contenido = await fs.readFile(archivoControl, 'utf8');
                carpetasProcesadas = JSON.parse(contenido);
            } catch (error) {
                // Si no existe el archivo, se crea uno nuevo
            }
            
            carpetasProcesadas[nombreCarpeta] = {
                fechaProcesamiento: new Date().toISOString(),
                estado: estado
            };
            
            await fs.writeFile(archivoControl, JSON.stringify(carpetasProcesadas, null, 2), 'utf8');
            
        } catch (error) {
            console.log(`⚠️ No se pudo marcar carpeta ${nombreCarpeta} como procesada: ${error.message}`);
        }
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
                    await this.moverArchivo(archivo, 'rechazados', `Validación fallida: ${esValido.error}`);
                }
            }
            
            return archivosValidos;
            
        } catch (error) {
            console.log(`❌ Error validando archivos: ${error.message}`);
            return [];
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
                    numero: "4450739"
                }
            },
            clave: "H0sp1t4l2025*",
            nit: "810000913",
        };

        try {
            const httpClient = new hacerPeticionHTTPS();
            const response = await httpClient.hacerPeticionHTTPS('POST', '/Auth/LoginSISPRO', loginData);
            
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

        const httpClient = new hacerPeticionHTTPS();
        const response = await httpClient.hacerPeticionHTTPS('POST', '/PaquetesFevRips/CargarFevRips', jsonData, {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        });

        console.log(`📡 ${nombreArchivo} enviado al servidor`);

        // Evaluar ResultState para determinar el destino
        const resultState = response?.ResultState;
        const cuv = response?.CodigoUnicoValidacion;
        
        // Buscar CUV en casos de duplicados (error RVG18)
        let cuvEncontrado = cuv;
        let esDuplicado = false;
        
        if (resultState === false && response?.ResultadosValidacion) {
            // Buscar error RVG18 (CUV ya aprobado previamente)
            const errorDuplicado = response.ResultadosValidacion.find(r => 
                r.Clase === 'RECHAZADO' && r.Codigo === 'RVG18'
            );
            
            if (errorDuplicado && errorDuplicado.Observaciones) {
                // El CUV viene en las observaciones del error RVG18
                cuvEncontrado = errorDuplicado.Observaciones.trim();
                esDuplicado = true;
                console.log(`🔄 Archivo ya procesado anteriormente`);
                console.log(`🎯 CUV recuperado de proceso anterior: ${cuvEncontrado}`);
            }
            
            // También buscar en RVG02 por si viene ahí
            if (!cuvEncontrado || cuvEncontrado.includes('No aplica')) {
                const errorRVG02 = response.ResultadosValidacion.find(r => 
                    r.Clase === 'RECHAZADO' && r.Codigo === 'RVG02'
                );
                
                if (errorRVG02 && errorRVG02.Observaciones) {
                    // Extraer CUV del texto de observaciones usando regex
                    const matchCUV = errorRVG02.Observaciones.match(/CUV\s+([a-f0-9]{64})/i);
                    if (matchCUV && matchCUV[1]) {
                        cuvEncontrado = matchCUV[1];
                        esDuplicado = true;
                        console.log(`🎯 CUV extraído de RVG02: ${cuvEncontrado}`);
                    }
                }
            }
        }
        
        if (resultState === true) {
            // Éxito - mover a procesados
            console.log(`✅ ${nombreArchivo} procesado exitosamente`);
            if (cuvEncontrado && !cuvEncontrado.includes('No aplica')) {
                console.log(`🎯 CUV obtenido: ${cuvEncontrado}`);
            }
            
            await this.moverArchivo(nombreArchivo, 'procesados', JSON.stringify({
                estado: 'EXITOSO',
                fechaProceso: new Date().toISOString(),
                cuv: cuvEncontrado,
                respuestaCompleta: response
            }, null, 2));
            
            return { success: true, response, cuv: cuvEncontrado };
            
        } else if (esDuplicado && cuvEncontrado && !cuvEncontrado.includes('No aplica')) {
            // Archivo duplicado pero con CUV válido - mover a procesados
            console.log(`✅ ${nombreArchivo} ya fue procesado anteriormente (duplicado)`);
            
            await this.moverArchivo(nombreArchivo, 'procesados', JSON.stringify({
                estado: 'DUPLICADO_CON_CUV',
                fechaProceso: new Date().toISOString(),
                cuv: cuvEncontrado,
                motivo: 'Archivo ya procesado en proceso anterior',
                respuestaCompleta: response
            }, null, 2));
            
            return { success: true, response, cuv: cuvEncontrado, isDuplicate: true };
            
        } else {
            // Rechazado - mover a rechazados
            console.log(`❌ ${nombreArchivo} rechazado por el servidor`);
            
            // Mostrar errores específicos
            if (response?.ResultadosValidacion) {
                const errores = response.ResultadosValidacion.filter(r => r.Clase === 'RECHAZADO');
                const notificaciones = response.ResultadosValidacion.filter(r => r.Clase === 'NOTIFICACION');
                
                if (errores.length > 0) {
                    console.log(`🚫 Errores encontrados (${errores.length}):`);
                    errores.forEach((error, index) => {
                        console.log(`   ${index + 1}. [${error.Codigo}] ${error.Descripcion}`);
                        if (error.Observaciones) {
                            console.log(`      📌 ${error.Observaciones}`);
                        }
                    });
                }
                
                if (notificaciones.length > 0) {
                    console.log(`⚠️ Notificaciones (${notificaciones.length})`);
                }
            }
            
            await this.moverArchivo(nombreArchivo, 'rechazados', JSON.stringify({
                estado: 'RECHAZADO',
                fechaProceso: new Date().toISOString(),
                motivo: 'ResultState: false',
                cuv: cuvEncontrado || null,
                respuestaCompleta: response
            }, null, 2));
            
            return { success: false, response, errors: response?.ResultadosValidacion, cuv: cuvEncontrado };
        }

   } catch (error) {
    console.log(`❌ Error enviando ${nombreArchivo}: ${error.message}`);
    
    // Si es HTTP 400, extraer solo los errores, sino el mensaje completo
    const errorData = error.message.includes('HTTP 400:') 
        ? JSON.parse(error.message.split('HTTP 400: ')[1]).ResultadosValidacion?.filter(r => r.Clase === 'RECHAZADO') || error.message
        : error.message;
    
    await this.moverArchivo(nombreArchivo, 'rechazados', JSON.stringify({
        estado: 'ERROR_COMUNICACION',
        fechaProceso: new Date().toISOString(),
        error: errorData
    }, null, 2));
    
    throw error;
}
}

/**
 * Mover archivo con información extendida
 */
async moverArchivo(nombreArchivo, tipoDestino, datosAdicionales ) {
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
        
        // Mostrar información adicional
        if (datosAdicionales.cuv) {
            console.log(`   🎯 CUV: ${datosAdicionales.cuv}`);
        }
        if (datosAdicionales.motivo) {
            console.log(`   📝 Motivo: ${datosAdicionales.motivo}`);
        }
        if (datosAdicionales.isDuplicate) {
            console.log(`   🔄 Archivo duplicado procesado exitosamente`);
        }
        
        // Crear archivo de log con detalles del procesamiento
        await this.crearLogProcesamientoMejorado(nombreArchivo, tipoDestino, datosAdicionales, rutaDestino);
        
    } catch (error) {
        console.log(`⚠️ No se pudo mover ${nombreArchivo}: ${error.message}`);
    }
}

/**
 * Crear log de procesamiento mejorado con más información
 */
async crearLogProcesamientoMejorado(nombreArchivo, estado, datosAdicionales, rutaArchivo) {
    try {
       const datosAdicionales1 = JSON.parse(datosAdicionales);
       const fileName = nombreArchivo;
        const baseName = path.parse(fileName).name; // "1596447_ajustado"
        const number = baseName.split('_')[0]; // "1596447"
        
            const logData = {
            factura: number,
            cuv: datosAdicionales1.cuv || null,
            errores: estado === 'procesados'
                ? ''
                : estado === 'rechazados'
                    ? (datosAdicionales1.respuestaCompleta ?? datosAdicionales1.error ?? null)
                    : null
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
        
        // Crear archivo separado con respuesta completa si es necesario
        if (datosAdicionales1.response && (estado === 'rechazados' || datosAdicionales1.guardarRespuesta)) {
            const nombreRespuesta = `respuesta_${path.basename(nombreArchivo, path.extname(nombreArchivo))}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
            const rutaRespuesta = path.join(path.dirname(rutaArchivo), 'respuestas', nombreRespuesta);
            
            // Crear carpeta respuestas si no existe
            const carpetaRespuestas = path.dirname(rutaRespuesta);
            await fs.mkdir(carpetaRespuestas, { recursive: true });
            
            await fs.writeFile(rutaRespuesta, JSON.stringify(datosAdicionales1.response, null, 2), 'utf8');
        }
        
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
            
            // 1. Ajustar carpetas JSON y guardar directamente en porEnviar
            const archivosAjustados = await this.ajustarCarpetasJson();
            console.log(`📋 Archivos ajustados en esta ejecución: ${archivosAjustados.length}`);
            
            // 2. Validar archivos (ahora incluye tanto los ajustados como cualquier otro que esté en porEnviar)
            const archivosValidos = await this.validarArchivos();
            
            if (archivosValidos.length === 0) {
                console.log('ℹ️ No hay archivos válidos para enviar');
                console.log('📁 Estado actual:');
                console.log(`   - Archivos ajustados: ${archivosAjustados.length}`);
                console.log(`   - Archivos válidos en porEnviar: ${archivosValidos.length}`);
                
                // Verificar si hay archivos en las otras carpetas para dar contexto
                await this.mostrarEstadoCarpetas();
                return;
            }

            console.log(`✅ Se encontraron ${archivosValidos.length} archivos válidos para enviar`);

            // 3. Hacer login
            await this.loginSISPRO();

            // 4. Enviar cada archivo válido
            console.log(`\n📤 Enviando ${archivosValidos.length} archivos...`);
            
            let archivosEnviados = 0;
            let archivosRechazados = 0;
            
            for (const archivo of archivosValidos) {
                try {
                    await this.enviarRIPS(archivo);
                    archivosEnviados++;
                    
                    // Esperar un poco entre envíos
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
            
        } catch (error) {
            console.log(`❌ Error general: ${error.message}`);
        }
    }

    /**
     * Mostrar estado de todas las carpetas para dar contexto al usuario
     */
    async mostrarEstadoCarpetas() {
        console.log('\n📁 Estado de las carpetas:');
        
        try {
            // Contar archivos en cada carpeta
            const carpetas = [
                { nombre: 'porEnviar', ruta: this.rutaArchivosPorEnviar },
                { nombre: 'procesados', ruta: this.rutaArchivosEnviados },
                { nombre: 'rechazados', ruta: this.rutaArchivosRechazados }
            ];
            
            for (const carpeta of carpetas) {
                try {
                    const archivos = await fs.readdir(carpeta.ruta);
                    const archivosJSON = archivos.filter(archivo => archivo.toLowerCase().endsWith('.json'));
                    console.log(`   - ${carpeta.nombre}: ${archivosJSON.length} archivos JSON`);
                } catch (error) {
                    console.log(`   - ${carpeta.nombre}: No accesible o vacía`);
                }
            }
            
            // Contar carpetas originales sin procesar
            try {
                const carpetas = await fs.readdir(this.rutaBaseCarpetas, { withFileTypes: true });
                const carpetasSinProcesar = carpetas.filter(dirent => 
                    dirent.isDirectory() && 
                    !['porEnviar', 'procesados', 'rechazados'].includes(dirent.name) &&
                    !dirent.name.endsWith('_ajustada')
                ).length;
                
                console.log(`   - Carpetas originales sin procesar: ${carpetasSinProcesar}`);
                
                if (carpetasSinProcesar === 0) {
                    console.log('✅ Todas las carpetas han sido procesadas');
                }
                
            } catch (error) {
                console.log('   - Error verificando carpetas originales');
            }
            
        } catch (error) {
            console.log('❌ Error mostrando estado de carpetas');
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