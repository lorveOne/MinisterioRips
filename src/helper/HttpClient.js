const https = require('https');

class HttpClient {
    constructor(baseURL) {
        this.baseURL = process.env.BASE_URL || 'https://localhost:9443/api';
    }

    async hacerPeticionHTTPS(metodo, endpoint, data = null, headers = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(this.baseURL + endpoint);
            
            const options = {
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method: metodo,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                rejectUnauthorized: false // Solo para desarrollo
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const jsonResponse = JSON.parse(responseData);
                        
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            resolve(jsonResponse);
                        } else {
                            reject(new Error(`HTTP ${res.statusCode}: ${jsonResponse.message || responseData}`));
                        }
                    } catch (error) {
                        reject(new Error(`Error parsing response: ${responseData}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(error);
            });

            if (data && (metodo === 'POST' || metodo === 'PUT')) {
                req.write(JSON.stringify(data));
            }

            req.end();
        });
    }
}

module.exports = HttpClient;
