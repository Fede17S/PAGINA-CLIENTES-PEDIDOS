const fs = require("fs");
const src = fs.readFileSync(process.argv[2] || (fs.existsSync("PANEL-index_15.html")?"PANEL-index_15.html":"index.html"), "utf8");

const checks = [
  ["badge ya asignado", /Ya asignado:/],
  ["aviso en selector", /Si elegís otra hoja se moverán/],
  ["confirmación para forzar", /Mover igualmente/],
  ["búsqueda por pedido exacto", /pedido_id=eq\./],
  ["actualiza ruta existente", /sbPatch\("ruta_clientes","id=eq\."\+keeper\.id/],
  ["consulta destructiva sin fallback de cache", /var existentes=await _sbGetRaw\("ruta_clientes"/],
  ["no barre copias desde el navegador", /No se ejecutan barridos[\s\S]*destructivos del lado cliente/],
  ["guarda ruta más reciente", /ruta_vinculada_id:rutaDestKey/],
  ["evita duplicar misma ruta", /sin duplicar/],
  ["carga rutas por lotes", /TAM_LOTE_RUTAS=40/],
  ["pagina clientes de ruta", /TAM_PAGINA=500[\s\S]*?&limit=[\s\S]*?&offset=/],
  ["filtra clientes por empresa", /_sbGetRutaClientesPaginados[\s\S]*?&empresa_id=eq\./],
  ["evita cache repetido entre paginas", /_sbGetRaw\("ruta_clientes",q\)/],
  ["verifica parada antes de etiquetar", /La hoja de ruta no confirmo el pedido; no se actualizo la etiqueta/],
  ["verifica etiqueta persistida", /Supabase no confirmo la etiqueta de hoja de ruta en el pedido/],
  ["movimiento reutiliza una sola fila", /async function _moverRutaClienteServidor[\s\S]*?_moverFilaRutaExistente/],
  ["cola vieja se autorrepara", /if\(op\.method==="ROUTE_MOVE"\)[\s\S]*?return _moverRutaClienteServidor\(op\.data\|\|\{\},op\)/],
  ["conflicto unico se reconvierte", /23505\|duplicate key\|ruta_clientes_empresa_pedido_uidx/],
  ["movimiento sincroniza backup", /_moverRutaClienteServidor[\s\S]*?ruta_vinculada_id:md\.dst/],
  ["reasignacion masiva usa movimiento seguro", /_moverCliEntreRutas[\s\S]*?_moverClienteRutaQ\(rkOrigen,ck,rkDest,cli,"Mover pedido entre rutas"\)/],
];

const moverMasivo = src.match(/async function _moverCliEntreRutas[\s\S]*?\r?\n}\r?\n\r?\n\/\//);
if (!moverMasivo || /sbPost\("ruta_clientes"/.test(moverMasivo[0])) {
  console.error("Falló control: mover entre hojas no debe insertar una copia");
  process.exit(1);
}

const failed = checks.filter(([, regex]) => !regex.test(src));
if (failed.length) {
  console.error("Fallaron controles:", failed.map(([name]) => name).join(", "));
  process.exit(1);
}
console.log(`Asignación única a ruta: ${checks.length} controles OK`);
