const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const rec=require('../recaudacion-ruta-v1.js');
const src=fs.readFileSync(process.argv.slice(2).find(a=>!a.startsWith('--'))||(fs.existsSync('PANEL-index_15.html')?'PANEL-index_15.html':'index.html'),'utf8');
function entre(a,b){const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return src.slice(i,j);}
const hr={hr_num:'HR-0048',fecha:'2026-11-15T12:00:00Z'};
const filas=[
  {id:'1',ruta_id:'r1',ruta:hr,fecha:'2026-10-30T12:00:00Z',entregado_en:'2026-11-15T12:00:00Z',nom:'Pago mixto de prueba',
    entregado:true,importe:'250.00',efectivo:'100.00',transferencia:40,
    devoluciones:[{id:'ok',estado:'aplicada',motivo:'devolucion',monto:25},{id:'ok',estado:'aplicada',motivo:'devolucion',monto:25},
      {estado:'notificada',motivo:'faltante',monto:18},{estado:'rechazada',motivo:'devolucion',monto:20},{estado:'retirada',motivo:'faltante',monto:19},
      {estado:'aplicada',motivo:'rotura',monto:123,descuenta:true}],
    pagos_adicionales:[{monto:25,forma:'efectivo',fecha:'2026-11-19T14:00:00Z'},
      {monto:20,forma:'transferencia',fecha:'2026-11-20',cc_op_id:'ok1'},{monto:20,forma:'transferencia',fecha:'2026-11-20',cc_op_id:'ok1'},
      {monto:-20,forma:'anulacion',fecha:'2026-12-02',cc_op_id:'rev',revierte:'ok1'},{monto:7,forma:'mixto',fecha:'2026-11-20'}]},
  {id:'2',ruta_id:'r1',ruta:hr,nom:'Rechazo definitivo de prueba',importe:150,efectivo:35,rechazado:true,rechazo_confirmado:true,fecha:'2026-11-15'},
  {id:'3',ruta_id:'r1',ruta:hr,nom:'Rechazo pendiente de prueba',importe:80,efectivo:0,rechazado:true,fecha:'2026-11-15'},
  {id:'4',ruta_id:'r2',ruta:{hr_num:'HR-0047',fecha:'2026-10-31'},nom:'Pagó después del cierre anterior',importe:200,entregado:true,
    entregado_en:'2026-11-01T03:10:00Z',efectivo:200},
  {id:'5',ruta_id:'r2',ruta:{hr_num:'HR-0047',fecha:'2026-10-31'},nom:'Histórico sin fecha de entrega',importe:100,fecha:'2026-10-31T02:59:59Z',entregado:true,efectivo:100}
];
const original=JSON.stringify(filas);
assert.equal(rec.dia('2026-11-01T02:59:59Z'),'2026-10-31');
assert.equal(rec.dia('2026-11-01T03:00:00Z'),'2026-11-01');
assert.equal(rec.mesEntrega(filas[0]),'2026-11');
const n=rec.parada(filas[0]);
assert.deepEqual([n.total,n.desc,n.cobrado,n.saldo,n.efectivo,n.transferencia,n.otros],[22500,2500,17200,5300,12500,4000,700]);
assert.deepEqual([rec.parada(filas[1]).total,rec.parada(filas[1]).cobrado,rec.parada(filas[1]).excluido],[0,0,3500]);
assert.equal(rec.parada(filas[2]).total,8000);
const novHR=rec.periodo(filas.concat([filas[0]]),'2026-11',true);
const novCobro=rec.periodo(filas,'2026-11',false);
assert.equal(novHR.cobrado,17200);assert.equal(novHR.excluido,3500);
assert.equal(novCobro.cobrado,39200);assert.equal(novCobro.transferencia,6000);
const dic=rec.periodo(filas,'2026-12',false);
assert.equal(dic.cobrado,-2000);assert.equal(dic.transferencia,-2000);
assert.equal(rec.periodo(filas,'2026-10',false).estimado,10000);
const movimientos=[
  {ref_pedido:'venta:1:ef',origen:'venta',tipo:'ingreso',monto_cent:10000},
  {ref_pedido:'venta:1:ef',origen:'venta',tipo:'ingreso',monto_cent:10000,anulado:true},
  {ref_pedido:'venta:1:tr',origen:'venta',tipo:'ingreso',monto_cent:'4000'},
  {ref_pedido:'venta:2:ef',origen:'venta',tipo:'ingreso',monto_cent:3500},
  {ref_pedido:'venta:4:ef',origen:'venta',tipo:'ingreso',monto_cent:20000},
  {tipo:'ingreso',monto_cent:4500,origen:'manual'},
  {tipo:'egreso',monto_cent:3000,origen:'manual'}
];
const cuenta=rec.conciliar(novHR,movimientos);
assert.deepEqual(cuenta,{asentado:17500,diferencia:-1000,faltante:2500,exceso:3500,referencias:2,repetidas:0});
assert.equal(rec.conciliar(novHR,movimientos.concat([movimientos[0]])).repetidas,1);
assert.equal(JSON.stringify(filas),original);

