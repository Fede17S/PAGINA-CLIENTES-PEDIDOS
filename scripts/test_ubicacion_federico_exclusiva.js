const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const panelPath = fs.existsSync("PANEL-index_15.html") ? "PANEL-index_15.html" : "index.html";
const html = fs.readFileSync(panelPath, "utf8");
const sqlPath = fs.existsSync("supabase_ubicacion_solo_federico_1122.sql")
  ? "supabase_ubicacion_solo_federico_1122.sql"
  : "supabase/ubicacion_solo_federico_1122.sql";
const sql = fs.readFileSync(sqlPath, "utf8");

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

const context = {
  _sbEmpId: "6eabe598-6bdc-4319-96bd-f5eb6bdc6eab",
  currentUser: { _sbId: "a1a7f3f4-7b46-4fe9-984b-e57184b9a1a7", id: "federico" },
  empresaData: { codigo: "1122" },
};
vm.createContext(context);
new vm.Script('var _UBICACION_EMPRESA_DUENA="6eabe598-6bdc-4319-96bd-f5eb6bdc6eab";var _UBICACION_USUARIO_DUENO="a1a7f3f4-7b46-4fe9-984b-e57184b9a1a7";'+fnSource("_puedeVerUbicacionVendedores")).runInContext(context);

assert.strictEqual(context._puedeVerUbicacionVendedores(), true, "Federico 1122 debe poder abrir Ubicación");
context.currentUser = { _sbId: "otro-admin", id: "admin2" };
assert.strictEqual(context._puedeVerUbicacionVendedores(), false, "Otro admin no debe poder abrir Ubicación");
context.currentUser = { _sbId: "a1a7f3f4-7b46-4fe9-984b-e57184b9a1a7", id: "federico" };
context.empresaData.codigo = "otra";
assert.strictEqual(context._puedeVerUbicacionVendedores(), false, "El perfil no debe habilitarse fuera de la empresa 1122");

assert(/id="vnd-tab-mapa"[^>]*style="display:none"/.test(html), "El botón debe iniciar oculto");
assert(/tab==="mapa" && !_puedeVerUbicacionVendedores\(\)/.test(html), "setVndTab debe bloquear accesos forzados");
assert(/rpc\/ubicacion_vendedores_leer/.test(html), "El mapa debe leer por el RPC privado");
assert(!/sbGet\("usuarios","select=id,uid,name,role,last_lat/.test(html), "El mapa no debe leer coordenadas desde usuarios");
assert(!/sbPatch\("usuarios"[^\n]*(last_lat|last_lng|loc_modo)/.test(html), "La ubicación no debe escribirse directamente en usuarios");

assert(/create table if not exists private\.usuario_ubicaciones/i.test(sql), "Falta el almacén privado");
assert(/private\.es_dueno_ubicacion\(\)/i.test(sql), "Falta validar al dueño en la base");
assert(/La ubicación está disponible únicamente para Federico/.test(sql), "Los RPC deben denegar a otros perfiles");
assert(/revoke execute on function public\.app_firmar_token/i.test(sql), "No debe quedar habilitada la fabricación directa de tokens");
assert(/update public\.usuarios[\s\S]*last_lat = null[\s\S]*loc_token = null/i.test(sql), "Las columnas públicas sensibles deben quedar vacías");

console.log("Ubicación exclusiva: interfaz, RPC y almacenamiento privado OK");

