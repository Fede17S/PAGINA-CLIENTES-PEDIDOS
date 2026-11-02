const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const file = ['PANEL-index_15.html', 'index.html'].find(name => fs.existsSync(path.join(root, name)));
const panel = fs.readFileSync(path.join(root, file), 'utf8');
const start = panel.indexOf('function _cobNum(v)');
const end = panel.indexOf('function descontarStock(', start);
assert(start >= 0 && end > start, 'No se encontró el flujo de avisos de cobro');
const elements = new Map();
const writes = [], opened = [];
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-11-02T15:00:00Z'])); }
  static now() { return new Date('2026-11-02T15:00:00Z').getTime(); }
}
const ctx = {
  Date: TestDate, console, Intl,
  document: { getElementById(id) {
    if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {} });
    return elements.get(id);
  } },
  _sbEmpId: 'empresa-prueba',
  fM: n => Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  escHtml: value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  _cc2Fecha: value => new Date(value).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: 'short', year: 'numeric' }),
  _cc2NumeroWhatsApp: () => '5492804555088',
  _cc2AbrirWhatsAppSeguro: url => opened.push(url),
  _confirmar: async () => true,
  showNotif() {},
  sbFetch: async (method, url, payload) => { writes.push({ method, url, payload }); return []; }
};
vm.createContext(ctx);
vm.runInContext(panel.slice(start, end), ctx);
const base = {
  cliente_id: 'cliente-1', cliente_uid: '5231', cliente_nom: 'KIOSCO PILO 24/7',
  telefono: '2804555088', ruta_cliente_id: 'entrega-1190', remito_num: '1190',
  fecha_entrega: '2026-10-30T16:00:00-03:00', dias_atraso: 99,
  capital: '118128.00', interes: '0', saldo_cliente: '118128.00',
  alias_pago: 'alias.prueba', mensaje_plantilla: 'Hola {cliente}. Pendiente {monto_total}. {datos_pago}'
};
const rows = [0, 1, 2].map(stage => ({ ...base, aviso_id: 'aviso-' + stage, etapa_dias: stage }));
function render(input) {
  ctx._cobAvisosGrupos = ctx._cobAgrupar(input);
  ctx._cobAvisosRender();
  return elements.get('cob-avisos-body').innerHTML;
}