const ruta={hrNum:hr.hr_num,nombre:'Rendición de prueba',clientes:Object.fromEntries(filas.filter(f=>f.ruta_id==='r1').map(f=>[f.id,{...f,pagosAdicionales:f.pagos_adicionales}]))};
class PDF {
  constructor(){this.internal={pageSize:{getWidth:()=>210,getHeight:()=>297}};this.lastAutoTable={finalY:90};this.textos=[];}
  text(t){this.textos.push(t);}
}
for(const name of ['setFont','setFontSize','setTextColor','autoTable','setFillColor','roundedRect','setDrawColor','line','addPage'])PDF.prototype[name]=()=>{};
let doc;
const ctx={window:{RecaudacionRuta:rec,jspdf:{jsPDF:PDF}},_rutaMapaKey:'r1',rutasData:{r1:ruta},currentUser:{},
  _getEmpDatos:()=>({nombre:'Distribuidora de prueba'}),_pdfTxt:String,fM:n=>String(n),_compartirPDF:d=>{doc=d;},showNotif:()=>{},empresaData:{}};
vm.createContext(ctx);
const fragmentos=[entre('function _rechazoDefinitivo(c)','function _devEstadoLabel'),entre('function _hrNums(cli)','function _hrEstado('),
  entre('function calcRuta(ruta)','function _poblarFiltroRepartidores'),entre('function _calcCierreCaja(ruta)','function abrirCierreCaja('),
  entre('function _meCompletarCobro(cli, ef, tr, metodo)','function _meInjectPagoInputs('),
  entre('function _meCierreReparto(){','function _cerrarAvisoRechazoPorReprogramacion')];
vm.runInContext(fragmentos.join('\n'),ctx);
const ef={},tr={};
ctx._meCompletarCobro(ruta.clientes['1'],ef,tr,'tr');
assert.deepEqual([ef.value,tr.value],['100','93']);
ctx._meCompletarCobro(ruta.clientes['1'],ef,tr,'tr');
assert.deepEqual([ef.value,tr.value],['100','93']);
ctx._meCompletarCobro(ruta.clientes['1'],ef,tr,'ef');
assert.deepEqual([ef.value,tr.value],['153','40']);
ctx._meCompletarCobro(ruta.clientes['2'],ef,tr,'ef');
assert.deepEqual([ef.value,tr.value],['153','40']);
assert.equal(ctx.calcRuta(ruta).total,305);
assert.equal(ctx.calcRuta(ruta).cobrado,172);
const cierre=ctx._calcCierreCaja(ruta);
assert.equal(cierre.cobrado,172);assert.equal(cierre.transferencia,40);assert.equal(cierre.efectivo,125);assert.equal(cierre.aRevisar,35);
assert.equal(cierre.debe,133);assert.equal(cierre.otros,7);
ctx._meCierreReparto();
const alLado=label=>doc.textos[doc.textos.indexOf(label)+1];
assert.equal(alLado('Cobrado en efectivo'),'$125');
assert.equal(alLado('Cobrado por transferencia'),'$40');
assert.equal(alLado('Otros medios / sin desglose'),'$7');
assert.equal(alLado('TOTAL COBRADO'),'$172');
assert.equal(alLado('Cobros en rechazos excluidos - revisar reintegro'),'$35');

console.log('Recaudación: centavos, dos bases de fecha, notas aprobadas, reversión por su medio, rechazos, conciliación y ambos cierres sin escrituras OK');
if(process.argv.includes('--browser'))browser().catch(e=>{console.error(e);process.exitCode=1;});

