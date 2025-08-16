const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const app = express();

const RECHAZADOS_DIR = require('../src/config/config').paths.rechazados;


app.get('/api/rechazo-errores/:nombre', async (req, res) => {
    const nombre = req.params.nombre;
    
    try {
        // Lista de posibles formatos de archivo a buscar
        const posiblesNombres = [
            `${nombre}_RECHAZADO.json`,
            `HS${nombre}.json`,
            `${nombre}.json`,
            `HS${nombre}_RECHAZADO.json`,
            nombre.endsWith('.json') ? nombre : `${nombre}.json`
        ];
        
        let archivoEncontrado = null;
        let contenido = null;
        
        // Intentar encontrar el archivo con diferentes formatos
        for (const nombreArchivo of posiblesNombres) {
            try {
                const rutaArchivo = path.join(RECHAZADOS_DIR, nombreArchivo);
                contenido = await fs.readFile(rutaArchivo, 'utf8');
                archivoEncontrado = nombreArchivo;
                break;
            } catch (e) {
                // Continuar con el siguiente formato
                continue;
            }
        }
        
        // Si no se encontró con nombres específicos, buscar en todos los archivos de la carpeta
        if (!archivoEncontrado) {
            try {
                const archivos = await fs.readdir(RECHAZADOS_DIR);
                const archivoCoincidente = archivos.find(archivo => 
                    archivo.includes(nombre) || 
                    nombre.includes(archivo.replace('.json', '')) ||
                    archivo.replace(/^HS/, '').replace('.json', '') === nombre
                );
                
                if (archivoCoincidente) {
                    contenido = await fs.readFile(path.join(RECHAZADOS_DIR, archivoCoincidente), 'utf8');
                    archivoEncontrado = archivoCoincidente;
                }
            } catch (e) {
                console.error('Error listando archivos:', e);
            }
        }
        
        if (!archivoEncontrado) {
            return res.status(404).json({ 
                error: 'No se encontró el archivo de errores de rechazo para esta carpeta.',
                nombreBuscado: nombre,
                formatosProbados: posiblesNombres
            });
        }
        
        let json = JSON.parse(contenido);
        // Si el JSON raíz es un array, usar el primer elemento
        if (Array.isArray(json)) {
            json = json[0];
        }
        let errores = [];

        // Procesar diferentes estructuras de JSON
        if (json && Array.isArray(json.ResultadosValidacion)) {
            // Estructura principal - solo errores RECHAZADO
            errores = json.ResultadosValidacion
                .filter(e => e.Clase === 'RECHAZADO')
                .map(e => ({
                    Clase: e.Clase || '-',
                    Codigo: e.Codigo || '-',
                    Descripcion: e.Descripcion || '-',
                    Observaciones: e.Observaciones || '-',
                    PathFuente: e.PathFuente || '-',
                    Fuente: e.Fuente || '-'
                }));
        } else if (json.errores && Array.isArray(json.errores)) {
            // Estructura alternativa
            errores = json.errores
                .filter(e => e.Clase === 'RECHAZADO')
                .map(e => ({
                    Clase: e.Clase || '-',
                    Codigo: e.Codigo || '-',
                    Descripcion: e.Descripcion || '-',
                    Observaciones: e.Observaciones || '-',
                    PathFuente: e.PathFuente || '-',
                    Fuente: e.Fuente || '-'
                }));
        } else if (json.validaciones && Array.isArray(json.validaciones)) {
            // Otra posible estructura
            errores = json.validaciones
                .filter(e => e.Clase === 'RECHAZADO')
                .map(e => ({
                    Clase: e.Clase || '-',
                    Codigo: e.Codigo || '-',
                    Descripcion: e.Descripcion || '-',
                    Observaciones: e.Observaciones || '-',
                    PathFuente: e.PathFuente || '-',
                    Fuente: e.Fuente || '-'
                }));
        }
        
        // Información adicional del archivo
        const infoFactura = {
            NumFactura: json.NumFactura || '-',
            FechaRadicacion: json.FechaRadicacion || '-',
            ResultState: json.ResultState || false,
            CodigoUnicoValidacion: json.CodigoUnicoValidacion || '-'
        };
        
        res.json({
            archivoEncontrado,
            infoFactura,
            totalErrores: errores.length,
            errores
        });
        
    } catch (e) {
        console.error('Error procesando archivo:', e);
        res.status(500).json({ 
            error: 'Error procesando el archivo de errores de rechazo.',
            detalles: e.message,
            nombreBuscado: nombre
        });
    }
});

