const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.CODEX_NODE_MODULES?path.join(process.env.CODEX_NODE_MODULES,'playwright'):'playwright');
const panel=['PANEL-index_15.html','index.html'].map(p=>path.join(__dirname,'..',p)).find(p=>fs.existsSync(p));
const html=fs.readFileSync(panel,'utf8');
function parte(a,b){const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return html.slice(i,j);}
const codigo=[
  parte('async function _confirmarPedido(){','// Modal que muestra total'),
  parte('var _pedidoBorradorScope=', 'async function generarPDF(m){'),
  parte('async function _sbInsertBackup(data){','async function _sbGetCC('),
  parte('function _pedidoLocalScope(){','function subirBackupFirebase'),
  parte('var _bkItemPendiente = null;','var _bkEntregaId = null'),
  parte('async function _confirmarTipoYFecha(', '// ══════════════ ANIMACIÓN PEDIDO COMPLETADO'),
  parte('function actualizarEstadoConexion(){','// Sincronización de lectura entre equipos.')
].join('\n');
const fixture=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <section id="pedido"><input id="idCli-ped"><input id="nomCli-ped"><textarea id="obs-ped" oninput="_pedidoGuardarBorrador()"></textarea>
  <button id="revisar" onclick="_confirmarPedido()">Revisar pedido</button></section>
  <div id="modal-tipo-comprobante" hidden><div id="tc-modal-titulo"></div><div id="tc-paso-tipo">
  <span id="tc-precio-remito"></span><span id="tc-precio-iva"></span>
  <button onclick="elegirTipoComprobante('remito')">Remito</button>
  <button onclick="elegirTipoComprobante('factura_a')">Factura A</button></div>
  <div id="tc-paso-fecha" style="display:none"><div id="tc-fechas-opciones"></div></div></div>
  <script>
    var _sbEmpId='empresa-fixture',currentUser={id:'VEN-A',name:'Vendedor A'},empresaData={diasEntrega:['lunes','martes','miercoles','jueves','viernes','sabado']};
    var ordenes={ped:[]},dscGen={ped:null},tipoLista={ped:'Clientes'},dbStock=[{id:'p',precioBase:25}],rutaAbierta='unaRuta',rutasData={unaRuta:{clientes:{c:{nom:'Cliente A'}}}};
    var notices=[],opened=0,pdf=0,ruta=0,stock=0,ofertas=0,modo='ok',_tabActual='pedido',_confirmandoPedidoStock=false;
    var stockData={p:4},storeFail=false;
    const set=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(storeFail&&k.includes('pedidos_local_v1')&&!k.endsWith(':borrador'))throw Error('cuota local');set.call(this,k,v);};
    var pedidos={},rpcCalls=[],consultas=[],mostrarok=0;
    function _desgloseDescuentosItems(){return {ahorroPromos:0};}
    function _cartRevalidarPromos(){}
    function _famMinValidarPedido(){return {ok:true};}
    function _pedConfirmarDescuentosFuertes(){return Promise.resolve(true);}
    function _abrirCartModal(){}
    function _cerrarCartModal(){}
    function generarPDF(m){if(m==='pedido')return _prepararPedidoSinPdf();pdf++;throw Error('No se debe necesitar el PDF');}
    function fM(n){return String(n);}
    function showNotif(msg){notices.push(msg);}
    function _updateBanner(){}
    function _syncQueue(){}
    function _limpiarCacheViejo(){}
    function _ctrlStockOn(){return true;}
    function _stkItems(a){return a.map(x=>({id:x.id,c:x.c}));}
    function _bkHistEvento(tipo,titulo,detalle){return {tipo,titulo,detalle};}
    function _sbGetStockFull(){return Promise.resolve({p:4-stock});}
    function _ofSumarUsadas(){ofertas++;}
    function abrirModal(id){document.getElementById(id).hidden=false;opened++;}
    function cerrarModal(id){document.getElementById(id).hidden=true;}
    function getBackups(){return JSON.parse(localStorage.getItem('qa-bk')||'[]');}
    function saveBackups(x){localStorage.setItem('qa-bk',JSON.stringify(x));}
    function renderBackup(){}
    function limpiarFormulario(){ordenes.ped=[];dscGen.ped=null;['idCli-ped','nomCli-ped','obs-ped'].forEach(id=>document.getElementById(id).value='');_pedidoGuardarBorrador();}
    function limpiarCliente(){}
    function fbPatchQ(){ruta++;return Promise.resolve();}
    function renderItems(){_pedidoGuardarBorrador();}
    function _elegirCliente(t,c){document.getElementById('idCli-ped').value=c.id;document.getElementById('nomCli-ped').value=c.nombre;tipoLista.ped=c.lista;}
    function _mostrarPedidoOk(){mostrarok++;}
    async function _pedActualizarDisponibilidadRemota(){return new Map([['p',{activo:modo!=='bloqueado'}]]);}
    async function _sbGetRaw(tabla,query){
      consultas.push([tabla,query]);const id=decodeURIComponent(query.match(/local_id=eq\.([^&]+)/)[1]);
      return pedidos[id]?[{id:pedidos[id].pedido_id,remito_num:pedidos[id].remito_num}]:[];
    }
    async function sbFetch(verb,endpoint,data){
      if(!navigator.onLine)throw Error('no se puede enviar offline');
      rpcCalls.push(data);if(pedidos[data.p_local_id])return {...pedidos[data.p_local_id],repetido:true};
      if(modo==='stock'){const e=Error('STOCK_INSUFICIENTE: Producto p');throw e;}
      if(modo==='cortePrevio')throw Error('Failed to fetch');
      stock+=data.p_items_stock[0].c;
      const r={ok:true,repetido:false,pedido_id:'server-'+rpcCalls.length,remito_num:'00'+rpcCalls.length};
      pedidos[data.p_local_id]=r;
      if(modo==='cortePosterior')throw Error('Failed to fetch');
      return r;
    }
    function cargar(cliente,c,nota){
      _pedidoRestaurarBorrador();_elegirCliente('ped',{id:cliente,nombre:'Cliente '+cliente,lista:'Clientes'});
      ordenes.ped=[{id:'p',n:'Producto',p:100,c:c,sub:c*100,ofNormal:150,ofPrecio:100,ofAplicada:true}];
      dscGen.ped={tipo:'%',valor:10};document.getElementById('obs-ped').value=nota;renderItems();
    }
  </script><script>${codigo}</script>`;

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const page=await context.newPage(), errors=[];
    page.on('pageerror',e=>{errors.push(e.message);console.error('Error en la página de prueba:',e.message);});
    page.setDefaultTimeout(6000);
    await page.route('https://offline-qa.test/',r=>r.fulfill({contentType:'text/html',body:fixture}));
    await page.goto('https://offline-qa.test/');
    const pausar=()=>page.evaluate(()=>{clearTimeout(_bkSyncTimer);_bkSyncTimer=null;});
    const armar=(id,n,obs)=>page.evaluate(([id,n,obs])=>cargar(id,n,obs),[id,n,obs]);
    async function confirmar(tipo='Remito'){
      await page.getByRole('button',{name:'Revisar pedido'}).click();
      await page.getByRole('button',{name:tipo,exact:true}).click();
      await page.locator('#tc-fechas-opciones button[data-f]').first().click();
      await page.waitForFunction(()=>!_pedidoCaptura);
    }
    await context.setOffline(true);
    await armar('A',2,'Anotación sin señal');
    await page.reload();
    await page.evaluate(()=>_pedidoRestaurarBorrador());
    assert.equal(await page.locator('#obs-ped').inputValue(),'Anotación sin señal');
    assert.equal(await page.evaluate(()=>ordenes.ped[0].c),2);
    await confirmar('Factura A');
    const guardado=await page.evaluate(()=>({cola:_bkQueueGet(),items:ordenes.ped.length,stock,pdf,ruta}));
    assert.equal(guardado.items,0);assert.equal(guardado.cola.length,1);
    assert.equal(guardado.stock+guardado.pdf+guardado.ruta,0);
    assert.equal(guardado.cola[0].data.total,180);
    assert.equal(guardado.cola[0].data.totalConIVA,217.8);
    assert.equal(guardado.cola[0].data.tipoComprobante,'factura_a');
    assert.equal(guardado.cola[0].data.items[0].cost,25);
    assert.match(guardado.cola[0].data.fechaEntrega,/^\d{4}-\d{2}-\d{2}$/);

    // La cola persiste después de cerrar la vista y no cruza perfil ni empresa.
    await page.reload();
    assert.equal(await page.evaluate(()=>_bkQueueGet().length),1);
    assert.equal(await page.evaluate(()=>{currentUser={id:'VEN-B'};return _bkQueueGet().length;}),0);
    assert.equal(await page.evaluate(()=>{currentUser={id:'VEN-A'};_sbEmpId='otra';const n=_bkQueueGet().length;_sbEmpId='empresa-fixture';return n;}),0);
    await armar('B',3,'Segundo pedido en edición');
    await page.evaluate(()=>{modo='cortePosterior';});
    // Reaparece la señal mientras B está abierto. A se aplicó en el servidor
    // pero se perdió la respuesta; vuelve a intentarse con el mismo ID.
    await context.setOffline(false);
    await page.waitForFunction(()=>!_bkSyncBusy&&rpcCalls.length===1);
    await pausar();
    assert.equal(await page.evaluate(()=>_bkQueueGet().length),1);
    await page.evaluate(()=>{modo='bloqueado';return _syncPendingBackups(true);});
    assert.equal(await page.evaluate(()=>rpcCalls.length),1);
    assert.equal(await page.evaluate(()=>stock),2);
    assert.equal(await page.evaluate(()=>_bkQueueGet().length),0);
    assert.equal(await page.evaluate(()=>getBackups()[0]._remitoNum),'001');
    assert.equal(await page.locator('#obs-ped').inputValue(),'Segundo pedido en edición');
    assert.equal(await page.evaluate(()=>ordenes.ped[0].c),3);

    // Si el equipo no logra escribir la cola, no se borra ni se envía el carrito.
    await context.setOffline(true);
    await page.evaluate(()=>{storeFail=true;});
    await confirmar();
    assert.equal(await page.evaluate(()=>ordenes.ped[0].c),3);
    assert.equal(await page.evaluate(()=>_bkQueueGet().length),0);
    await page.evaluate(()=>{storeFail=false;modo='stock';});
    await confirmar();
    await context.setOffline(false);
    await page.waitForFunction(()=>!_bkSyncBusy&&_bkQueueGet()[0]?.pausaSincronizacion===true);
    assert.equal(await page.evaluate(()=>_bkQueueGet()[0].errorDetalle.codigo),'STOCK_INSUFICIENTE');
    assert.equal(await page.evaluate(()=>stock),2);
    await page.evaluate(()=>{modo='ok';return _syncPendingBackups(true);});
    assert.equal(await page.evaluate(()=>_bkQueueGet().length),0);
    assert.equal(await page.evaluate(()=>stock),5);
    await armar('C',1,'Corregir si no hay stock');
    await page.evaluate(()=>{modo='stock';});
    await confirmar();
    assert.equal(await page.evaluate(()=>_bkQueueGet().length),0);
    assert.equal(await page.locator('#obs-ped').inputValue(),'Corregir si no hay stock');
    assert.equal(await page.evaluate(()=>stock),5);
    assert.deepEqual(errors,[]);
    console.log('Modo avión: pedido y borrador durables, IVA y entrega, reconexión sin borrar el nuevo carrito, respuesta perdida sin duplicar stock, sin espacio y stock insuficiente OK.');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
