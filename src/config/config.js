require('dotenv').config();

module.exports = {
    // Rutas base para carpetas
    paths: {
        base: process.env.RUTA_BASE_CARPETAS || 'C:\\Users\\USER\\Desktop\\Json_enviar',
        porEnviar: process.env.RUTA_ARCHIVOS_GENERADOS || 'C:\\Users\\USER\\Desktop\\Json_enviar\\porEnviar',
        procesados: process.env.RUTA_ARCHIVOSENVIADOS || 'C:\\Users\\USER\\Desktop\\Json_enviar\\procesados',
        rechazados: process.env.RUTA_ARCHIVOSRECHAZADOS || 'C:\\Users\\USER\\Desktop\\Json_enviar\\rechazados'
    },

    // Configuración SISPRO
    sispro: {
        baseURL: process.env.BASE_URL || 'https://localhost:9443/api',
        usuario: process.env.USUARIO_SISPRO,
        password: process.env.PASSWORD_SISPRO,
        loginData: {
            persona: {
                identificacion: {
                    tipo: 'CC',
                    numero: "4450739"
                }
            },
            clave: "H0sp1t4l2025*",
            nit: "810000913"
        }
    },

    // Configuración de seguridad
    security: {
        ignoreSSL: process.env.NODE_ENV === 'development'
    }
}; 