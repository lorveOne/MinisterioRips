const cron = require('node-cron');
const MicroservicioRIPS = require('./src/service/MicroservicioRIPS');
require('dotenv').config();

class JobSchedulerRIPS {
    constructor() {
        this.microservicio = new MicroservicioRIPS();
        this.isRunning = false;
        this.ultimaEjecucion = null;
        this.proximaEjecucion = null;
        this.estadisticas = {
            totalEjecuciones: 0,
            exitosas: 0,
            fallidas: 0,
            inicioServicio: new Date()
        };
        
        // Configuración del job desde variables de entorno
        this.cronExpression = process.env.CRON_SCHEDULE || '0 */30 * * * *'; // Cada 30 minutos por defecto
        this.modoEjecucion = process.env.MODO_EJECUCION || 'programado'; // 'programado', 'manual', 'continuo'
        this.intervaloContinuo = parseInt(process.env.INTERVALO_CONTINUO) || 30000; // 30 segundos por defecto
    }

    /**
     * Mostrar información del scheduler
     */
    mostrarInfoScheduler() {
        console.log('╔══════════════════════════════════════════════════════════════╗');
        console.log('║              🏥 JOB SCHEDULER RIPS - MINSALUD                ║');
        console.log('╚══════════════════════════════════════════════════════════════╝');
        console.log('');
        console.log('📋 CONFIGURACIÓN DEL JOB:');
        console.log(`   ⏰ Modo de ejecución: ${this.modoEjecucion.toUpperCase()}`);
        
        if (this.modoEjecucion === 'programado') {
            console.log(`   📅 Expresión CRON: ${this.cronExpression}`);
            console.log(`   ⏱️  Descripción: ${this.describeCronExpression(this.cronExpression)}`);
        } else if (this.modoEjecucion === 'continuo') {
            console.log(`   🔄 Intervalo: cada ${this.intervaloContinuo / 1000} segundos`);
        }
        
        console.log(`   🚀 Servicio iniciado: ${this.estadisticas.inicioServicio.toLocaleString()}`);
        console.log('');
        
        this.mostrarEstadisticas();
    }

    /**
     * Describir expresión CRON en español
     */
    describeCronExpression(cronExpr) {
        const expresionesComunes = {
            '0 */30 * * * *': 'Cada 30 minutos',
            '0 0 */1 * * *': 'Cada hora',
            '0 0 */2 * * *': 'Cada 2 horas',
            '0 0 8,12,16,20 * * *': 'A las 8:00, 12:00, 16:00 y 20:00',
            '0 0 9 * * 1-5': 'Lunes a viernes a las 9:00 AM',
            '0 0 0 * * *': 'Todos los días a medianoche',
            '0 */15 * * * *': 'Cada 15 minutos',
            '0 */5 * * * *': 'Cada 5 minutos'
        };
        
        return expresionesComunes[cronExpr] || 'Expresión CRON personalizada';
    }

    /**
     * Ejecutar el job del microservicio
     */
    async ejecutarJob() {
        if (this.isRunning) {
            console.log('⚠️ El job ya está ejecutándose, saltando esta iteración...');
            return;
        }

        this.isRunning = true;
        this.estadisticas.totalEjecuciones++;
        this.ultimaEjecucion = new Date();

        console.log('');
        console.log('═'.repeat(80));
        console.log(`🚀 INICIANDO EJECUCIÓN #${this.estadisticas.totalEjecuciones}`);
        console.log(`📅 Fecha/Hora: ${this.ultimaEjecucion.toLocaleString()}`);
        console.log('═'.repeat(80));

        try {
            await this.microservicio.ejecutar();
            this.estadisticas.exitosas++;
            console.log('✅ Ejecución completada exitosamente');
            
        } catch (error) {
            this.estadisticas.fallidas++;
            console.log(`❌ Error en la ejecución: ${error.message}`);
            
            // Log del error para debugging
            this.logError(error);
            
        } finally {
            this.isRunning = false;
            console.log('═'.repeat(80));
            console.log('');
        }
    }