async function browser(){
  const {chromium}=require(process.env.CODEX_NODE_MODULES?path.join(process.env.CODEX_NODE_MODULES,'playwright'):'playwright');
  const b=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const p=await b.newPage({viewport:{width:390,height:820},acceptDownloads:true});
    p.setDefaultTimeout(7000);
    const css=entre('.fin-concilia {','.fin-bal-total');
    const ui=entre('  <div id="fin-balance"', '  <div class="fin-actions">');
    await p.route('**/*',r=>r.request().url()==='https://recaudacion-qa.test/'?r.fulfill({contentType:'text/html; charset=utf-8',body:
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>:root{--s2:#fff;--border:#ccc;--muted:#555}'+css+'</style><div id="finanzas">'+ui+'</div>'}):r.abort());
    await p.goto('https://recaudacion-qa.test/');
    await p.addScriptTag({path:path.join(__dirname,'../recaudacion-ruta-v1.js')});
    await p.evaluate(x=>{
      window._sbEmpId='qa-fixture';window.currentUser={id:'QA',role:'admin'};
      window.filas=x.filas;window.movs=x.movimientos;window.rutasData={r1:x.ruta};window._rutaMapaKey='r1';
      window.escHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
      window.fM=n=>Number(n).toLocaleString('es-AR',{minimumFractionDigits:2});
      window._getEmpDatos=()=>({nombre:'Distribuidora de prueba'});window.empresaData={};window._pdfTxt=String;
      window._finRender=()=>{};window._esCoAdmin=()=>currentUser.role==='co-admin';window._finAlertas=()=>{};
      window.showNotif=(m,t)=>{if(t==='err')throw Error(m);};
      window._compartirPDF=(doc,nombre)=>doc.save(nombre);window.peticiones=[];
      window.sbGet=async tabla=>tabla==='fin_cuentas'?[{id:'c1',tipo:'efectivo',rol_cobro:'efectivo'}]:[{id:'vend'}];
      window.sbPost=window.sbPatch=()=>{throw Error('La consulta no debe escribir');};
      window._sbGetRaw=async(tabla,q)=>{
        if(!q.includes('empresa_id=eq.qa-fixture')||!q.includes('limit=500'))throw Error('Consulta fuera de alcance');
        window.peticiones.push([tabla,q]);
        if(tabla==='fin_movimientos')return window.movs;
        if(tabla==='productos')return [];
        if(q.includes('select=id,items'))return [];
        if(window.failRoute)throw Error('Sin conexión');
        if(window.paginar) return q.includes('&id=gt.')?window.filas:Array.from({length:500},(_,i)=>({id:'p'+i,ruta_id:'antigua',ruta:{fecha:'2025-11-01'}}));
        return window.filas;
      };
    },{filas,movimientos,ruta});
    const deps=process.env.REC_QA_PDF_DEPS||path.join(__dirname,'../tmp');
    await p.addScriptTag({path:path.join(deps,'jspdf-2.5.1.umd.min.js')});
    await p.addScriptTag({path:path.join(deps,'jspdf-autotable-3.5.28.min.js')});
    const fin=[
      entre('var _finCuentas=[]','// ── Finanzas en SOLO LECTURA'),
      entre('function _finSoloLectura()','function _finBalCuenta'),
      entre('function _finCargar()','function _finRender(){'),
      entre('async function _finResultado(carga)','function _finSetPeriodo(')
    ];
    await p.addScriptTag({content:fin.concat(fragmentos).join('\n')});
    await p.evaluate(async()=>{document.getElementById('fin-recaudacion-mes').value='2026-11';window.paginar=true;await _finCargar();});
    assert.match(await p.locator('#fin-recaudacion-datos .fc-kpi').innerText(),/172,00/);
    assert.match(await p.locator('#fin-recaudacion-datos').textContent(),/Cobros en rechazos definitivos/);
    assert.match(await p.locator('#fin-recaudacion-datos').textContent(),/Diferencia neta por conciliar/);
    assert.ok(await p.evaluate(()=>peticiones.some(p=>p[1].includes('id=gt.p499'))));
    await p.locator('#fin-recaudacion-base').selectOption('cobro');
    assert.match(await p.locator('#fin-recaudacion-datos .fc-kpi').innerText(),/392,00/);
    await p.evaluate(async()=>{window.failRoute=true;await _finCargar();});
    assert.match(await p.locator('#fin-recaudacion-datos').textContent(),/pueden estar desactualizados/);
    const d=p.waitForEvent('download');
    await p.evaluate(()=>_meCierreReparto());
    const pdf=await d;
    if(process.env.REC_QA_PDF)await pdf.saveAs(process.env.REC_QA_PDF);
    assert.ok(pdf.suggestedFilename().includes('cierre_reparto'));
    console.log('Navegador: Finanzas paginada, mes de hoja o cobro, pérdida de conexión y PDF real de cierre OK');
  }finally{await b.close();}
}
