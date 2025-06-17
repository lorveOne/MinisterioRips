// Configuración global para las pruebas
process.env.NODE_ENV = 'test';

// Configuración de variables de entorno para testing
process.env.MODO_EJECUCION = 'manual';
process.env.CRON_SCHEDULE = '0 */30 * * * *';
process.env.INTERVALO_CONTINUO = '30000';

// Configuración de timeouts más largos para pruebas
jest.setTimeout(30000); 