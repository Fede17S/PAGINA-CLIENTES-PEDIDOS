const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(process.argv[2] || "PANEL-index_15.html", "utf8");
const sw = fs.readFileSync(path.join(__dirname, "../sw.js"), "utf8");
const calcAsset = src.match(/<script src="(recaudacion-ruta-v1\.js\?v=[^"]+)"/);

const cameraInput = src.match(/<input[^>]+id="comp-file-input"[^>]*>/i);
const galleryInput = src.match(/<input[^>]+id="comp-gallery-input"[^>]*>/i);

const checks = [
  ["input de camara", cameraInput && /capture="environment"/i.test(cameraInput[0])],
  ["input de galeria", galleryInput && !/\bcapture=/i.test(galleryInput[0])],
  ["selector segun origen", /origen==="galeria"\s*\?\s*"comp-gallery-input"\s*:\s*"comp-file-input"/.test(src)],
  ["boton abrir camara", /Abrir camara/.test(src)],
  ["boton galeria", />[^<]*Galeria</i.test(src)],
  ["boton ver comprobante", /Ver comprobante/.test(src)],
  ["visor de comprobante", /async function _meVerComprobante\(i\)/.test(src) && /compLbAbrir\(comp\.url,fecha\)/.test(src)],
  ["carga diferida del comprobante", /await _rcCargarPruebas\(_rutaMapaKey, p\.cliKey\)/.test(src)],
  ["estado de parada elegida", /var _meParadaElegidaKey = null/.test(src)],
  ["seleccion libre", /function _meSeleccionarParada\(i\)/.test(src)],
  ["tarjeta abre seleccion libre", /onclick="_meSeleccionarParada\('\+i\+'\)"/.test(src)],
  ["resalta seleccion", /String\(p\.cliKey\)===String\(_meParadaElegidaKey\)\?" seleccionada"/.test(src)],
  ["ficha seleccionada", /PARADA SELECCIONADA/.test(src)],
  ["cache offline de Reparto", /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/.test(src) && (!calcAsset || sw.includes("'./"+calcAsset[1]+"'"))],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  console.error("Fallaron controles:", failed.map(([name]) => name).join(", "));
  process.exit(1);
}

console.log(`Reparto libre y comprobantes: ${checks.length} controles OK`);
