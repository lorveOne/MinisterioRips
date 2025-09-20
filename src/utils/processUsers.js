const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data');

/**
 * Procesa todas las carpetas de usuarios y sus facturas de forma independiente.
 * Ejecuta la función callback por cada factura encontrada.
 * @param {(usuario: string, facturaPath: string) => void} callback
 */
function processUserInvoices(callback) {
  if (!fs.existsSync(DATA_DIR)) {
    console.warn('La carpeta data/ no existe.');
    return;
  }
  const usuarios = fs.readdirSync(DATA_DIR, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

  usuarios.forEach(usuario => {
    const userDir = path.join(DATA_DIR, usuario);
    const facturas = fs.readdirSync(userDir, { withFileTypes: true })
      .filter(dirent => dirent.isFile())
      .map(dirent => dirent.name);
    facturas.forEach(factura => {
      const facturaPath = path.join(userDir, factura);
      callback(usuario, facturaPath);
    });
  });
}

module.exports = { processUserInvoices };