// Endpoint adicional para obtener TODAS las validaciones (RECHAZADO + NOTIFICACION)
app.get('/api/todas-validaciones/:nombre', async (req, res) => {
    const nombre = req.params.nombre;
    
    try {
        // Reutilizar la lógica de búsqueda de archivos
        const posiblesNombres = [
            `${nombre}_RECHAZADO.json`,
            `HS${nombre}.json`,
            `${nombre}.json`,
            `HS${nombre}_RECHAZADO.json`,
            nombre.endsWith('.json') ? nombre : `${nombre}.json`
        ];
        
        let archivoEncontrado = null;
        let contenido = null;
        
        for (const nombreArchivo of posiblesNombres) {
            try {
                const rutaArchivo = path.join(RECHAZADOS_DIR, nombreArchivo);
                contenido = await fs.readFile(rutaArchivo, 'utf8');
                archivoEncontrado = nombreArchivo;
                break;
            } catch (e) {
                continue;
            }
        }
        
        if (!archivoEncontrado) {
            try {
                const archivos = await fs.readdir(RECHAZADOS_DIR);
                const archivoCoincidente = archivos.find(archivo => 
                    archivo.includes(nombre) || 
                    nombre.includes(archivo.replace('.json', '')) ||
                    archivo.replace(/^HS/, '').replace('.json', '') === nombre
                );
                
                if (archivoCoincidente) {
                    contenido = await fs.readFile(path.join(RECHAZADOS_DIR, archivoCoincidente), 'utf8');
                    archivoEncontrado = archivoCoincidente;
                }
            } catch (e) {
                console.error('Error listando archivos:', e);
            }
        }
        
        if (!archivoEncontrado) {
            return res.status(404).json({ 
                error: 'No se encontró el archivo para esta carpeta.',
                nombreBuscado: nombre
            });
        }
        
        const json = JSON.parse(contenido);
        
        const infoFactura = {
            NumFactura: json.NumFactura || '-',
            FechaRadicacion: json.FechaRadicacion || '-',
            ResultState: json.ResultState || false,
            CodigoUnicoValidacion: json.CodigoUnicoValidacion || '-'
        };
        
        let todasValidaciones = [];
        if (Array.isArray(json.ResultadosValidacion)) {
            todasValidaciones = json.ResultadosValidacion.map(e => ({
                Clase: e.Clase || '-',
                Codigo: e.Codigo || '-',
                Descripcion: e.Descripcion || '-',
                Observaciones: e.Observaciones || '-',
                PathFuente: e.PathFuente || '-',
                Fuente: e.Fuente || '-'
            }));
        }
        
        const rechazados = todasValidaciones.filter(e => e.Clase === 'RECHAZADO');
        const notificaciones = todasValidaciones.filter(e => e.Clase === 'NOTIFICACION');
        
        res.json({
            archivoEncontrado,
            infoFactura,
            resumen: {
                totalValidaciones: todasValidaciones.length,
                totalRechazados: rechazados.length,
                totalNotificaciones: notificaciones.length
            },
            validaciones: {
                rechazados,
                notificaciones,
                todas: todasValidaciones
            }
        });
        
    } catch (e) {
        console.error('Error procesando archivo:', e);
        res.status(500).json({ 
            error: 'Error procesando el archivo.',
            detalles: e.message,
            nombreBuscado: nombre
        });
    }
});

// Endpoint adicional para listar todos los archivos en la carpeta rechazados (útil para debugging)
app.get('/api/debug/archivos-rechazados', async (req, res) => {
    try {
        const archivos = await fs.readdir(RECHAZADOS_DIR);
        res.json({
            carpeta: RECHAZADOS_DIR,
            totalArchivos: archivos.length,
            archivos: archivos.map(archivo => ({
                nombre: archivo,
                sinExtension: archivo.replace('.json', ''),
                posibleId: archivo.replace(/^HS/, '').replace('.json', '')
            }))
        });
    } catch (e) {
        res.status(500).json({ 
            error: 'Error listando archivos rechazados',
            detalles: e.message 
        });
    }
});

module.exports = app;