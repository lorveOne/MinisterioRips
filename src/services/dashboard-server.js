// Servidor Express para dashboard visual de procesamiento de carpetas
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const MicroservicioRIPS = require('./MicroservicioRIPS.js');
const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

const BASE_PATH = require('../config/config.js').paths.base;
const CONTROL_FILE = path.join(BASE_PATH, '.carpetas_procesadas.json');

app.use(express.json());
const PROJECT_ROOT = path.resolve(__dirname, '../../');
app.use(express.static(path.join(PROJECT_ROOT, 'public'))); // Para archivos estáticos del dashboard

// Obtener el estado de todas las carpetas
app.get('/api/carpetas', async (req, res) => {
    try {
        // Leer carpetas realmente procesadas
        let carpetasProcesadasFS = [];
        try {
            carpetasProcesadasFS = await fs.readdir(path.join(require('../config/config.js').paths.procesados));
        } catch (e) {}

        // Opcional: leer detalles del archivo de control
        let data = {};
        try {
            const content = await fs.readFile(CONTROL_FILE, 'utf8');
            data = JSON.parse(content);
        } catch (e) {}

        // Solo devolver info de las carpetas que están en procesados
        const result = {};
        for (const nombre of carpetasProcesadasFS) {
            let info = data[nombre];
            if (!info) {
                // Buscar la clave más parecida
                const matchKey = Object.keys(data).find(k => nombre.endsWith(k) || nombre.includes(k) || k.endsWith(nombre) || k.includes(nombre));
                info = matchKey ? data[matchKey] : {};
            }
            result[nombre] = {
                nombre,
                fechaProcesamiento: info.fechaProcesamiento || '-',
                ruta: path.join(require('../config/config.js').paths.procesados, nombre)
            };
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Error leyendo las carpetas procesadas' });
    }
});

// Endpoint para eliminar carpetas rechazadas del archivo de control
app.post('/api/carpetas/eliminar-rechazadas', async (req, res) => {
    try {
        const BASE_PATH = require('../config/config.js').paths.base;
        const CONTROL_FILE = require('path').join(BASE_PATH, '.carpetas_procesadas.json');
        let data = {};
        try {
            const content = await fs.readFile(CONTROL_FILE, 'utf8');
            data = JSON.parse(content);
        } catch (e) {}
        let eliminadas = [];
        for (const [nombre, info] of Object.entries(data)) {
            if ((info.estado||'').toLowerCase().includes('rechazada')) {
                eliminadas.push(nombre);
                delete data[nombre];
            }
        }
        await fs.writeFile(CONTROL_FILE, JSON.stringify(data, null, 2), 'utf8');
        res.json({ ok: true, eliminadas });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo eliminar las carpetas rechazadas', details: err.message });
    }
});

// Endpoint para abrir carpeta en el explorador de Windows
const { exec } = require('child_process');
app.post('/api/abrir-carpeta', (req, res) => {
    const { ruta } = req.body;
    if (!ruta) return res.status(400).json({ error: 'Ruta requerida' });
    exec(`explorer "${ruta}"`);
    res.json({ ok: true });
});

// Endpoint para obtener errores de rechazo de una carpeta específica
const rechazoViewer = require('../../public/rechazo-viewer.js');
app.use(rechazoViewer);

// Endpoint para obtener carpetas rechazadas
app.get('/api/carpeta-rechazadas', async (req, res) => {
    try {
        // Leer archivo .carpetas_json desde la carpeta base
        const CONTROL_FILE = require('path').join(BASE_PATH, '.carpetas_procesadas.json');
        let data = {};
        
        try {
            const content = await fs.readFile(CONTROL_FILE, 'utf8');
            data = JSON.parse(content);
        } catch (e) {
            console.error('Error leyendo archivo JSON:', e);
        }

        // Obtener listas de carpetas físicas
        const config = require('../config/config.js');
        let carpetasRechazadasFS = [];
        let carpetasProcesadasFS = [];

        try {
            // Leer carpetas de la carpeta rechazados
            carpetasRechazadasFS = await fs.readdir(config.paths.rechazados);
        } catch (e) {
            console.error('Error leyendo carpeta rechazados:', e);
        }

        try {
            // Leer carpetas de la carpeta procesados
            carpetasProcesadasFS = await fs.readdir(config.paths.procesados);
        } catch (e) {
            console.error('Error leyendo carpeta procesados:', e);
        }

        const result = [];
        
        for (const [nombre, info] of Object.entries(data)) {
            // Verificar si el estado es "rechazada"
            let estado = (info.estado || '').toLowerCase();
            let motivo = '';
            
            // Si hay información adicional en el estado, extraerla
            if (estado.includes(':')) {
                const parts = estado.split(':');
                estado = parts[0].trim();
                motivo = parts.slice(1).join(':').trim();
            }
            
            // Solo procesar si el estado es "rechazada"
            if (estado === 'rechazada') {
                // Buscar la carpeta física más parecida en rechazados
                const nombreFS = carpetasRechazadasFS.find(n => 
                    n.endsWith(nombre) || 
                    n.includes(nombre) || 
                    nombre.endsWith(n) || 
                    nombre.includes(n) ||
                    n.includes(`HS${nombre}`) || // Para archivos como HS1597968.json
                    n.replace(/\.(json|txt)$/, '').includes(nombre)
                );
                
                // Verificar si NO existe en procesados
                const existeProcesado = carpetasProcesadasFS.some(n => 
                    n.endsWith(nombre) || 
                    n.includes(nombre) || 
                    nombre.endsWith(n) || 
                    nombre.includes(n)
                );
                
                // Solo agregar si existe en rechazados y NO existe en procesados
                if (nombreFS && !existeProcesado) {
                    result.push({
                        nombre: nombreFS,
                        fechaProcesamiento: info.fechaProcesamiento || '-',
                        motivo: motivo || 'Sin motivo especificado',
                        ruta: path.join(config.paths.rechazados, nombreFS),
                        // Información adicional para debugging
                        estadoOriginal: info.estado,
                        ubicacion: info.ubicacion || null
                    });
                }
            }
        }
        
        //console.log(`Encontradas ${result.length} carpetas rechazadas`);
        res.json(result);
        
    } catch (err) {
        console.error('Error en endpoint carpetas-rechazadas:', err);
        res.status(500).json({ 
            error: 'Error leyendo las carpetas rechazadas',
            details: err.message 
        });
    }
});
 

// Eliminar una carpeta rechazada
app.delete('/api/carpeta/:nombre', async (req, res) => {
    const nombre = req.params.nombre;
    try {
        // Eliminar de disco (carpeta rechazada)
        const carpetaPath = path.join(BASE_PATH, 'rechazados', nombre);
        await fs.rm(carpetaPath, { recursive: true, force: true });
        // Eliminar del control
        let data = {};
        try {
            const content = await fs.readFile(CONTROL_FILE, 'utf8');
            data = JSON.parse(content);
        } catch (e) {}
        delete data[nombre];
        await fs.writeFile(CONTROL_FILE, JSON.stringify(data, null, 2), 'utf8');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo eliminar la carpeta' });
    }
});

// Reprocesar una carpeta rechazada (mover a porEnviar)
app.post('/api/carpeta/:nombre/reprocesar', async (req, res) => {
    const nombre = req.params.nombre;
    try {
        const origen = path.join(BASE_PATH, 'rechazados', nombre);
        const destino = path.join(BASE_PATH, 'porEnviar', nombre);
        await fs.rename(origen, destino);
        // Cambiar estado en el archivo de control
        let data = {};
        try {
            const content = await fs.readFile(CONTROL_FILE, 'utf8');
            data = JSON.parse(content);
        } catch (e) {}
        data[nombre] = { fechaProcesamiento: new Date().toISOString(), estado: 'reprocesando' };
        await fs.writeFile(CONTROL_FILE, JSON.stringify(data, null, 2), 'utf8');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'No se pudo reprocesar la carpeta' });
    }
});

