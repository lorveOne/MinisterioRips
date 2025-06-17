const config = require('../config/config');
const hacerPeticionHTTPS = require('../helper/HttpClient');

class AuthService {
    constructor() {
        this.token = null;
        this.httpClient = new hacerPeticionHTTPS();
    }

    async login() {
        console.log('🔐 Autenticando en SISPRO...');
        
        try {
            const response = await this.httpClient.hacerPeticionHTTPS(
                'POST', 
                '/Auth/LoginSISPRO', 
                config.sispro.loginData
            );
            
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

    getToken() {
        if (!this.token) {
            throw new Error('No hay token válido. Hacer login primero.');
        }
        return this.token;
    }
}

module.exports = AuthService; 