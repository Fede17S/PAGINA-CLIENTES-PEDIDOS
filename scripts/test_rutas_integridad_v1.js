const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = process.argv[2] || (fs.existsSync(path.join(root, 'PANEL-index_15.html'))
  ? path.join(root, 'PANEL-index_15.html')
  : path.join(root, 'index.html'));
const html = fs.readFileSync(htmlPath, 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260929223000_rutas_integridad_v1.sql'), 'utf8');

function funcion(nombre) {
  const inicio = html.indexOf(`function ${nombre}(`);
  assert.notEqual(inicio, -1, `Falta ${nombre}`);
  const llave = html.indexOf('{', inicio);
  let nivel = 0;
  for (let i = llave; i < html.length; i++) {
    if (html[i] === '{') nivel++;
    if (html[i] === '}' && --nivel === 0) return html.slice(inicio, i + 1);
  }
  throw new Error(`No se pudo extraer ${nombre}`);
}

{
  const ctx = { URLSearchParams };
  vm.createContext(ctx);
  vm.runInContext(`${funcion('_sbCacheAplicarConsulta')}; this.f=_sbCacheAplicarConsulta;`, ctx);
  const filas = Array.from({ length: 338 }, (_, i) => ({
    id: `rc-${i}`,
    empresa_id: 'empresa-1',
    pedido_id: `pedido-${i}`,
    created_at: String(i).padStart(3, '0')
  }));
  const una = ctx.f(filas, 'select=id,pedido_id&empresa_id=eq.empresa-1&pedido_id=eq.pedido-211&limit=1');
  assert.equal(una.length, 1, 'El fallback debe respetar pedido_id');
  assert.equal(una[0].id, 'rc-211');
  assert.equal(ctx.f(filas, 'select=id&or=(id.eq.rc-1,id.eq.rc-2)'), null, 'Una consulta compleja no puede caer al cache completo');
}

{
  const ctx = { currentUser: { id: 'REP-1', role: 'repartidor' } };
  vm.createContext(ctx);
  vm.runInContext(`${funcion('_filtrarRutasParaUsuario')}; this.f=_filtrarRutasParaUsuario;`, ctx);
  const visibles = ctx.f({
    propia: { repartidorId: 'REP-1', finalizada: false },
    libre: { repartidorId: null, finalizada: false },
    ajena: { repartidorId: 'REP-2', finalizada: false },
    cerrada: { repartidorId: null, finalizada: true }
  });
  assert.deepEqual(Object.keys(visibles).sort(), ['libre', 'propia']);
}

assert.match(html, /var existentes=await _sbGetRaw\("ruta_clientes","select=id,ruta_id,pedido_id/);
assert.doesNotMatch(html, /sbDel\("ruta_clientes"/);
assert.match(html, /\/rpc\/ruta_clientes_quitar_seguro/);
assert.match(sql, /revoke delete, truncate on public\.ruta_clientes from public, anon, authenticated/i);
assert.match(sql, /insert into public\.ruta_clientes_bajas/i);
assert.match(sql, /update public\.backup_pedidos[\s\S]*ruta_vinculada_id=null/i);

console.log('OK rutas_integridad_v1: cache filtrado, Reparto y borrado seguro');
