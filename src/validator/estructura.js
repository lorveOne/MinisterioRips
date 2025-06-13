const fs = require('fs');
const path = require('path');

function ajustarCarpetasJson(rutaBase) {
  const rutasAjustadas = [];

  try {
    const carpetas = fs.readdirSync(rutaBase, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    carpetas.forEach(dirent => {
      const nombreCarpeta = dirent.name;

      const carpetaSalida = path.join(rutaBase, `${nombreCarpeta}_ajustada`);
      const jsonAjustado = path.join(carpetaSalida, `${nombreCarpeta}_ajustado.json`);

      if (fs.existsSync(jsonAjustado)) {
        console.log(`⏩ Ya ajustada: ${nombreCarpeta}, se omite`);
        rutasAjustadas.push(jsonAjustado); // También incluir si ya existía
        return;
      }

      const carpetaCompleta = path.join(rutaBase, nombreCarpeta);

      try {
        const archivos = fs.readdirSync(carpetaCompleta);
        const jsonFile = archivos.find(f => f.endsWith('.json'));
        const xmlFile = archivos.find(f => f.endsWith('.xml'));

        if (!jsonFile || !xmlFile) {
          console.warn(`⚠️  Archivos faltantes en carpeta ${nombreCarpeta}`);
          return;
        }

        const jsonPath = path.join(carpetaCompleta, jsonFile);
        const xmlPath = path.join(carpetaCompleta, xmlFile);

        const jsonOriginal = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        const xmlBase64 = fs.readFileSync(xmlPath).toString('base64');

        const nuevoJson = {
          rips: jsonOriginal,
          xmlFevFile: xmlBase64
        };
        // Ajustar RIPS
        const ripsAjustados = ajustarRIPS(nuevoJson);
        
        fs.mkdirSync(carpetaSalida, { recursive: true });
        fs.writeFileSync(jsonAjustado, JSON.stringify(ripsAjustados, null, 2), 'utf8');

        console.log(`✅ Ajustado: ${nombreCarpeta}`);
        rutasAjustadas.push(jsonAjustado);
      } catch (errorInterno) {
        console.error(`❌ Error en carpeta ${nombreCarpeta}:`, errorInterno.message);
      }
    });
  } catch (errorGeneral) {
    console.error('❌ Error al procesar carpetas:', errorGeneral.message);
  }

  return rutasAjustadas;
}




module.exports = ajustarCarpetasJson;
