const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const fixture = ['PANEL-index_15.html', 'index.html'].find(name => fs.existsSync(path.join(root, name)));
const panel = fs.readFileSync(path.join(root, fixture), 'utf8');
const { chromium } = require(process.env.CODEX_NODE_MODULES ? path.join(process.env.CODEX_NODE_MODULES, 'playwright') : 'playwright');

function between(start, end) {
  const a = panel.indexOf(start), b = panel.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, 'Falta el bloque ' + start);
  return panel.slice(a, b);
}
const css = Array.from(panel.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi), m => m[0]).join('\n');
const html = between('<div id="backup" class="section">', '<div id="pedidos-acum"');
const functions = [
  between('async function cargarBackupFirebase()', '// ══ BACKUP MULTI-SELECT'),
  between('var _bkSelectMode = false;', 'async function _bkReasignar()'),
  between('function renderBackup()', '// ══ TIPO COMPROBANTE'),
  between('async function _cambiarAprobacion(', 'var META_VENTAS =')
].join('\n');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 830 } });
      await page.route('**/*', route => route.abort());
      await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">${css}<div class="main">${html}</div>`, { waitUntil: 'domcontentloaded' });
      await page.addScriptTag({ content: functions });
      await page.evaluate(() => {
        Object.assign(window, {
          _sbEmpId: 'fixture', empresaKey: 'fixture', currentUser: { role: 'admin', id: 'admin' },
          _tengoRol: () => false, _renderBkDiasTabs: () => {}, rutasData: {}, _clientesDB: {},
          _bkTab: 'todos', _bkSelectMode: false, _bkSelected: new Set(), backupAbierto: null,
          _esPedidoTienda: () => false, _calcularPedidoUnico: () => ({ total: 1200, ahorroItems: 0, montoDscGen: 0 }),
          fM: n => String(n), showNotif: () => {}, _syncPendingBackups: () => {},
          confirmarBackupComoRemito: async b => { window.aprobados.push(b.id); }
        });
        window.pedidos = Array.from({ length: 70 }, (_, i) => ({ id: `pedido-${i}`, fecha: '2026-11-16T12:00:00Z', clienteNom: `Comercio ${i}`, items: [], tipoComprobante: 'remito' }));
        Object.assign(window, {
          aprobados: [], getBackups: () => window.pedidos, saveBackups: rows => { window.pedidos = rows; },
          _sbGetBackup: () => new Promise(resolve => { window.resolverCarga = resolve; })
        });
        Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
        document.getElementById('backup').classList.add('active');
        renderBackup();
      });
      const result = await page.evaluate(async () => {
        const sec = document.getElementById('backup');
        const card = i => document.getElementById(`bk-card-pedido-${i}`);
        const top = i => card(i).getBoundingClientRect().top - sec.getBoundingClientRect().top;
        const alinear = (i, offset) => { sec.scrollTop += top(i) - offset; };
        const aprobar = i => _cambiarAprobacion(pedidos.find(p => p.id === `pedido-${i}`), true);

        backupAbierto = 'pedido-30'; renderBackup(); alinear(30, -10);
        const antes = top(30);
        await aprobar(30);
        const despues = top(30);
        const aprobado = card(30).classList.contains('estado-aprobado');

        _bkTab = 'espera'; backupAbierto = 'pedido-31'; renderBackup(); alinear(31, -10);
        await aprobar(31);
        const filtrado = card(31) === null;
        const vecino = top(32);
        const pendiente = cargarBackupFirebase();
        // Seguir navegando mientras llega la respuesta; la posición nueva manda.
        alinear(38, -8);
        const enCarga = top(38);
        const nuevas = pedidos.map((p, i) => ({ ...p, _synced: true, fecha: new Date(Date.UTC(2026, 10, 16, 12, 0, 59 - i)).toISOString() }));
        pedidos = nuevas;
        resolverCarga([...nuevas, { ...nuevas[0], id: 'pedido-nuevo', fecha: '2026-11-16T14:00:00Z' }]);
        await pendiente;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const trasCarga = top(38);
        const desplazado = sec.scrollTop > 1000;
        const individuales = aprobados.slice();
        let confirmaciones = 0;
        window._confirmar = async () => { confirmaciones++; return true; };
        window._sbGetBackup = async id => ({ [id]: { ...pedidos.find(p => p.id === id) } });
        _bkToggleSelect();
        card(40).click(); card(41).click();
        alinear(40, -8);
        const textoBoton = document.getElementById('bk-aprobar-seleccionados').textContent;
        await _bkAprobarSeleccionados();
        return { antes, despues, aprobado, filtrado, vecino, enCarga, trasCarga, desplazado, individuales,
          lote: aprobados.slice(2), confirmaciones, textoBoton, vecinoLote: top(42), resultado: document.getElementById('bk-aprobar-resultado').textContent };
      });
      assert.deepEqual(result.individuales, ['pedido-30', 'pedido-31']);
      assert(result.aprobado && result.filtrado && result.desplazado, `${width}: ${JSON.stringify(result)}`);
      assert(Math.abs(result.antes - result.despues) < 2, `${width}: aprobar en Todos movió la tarjeta`);
      assert(Math.abs(result.vecino) < 2, `${width}: el siguiente pendiente no ocupó el lugar del aprobado`);
      assert(Math.abs(result.enCarga - result.trasCarga) < 2, `${width}: la sincronización movió la posición`);
      assert.deepEqual(result.lote, ['pedido-40', 'pedido-41']);
      assert.equal(result.confirmaciones, 1);
      assert.match(result.textoBoton, /Aprobar seleccionados \(2\)/);
      assert.match(result.resultado, /^2 aprobados/);
      assert(Math.abs(result.vecinoLote) < 2, `${width}: la aprobación en lote movió la posición`);
      console.log(`Backup: aprobación individual y en lote, filtros y actualización sin saltos (${width}px) OK`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
