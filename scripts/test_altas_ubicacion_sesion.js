const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const panelPath = fs.existsSync("PANEL-index_15.html") ? "PANEL-index_15.html" : "index.html";
const ubicacionSqlPath = fs.existsSync("supabase_ubicacion_solo_federico_1122.sql")
  ? "supabase_ubicacion_solo_federico_1122.sql"
  : "supabase/ubicacion_solo_federico_1122.sql";
const html = fs.readFileSync(panelPath, "utf8");
const ubicacionSql = fs.readFileSync(ubicacionSqlPath, "utf8");

function fnSource(name) {
  const asyncStart = html.indexOf(`async function ${name}(`);
  const plainStart = html.indexOf(`function ${name}(`);
  const start = asyncStart >= 0 ? asyncStart : plainStart;
  assert(start >= 0, `Falta ${name}`);
  const brace = html.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    if (html[i] === "{") depth++;
    if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`No se pudo extraer ${name}`);
}

const storage = new Map();
const context = {
  console,
  Date,
  Math,
  Number,
  String,
  Object,
  Array,
  Promise,
  encodeURIComponent,
  atob: s => Buffer.from(s, "base64").toString("binary"),
  localStorage: {
    setItem: (k, v) => storage.set(k, String(v)),
    getItem: k => storage.get(k) || null,
  },
  crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" },
  _empToken: null,
  _sbEmpId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  _barcodeNormalizar: v => String(v || "").trim(),
  _bumpCatVer: () => { context.bumped = true; },
  _normalizarRoles: value => Array.isArray(value) ? value.filter(Boolean) : [],
};
vm.createContext(context);
[
  "_empTokenPayloadLeer",
  "_empTokenVigente",
  "_guardarEmpToken",
  "_productoUuidNuevo",
  "_usuarioPayloadCoincide",
  "_sbInsertProducto",
].forEach(name => new vm.Script(fnSource(name)).runInContext(context));

function token(exp) {
  const payload = Buffer.from(JSON.stringify({ empresa_id: context._sbEmpId, uid: "ADMIN", exp })).toString("base64url");
  return `e30.${payload}.firma`;
}

(async () => {
  assert(context._guardarEmpToken(token(Math.floor(Date.now() / 1000) + 3600)), "Debe aceptar un token legible");
  assert(context._empTokenVigente(0), "Debe reconocer una sesión vigente");
  assert(!context._empTokenVigente(2 * 3600 * 1000), "Debe detectar que vencerá dentro del margen");
  assert.strictEqual(storage.get("dm_emp_token"), context._empToken, "Debe persistir la renovación");

  assert(context._usuarioPayloadCoincide(
    { name: "Cliente", role: "cliente", roles: ["cliente", "repartidor"], lat: -42.7, lng: -65.0 },
    { name: "Cliente", lat: -42.7000004, lng: -65.0000004 }
  ), "Un cambio de ubicación no debe exigir ni comparar roles ausentes del PATCH");
  assert(!context._usuarioPayloadCoincide({ name: "Cliente", lat: -42.6 }, { name: "Cliente", lat: -42.7 }), "Debe detectar una coordenada que no se guardó");

  let sent;
  context.sbPost = async (_table, body) => { sent = body; return []; };
  context._productoConfirmarInsert = async id => ({ id });
  const id = await context._sbInsertProducto({ id: "11111111-2222-4333-8444-555555555555", codigo: "NUEVO1", nombre: "Producto nuevo", ofertaNombre: "Promo" });
  assert.strictEqual(id, sent.id, "El alta debe conservar un UUID estable y confirmar la fila exacta");
  assert.strictEqual(sent.oferta_nombre, "Promo", "El alta debe guardar los mismos campos promocionales que la edición");

  context.sbPost = async () => { throw new Error("duplicate key value violates unique constraint productos_pkey1"); };
  context._productoConfirmarInsert = async wanted => ({ id: wanted, codigo: "NUEVO1" });
  assert.strictEqual(await context._sbInsertProducto({ id, codigo: "NUEVO1", nombre: "Producto nuevo" }), id, "Reintentar una respuesta perdida no debe duplicar");

  assert(/id="ec-save-btn"/.test(html), "Falta bloquear doble guardado del cliente");
  assert(/if\(_puedeElegirRol2\)\{\s*sbPayload\.role=updated\.role/.test(html), "Los roles sólo deben viajar si el perfil puede editarlos");
  assert(!/var updated = \{ id:id, pass:pass\|\|id/.test(html), "Editar ubicación no debe reescribir la contraseña local");
  assert(/Number\.isFinite\(latEc\).*latEc < -90.*lngEc < -180/.test(html), "Falta validar el par de coordenadas");
  assert(/function _crDetectarUbicacion\(\)[\s\S]*?_obtenerUbicacionActual\(\)/.test(html), "El alta rápida debe usar el GPS nativo compatible");
  assert(/function _capturarGPSParaCliente\(prefix\)[\s\S]*?_obtenerUbicacionActual\(\)/.test(html), "Gestión de clientes debe usar el GPS nativo compatible");
  assert(/async function _verificarDir\(inputId, resultId\)[\s\S]*?latEl\.value=coords\.lat[\s\S]*?lngEl\.value=coords\.lng/.test(html), "Verificar una dirección debe conservar sus coordenadas");
  assert(/alter constraint usuario_ubicaciones_usuario_id_fkey\s+deferrable initially deferred/i.test(ubicacionSql), "El alta no debe fallar porque el trigger preceda a la fila padre");
  assert(/_fotoNoSubida=true/.test(html), "Una foto fallida no debe congelar el alta");
  assert(/_prodIoStableUuid\(\(_sbEmpId\|\|""\)\+"\|"\+codigo\)/.test(html), "Dos dispositivos deben derivar el mismo ID para el mismo SKU");
  assert(/if\(saved && navigator\.onLine && !_empTokenVigente\(0\)\)/.test(html), "Una sesión visual vencida no debe seguir habilitando escrituras");

  console.log("Altas, ubicación y sesión: 16 protecciones OK");
})().catch(error => { console.error(error); process.exitCode = 1; });