// Iniciar procesamiento (play)
let schedulerInstance = null;

// Estado del proceso
app.get('/api/estado-proceso', (req, res) => {
    // Considera en ejecución si el intervalo está activo
    res.json({ enEjecucion: !!processingInterval });
});
let processing = false;
let processingInterval = null;

app.post('/api/procesar', async (req, res) => {
    if (processingInterval) return res.json({ ok: false, msg: 'Ya está en ejecución' });
    if (!schedulerInstance) {
        const Scheduler = require('../../index.js');
        schedulerInstance = new Scheduler();
    }
    // Ejecutar inmediatamente y luego cada 30 segundos
    schedulerInstance.ejecutarJob();
    processing = true;
    processingInterval = setInterval(() => {
        if (!schedulerInstance.isRunning) {
            schedulerInstance.ejecutarJob();
        }
    }, 30000);
    res.json({ ok: true });
});

// Detener procesamiento (stop)
app.post('/api/detener', (req, res) => {
    if (processingInterval) {
        clearInterval(processingInterval);
        processingInterval = null;
    }
    processing = false;
    res.json({ ok: true });
});

// Endpoint para log de carga/procesamiento
app.get('/api/log', async (req, res) => {
    try {
        const logPath = path.join(PROJECT_ROOT, 'dashboard.log');
        let content = '';
        try {
            content = await fs.readFile(logPath, 'utf8');
        } catch (e) {
            content = 'No hay log disponible.';
        }
        res.type('text/plain').send(content);
    } catch (err) {
        res.status(500).send('Error al leer el log.');
    }
});

// Servir el dashboard visual
app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`🚦 Dashboard visual disponible en http://localhost:${PORT}/dashboard`);
});
