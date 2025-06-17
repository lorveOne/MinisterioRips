describe('Integración MicroservicioRIPS', () => {
  let JobSchedulerRIPS;
  let MicroservicioRIPS;
  let scheduler;

  beforeEach(() => {
    jest.resetModules(); // Limpia el caché de los módulos
    jest.clearAllMocks();

    // Mock antes de importar
    jest.mock('../../src/services/MicroservicioRIPS', () => {
      return jest.fn().mockImplementation(() => ({
        execute: jest.fn().mockResolvedValue(true)
      }));
    });

    MicroservicioRIPS = require('../../src/services/MicroservicioRIPS');
    JobSchedulerRIPS = require('../../index');
    scheduler = new JobSchedulerRIPS();
  });

  test('debería ejecutar el microservicio correctamente', async () => {
    await scheduler.ejecutarManual();
    expect(scheduler.estadisticas.exitosas).toBeGreaterThan(0);
  });

  test('debería manejar errores correctamente', async () => {
    MicroservicioRIPS.mockImplementationOnce(() => ({
      execute: jest.fn().mockRejectedValueOnce(new Error('Error de prueba'))
    }));
    scheduler = new JobSchedulerRIPS();
    await scheduler.ejecutarManual();
    expect(scheduler.estadisticas.fallidas).toBeGreaterThan(0);
    expect(scheduler.estadisticas.exitosas).toBe(0);
  });

  test('debería actualizar estadísticas después de la ejecución', async () => {
    const estadisticasIniciales = { ...scheduler.estadisticas };
    await scheduler.ejecutarManual();
    expect(scheduler.estadisticas.totalEjecuciones).toBeGreaterThan(estadisticasIniciales.totalEjecuciones);
    expect(scheduler.estadisticas.exitosas).toBeGreaterThan(0);
  });
}); 