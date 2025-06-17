const JobSchedulerRIPS = require('../../index');

// Mock del MicroservicioRIPS
jest.mock('../../src/services/MicroservicioRIPS', () => {
  return jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue(true)
  }));
});

describe('JobSchedulerRIPS', () => {
  let scheduler;

  beforeEach(() => {
    // Limpiar todos los mocks antes de cada prueba
    jest.clearAllMocks();
    scheduler = new JobSchedulerRIPS();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('debería inicializar con valores por defecto', () => {
    expect(scheduler.modoEjecucion).toBe('manual');
    expect(scheduler.cronExpression).toBe('0 */30 * * * *');
    expect(scheduler.intervaloContinuo).toBe(30000);
    expect(scheduler.estadisticas).toEqual(expect.objectContaining({
      totalEjecuciones: 0,
      exitosas: 0,
      fallidas: 0
    }));
  });

  test('debería mostrar información del scheduler', () => {
    const consoleSpy = jest.spyOn(console, 'log');
    scheduler.mostrarInfoScheduler();
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls.some(call => 
      call[0].includes('JOB SCHEDULER RIPS - MINSALUD')
    )).toBe(true);
  });

  test('debería describir expresión CRON correctamente', () => {
    const casos = [
      { expr: '0 */30 * * * *', expected: 'Cada 30 minutos' },
      { expr: '0 0 */1 * * *', expected: 'Cada hora' },
      { expr: '0 0 8,12,16,20 * * *', expected: 'A las 8:00, 12:00, 16:00 y 20:00' },
      { expr: '0 0 9 * * 1-5', expected: 'Lunes a viernes a las 9:00 AM' }
    ];

    casos.forEach(({ expr, expected }) => {
      expect(scheduler.describeCronExpression(expr)).toBe(expected);
    });
  });

  test('debería manejar ejecución manual exitosa', async () => {
    await scheduler.ejecutarManual();
    expect(scheduler.estadisticas.totalEjecuciones).toBe(1);
    expect(scheduler.estadisticas.exitosas).toBe(1);
    expect(scheduler.estadisticas.fallidas).toBe(0);
  });

  test('debería manejar errores en ejecución manual', async () => {
    // Simular un error en el microservicio
    const MicroservicioRIPS = require('../../src/services/MicroservicioRIPS');
    MicroservicioRIPS.mockImplementationOnce(() => ({
      execute: jest.fn().mockRejectedValueOnce(new Error('Error de prueba'))
    }));

    // Crear una nueva instancia después de configurar el mock
    scheduler = new JobSchedulerRIPS();
    
    await scheduler.ejecutarManual();
    expect(scheduler.estadisticas.totalEjecuciones).toBe(1);
    expect(scheduler.estadisticas.exitosas).toBe(0);
    expect(scheduler.estadisticas.fallidas).toBe(1);
  });
}); 