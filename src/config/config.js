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
                    tipo: process.env.TIPO_USUARIO,
                    numero: process.env.DOC_USUARIO
                }
            },
            clave: process.env.PASSWORD_SISPRO,
            nit:   process.env.USUARIO_SISPRO
        }
    },

    // Configuración de seguridad
    security: {
        ignoreSSL: process.env.NODE_ENV === 'development'
    }
}; 