async function main() {
  const original = JSON.stringify(rows);
  const html = render(rows);
  assert.strictEqual((html.match(/class="cob-doc"/g) || []).length, 1, 'El mismo remito no debe aparecer tres veces por sus etapas de aviso');
  assert.strictEqual((html.match(/Remito 1190/g) || []).length, 1);
  assert.strictEqual((html.match(/3 días de atraso desde la entrega/g) || []).length, 1, 'El atraso debe aparecer una sola vez y contar desde la entrega, no desde el vencimiento');
  assert(elements.get('cob-avisos-meta').textContent.includes('1 entrega pendiente'));
  const group = ctx._cobAvisosGrupos[0];
  assert.strictEqual(group.saldo, 118128, 'Agrupar etapas no debe multiplicar el saldo');
  const msg = ctx._cobMensajeGrupo(group);
  assert.strictEqual((msg.match(/Remito 1190/g) || []).length, 1, 'WhatsApp debe incluir cada entrega una sola vez');
  assert.strictEqual((msg.match(/3 días de atraso desde la entrega/g) || []).length, 1);
  assert(msg.includes('Alias: alias.prueba'));
  assert.strictEqual(JSON.stringify(rows), original, 'No se deben modificar los datos originales ni los días usados por la programación');

  await ctx._cobAbrirWhatsApp(0);
  assert.strictEqual(opened.length, 1);
  assert.strictEqual(decodeURIComponent(opened[0].split('?text=')[1]), msg);
  assert.strictEqual(writes.length, 1);
  assert.strictEqual(writes[0].payload.p_estado, 'abierto');
  assert.strictEqual(JSON.stringify(writes[0].payload.p_ids.slice().sort()), JSON.stringify(['aviso-0', 'aviso-1', 'aviso-2']), 'Abrir WhatsApp debe actualizar todas las etapas agrupadas');
  ctx._cobAvisosCargar = async () => {};
  await ctx._cobMarcarGrupo(0, 'enviado');
  await ctx._cobMarcarGrupo(0, 'omitido');
  for (const write of writes) {
    assert.strictEqual(write.url, '/rest/v1/rpc/cobranza_marcar_avisos_v1');
    assert.strictEqual(write.payload.p_empresa_id, 'empresa-prueba');
    assert.strictEqual(write.payload.p_ids.length, 3, 'No deben quedar etapas pendientes que hagan reaparecer el detalle');
  }

  const two = render([...rows, { ...base, aviso_id: 'otro-aviso', ruta_cliente_id: 'otra-entrega', capital: 500, fecha_entrega: '2026-11-01T15:00:00Z' }]);
  assert.strictEqual((two.match(/class="cob-doc"/g) || []).length, 2, 'No se deben fusionar dos entregas reales aunque tengan el mismo número de remito');
  assert(two.includes('1 día de atraso desde la entrega'));
  assert(elements.get('cob-avisos-meta').textContent.includes('2 entregas pendientes'));
  const twoMsg = ctx._cobMensajeGrupo(ctx._cobAvisosGrupos[0]);
  assert.strictEqual((twoMsg.match(/Remito 1190/g) || []).length, 2);
  assert(twoMsg.includes('$500,00'), 'Cada entrega mantiene su importe, sin sumar etapas');

  assert.strictEqual(ctx._cobDiasDesdeEntrega('2026-11-02'), 0, 'Una fecha sin hora no debe retroceder un día por la zona horaria');
  assert.strictEqual(ctx._cobDiasDesdeEntrega('2026-11-02T01:00:00Z'), 1, 'Debe respetar el día de entrega en Argentina');
  assert.strictEqual(ctx._cobDiasDesdeEntrega('2026-11-02T23:55:00-03:00', new Date('2026-11-03T00:05:00-03:00')), 1, 'Contar días calendario, no períodos completos de 24 horas');
  assert.strictEqual(ctx._cobDiasDesdeEntrega('2026-11-05'), 0, 'Nunca debe mostrar días negativos');
  assert.strictEqual(ctx._cobDiasDesdeEntrega('sin fecha'), null);
  assert.strictEqual(ctx._cobDiasDesdeEntrega(null), null, 'Una fecha ausente no es el año 1970');

  const today = render([{ ...base, aviso_id: 'hoy', fecha_entrega: '2026-11-02' }]);
  assert(today.includes('Entregado hoy'));
  assert(!today.includes('99'));
  const noDate = render([{ ...base, aviso_id: 'sin-fecha', fecha_entrega: null }]);
  assert(noDate.includes('Fecha de entrega no disponible'));
  assert(!noDate.includes('NaN') && !noDate.includes('Invalid Date'));

  render([{ ...base, aviso_id: 'unico', mensaje_plantilla: '{cliente}\n{detalle}\n{datos_pago}' }]);
  const templateMsg = ctx._cobMensajeGrupo(ctx._cobAvisosGrupos[0]);
  assert.strictEqual((templateMsg.match(/Remito 1190/g) || []).length, 1, 'No agregar un segundo detalle cuando la plantilla ya lo incluye');
  const missingIds = render([{ ...base, ruta_cliente_id: null, aviso_id: 'a' }, { ...base, ruta_cliente_id: null, aviso_id: 'b' }]);
  assert.strictEqual((missingIds.match(/class="cob-doc"/g) || []).length, 2, 'Sin ID de entrega, no deduplicar por nombre, importe o número');
  render([...rows, ...rows]);
  await ctx._cobMarcarGrupo(0, 'enviado');
  assert.strictEqual(writes[writes.length - 1].payload.p_ids.length, 3, 'Los IDs de aviso enviados deben ser únicos');
  console.log('Cobranzas: detalle único, días desde entrega, WhatsApp e IDs de todas las etapas OK');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
