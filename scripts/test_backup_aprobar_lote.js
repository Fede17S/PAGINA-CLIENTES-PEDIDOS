const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const file = ['PANEL-index_15.html', 'index.html'].find(p => fs.existsSync(path.join(root, p)));
const panel = fs.readFileSync(path.join(root, file), 'utf8');
function between(start, end) {
  const a = panel.indexOf(start), b = panel.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, start);
  return panel.slice(a, b);
}
const source = [
  between('var _bkSelectMode = false;', 'async function _bkReasignar()'),
  between('async function _sbGetBackup(', 'async function _sbInsertBackup('),
  between('async function _bkCargarCostosAprobacion()', '// Comparte un PDF de jsPDF'),
  between('async function _cambiarAprobacion(', '// Detecta el contenedor')
].join('\n');

const rows = ['a', 'b', 'fallido', 'rechazado', 'viejo', 'sin-seleccionar'].map(id => ({ id, _sbId:id, clienteNom:id, aprobado:id==='rechazado'?false:null }));
const current = Object.fromEntries(rows.map(r => [r.id, { id:r.id, cliente_nom:r.clienteNom, aprobado:r.id==='viejo'?true:r.aprobado, estado:'recibido', items:[] }]));
const notices = [], sales = [], patches = [], reads = [];
let costs = 0, renders = 0, confirms = 0, answer = false;
const elements = Object.fromEntries(['bk-aprobar-seleccionados','bk-aprobar-resultado','bk-sel-count'].map(id => [id, { style:{} }]));
const ctx = vm.createContext({
  _sbEmpId:'empresa-fixture', currentUser:{ id:'admin', role:'admin' }, _tengoRol:() => false, _editBkItem:null,
  document:{ getElementById:id => elements[id] || null }, navigator:{ onLine:true },
  console:{log(){},warn(){}}, showNotif:(...msg) => notices.push(msg), renderBackup:() => renders++,
  getBackups:() => rows, saveBackups:saved => assert.equal(saved, rows),
  _confirmar:async () => { confirms++; return answer; },
  _calcularPedidoUnico:b => ({ items:b.items, total:100, ahorroItems:0, montoDscGen:0 }),
  _bkHistAgregar:() => [], _bkHistEvento:() => ({}), fM:String,
  _stkSalidaDirecta:() => assert.fail('El lote no debe mover stock'),
  _sbGetRaw:async (table, query) => {
    assert.equal(table,'backup_pedidos');
    assert.match(query,/empresa_id=eq\.empresa-fixture/);
    const id=/&id=eq\.([^&]+)/.exec(query)[1]; reads.push(id);
    return current[id] ? [current[id]] : [];
  },
  sbGet:async table => { assert.equal(table,'productos'); costs++; return []; },
  _ventaGuardarPedido:async (bk, payload) => { assert.equal(payload.empresa_id,'empresa-fixture'); sales.push(bk.id); },
  sbPatch:async (table, query, payload) => {
    assert.equal(table,'backup_pedidos'); assert.match(query,/empresa_id=eq\.empresa-fixture&aprobado=is\.null&ruta_vinculada_id=is\.null/);
    const id=/^id=eq\.([^&]+)/.exec(query)[1]; patches.push(id);
    assert.equal(payload.aprobado,true); assert.equal(payload.estado,'recibido');
    if(id==='fallido') return []; // No considerar aprobado si el servidor no devuelve ninguna fila.
    current[id].aprobado=true; return [{id, aprobado:true}];
  }
});
vm.runInContext(source, ctx);
ctx._bkSelectMode=true;
['a','b','fallido','rechazado','viejo'].forEach(id => ctx._bkSelected.add(id));

(async () => {
  await ctx._bkAprobarSeleccionados();
  assert.equal(confirms,1); assert.deepEqual(reads,[]); assert.deepEqual(patches,[]);
  answer=true; ctx.currentUser={id:'vendedor',role:'vendedor'};
  await ctx._bkAprobarSeleccionados(); assert.equal(confirms,1,'Un vendedor no puede aprobar el lote');
  ctx.currentUser={id:'admin',role:'admin'};
  ctx.navigator.onLine=false;
  await ctx._bkAprobarSeleccionados(); assert.equal(confirms,1,'No ofrecer confirmar sin conexión');
  ctx.navigator.onLine=true;
  const proceso=ctx._bkAprobarSeleccionados();
  await ctx._bkAprobarSeleccionados(); // Doble toque mientras el primer lote está activo.
  await proceso;
  assert.equal(confirms,2);
  assert.deepEqual(reads,['a','b','fallido','viejo']);
  assert.deepEqual(sales,['a','b','fallido']);
  assert.deepEqual(patches,['a','b','fallido']);
  assert.equal(costs,1,'Sólo una lectura de costos para todo el lote');
  assert.equal(renders,1,'El lote sólo refresca al finalizar');
  assert.deepEqual(rows.map(r => r.aprobado),[true,true,null,false,true,null]);
  assert(ctx._bkSelected.has('fallido') && !ctx._bkSelected.has('a') && !ctx._bkSelected.has('viejo'));
  assert.match(elements['bk-aprobar-resultado'].textContent,/2 aprobados · 2 omitidos · 1 con error/);
  assert.match(elements['bk-aprobar-resultado'].textContent,/fallido/);
  console.log('Lote Backup: permisos, conexión, confirmación única, revalidación, omisiones y errores OK');
})().catch(error => { console.error(error); process.exitCode=1; });