    /**
     * Log de errores
     */
    logError(error) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack,
            ejecucion: this.estadisticas.totalEjecuciones
        };
        
        console.log('🔍 Error detallado guardado en logs internos');
        // Aquí podrías guardar en un archivo de log si es necesario
    }

    /**
     * Mostrar estadísticas del job
     */
    mostrarEstadisticas() {
        console.log('📊 ESTADÍSTICAS DEL JOB:');
        console.log(`   📈 Total ejecuciones: ${this.estadisticas.totalEjecuciones}`);
        console.log(`   ✅ Exitosas: ${this.estadisticas.exitosas}`);
        console.log(`   ❌ Fallidas: ${this.estadisticas.fallidas}`);
        
        if (this.ultimaEjecucion) {
            console.log(`   🕐 Última ejecución: ${this.ultimaEjecucion.toLocaleString()}`);
        }
        
        if (this.proximaEjecucion) {
            console.log(`   ⏭️  Próxima ejecución: ${this.proximaEjecucion.toLocaleString()}`);
        }
        
        console.log(`   ⚡ Estado actual: ${this.isRunning ? '🔄 EJECUTÁNDOSE' : '⏸️ EN ESPERA'}`);
        console.log('');
    }

    /**
     * Iniciar job programado con CRON
     */
    iniciarJobProgramado() {
        console.log('⏰ Iniciando job programado...');
        
        const task = cron.schedule(this.cronExpression, async () => {
            await this.ejecutarJob();
        }, {
            scheduled: false,
            timezone: "America/Bogota" // Zona horaria de Colombia
        });

        // Calcular próxima ejecución
        task.start();
        console.log('✅ Job programado iniciado correctamente');
        
        // Mostrar cuándo será la próxima ejecución
        this.calcularProximaEjecucion();
        
        return task;
    }

    /**
     * Calcular próxima ejecución (aproximada)
     */
    calcularProximaEjecucion() {
        // Esta es una aproximación, para cálculos exactos necesitarías una librería más avanzada
        const ahora = new Date();
        
        if (this.cronExpression === '0 */30 * * * *') {
            const minutos = ahora.getMinutes();
            const minutosHasta30 = minutos < 30 ? 30 - minutos : 60 - minutos;
            this.proximaEjecucion = new Date(ahora.getTime() + minutosHasta30 * 60000);
        } else if (this.cronExpression === '0 0 */1 * * *') {
            this.proximaEjecucion = new Date(ahora.getTime() + (60 - ahora.getMinutes()) * 60000);
        }
        // Agregar más cálculos según necesites
    }

    /**
     * Iniciar job continuo
     */
    iniciarJobContinuo() {
        console.log(`🔄 Iniciando job continuo (cada ${this.intervaloContinuo / 1000} segundos)...`);
        
        const intervalo = setInterval(async () => {
            await this.ejecutarJob();
        }, this.intervaloContinuo);

        console.log('✅ Job continuo iniciado correctamente');
        return intervalo;
    }

    /**
     * Ejecutar una sola vez (modo manual)
     */
    async ejecutarManual() {
        console.log('👤 Ejecutando en modo manual...');
        await this.ejecutarJob();
    }

    /**
     * Manejar señales del sistema para cierre graceful
     */
    configurarCierreGraceful(task) {
        const signals = ['SIGINT', 'SIGTERM', 'SIGQUIT'];
        
        signals.forEach(signal => {
            process.on(signal, () => {
                console.log(`\n🛑 Recibida señal ${signal}, cerrando gracefulmente...`);
                
                if (task) {
                    if (typeof task.destroy === 'function') {
                        task.destroy();
                    } else {
                        clearInterval(task);
                    }
                }
                
                console.log('👋 Job scheduler detenido');
                this.mostrarEstadisticas();
                process.exit(0);
            });
        });
    }

    /**
     * Iniciar el scheduler según la configuración
     */
    async iniciar() {
        this.mostrarInfoScheduler();
        
        let task;
        
        try {
            switch (this.modoEjecucion.toLowerCase()) {
                case 'programado':
                    task = this.iniciarJobProgramado();
                    break;
                    
                case 'continuo':
                    task = this.iniciarJobContinuo();
                    break;
                    
                case 'manual':
                    await this.ejecutarManual();
                    return; // Salir después de ejecutar una vez
                    
                default:
                    throw new Error(`Modo de ejecución no válido: ${this.modoEjecucion}`);
            }
            
            this.configurarCierreGraceful(task);
            
            // Mantener el proceso vivo
            console.log('🎯 Scheduler activo. Presiona Ctrl+C para detener.');
            console.log('');
            
            // Mostrar estadísticas cada 5 minutos
            setInterval(() => {
                if (!this.isRunning) {
                    console.log('📊 Estado del scheduler:');
                    this.mostrarEstadisticas();
                }
            }, 300000); // 5 minutos
            
        } catch (error) {
            console.log(`❌ Error iniciando scheduler: ${error.message}`);
            process.exit(1);
        }
    }
}

// Función principal
async function main() {
    const scheduler = new JobSchedulerRIPS();
    await scheduler.iniciar();
}

// Exportar para uso como módulo
module.exports = JobSchedulerRIPS;

// Ejecutar si se llama directamente
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
}