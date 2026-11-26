const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.CODEX_NODE_MODULES?path.join(process.env.CODEX_NODE_MODULES,'playwright'):'playwright');
const root=path.join(__dirname,'..'), h=fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'PANEL-index_15.html'))?'PANEL-index_15.html':'index.html'),'utf8');
function parte(a,b){const i=h.indexOf(a),j=h.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return h.slice(i,j);}
const js=[parte('var _usuariosCreando =','async function _sbPatchUsuario'),parte('async function _sbGetListas(){','async function _sbPatchListas'),
  parte('var _listasPrecios = null,','// ── Gestor de listas ──'),parte('var _crVersionGPS=','// Calcula los productos más comprados'),
  parte('function _generarSiguienteId(todos)','async function _eliminarCliente'),parte('function _precioDe(p, lista)','function _pgQtyDe(')].join('\n');
const css=parte('.modal-bg {','.modal-cls:hover')+parte('.prov-inp {','.alta-cliente-estado {')+(h.match(/\.alta-cliente-estado \{[^}]+\}/)||[])[0];
const ui=parte('<!-- MODAL CLIENTE RÁPIDO','<!-- MODAL CARGA MASIVA DE STOCK')+parte('  <!-- Nuevo cliente -->','  <!-- CSV -->');
const boot=`var _sbEmpId='emp-fixture',currentUser={id:'A',role:'admin'},empresaData={usuarios:{}},_clientesDB={},_cliData={},dbCli=[],_pickersInitialized=false,_pedMetodoNuevo='',tipoLista={},avisos=[],draft=0;
  const $=s=>document.getElementById(s);
  async function sbFetch(method,endpoint,body){const r=await fetch(endpoint,{method,body:body?JSON.stringify(body):undefined});const x=await r.json();if(!r.ok)throw Object.assign(Error(x.message),x);return x;}
  function _sbGetRaw(t,q){return sbFetch('GET','/rest/v1/'+t+'?'+q);}
  function sbGet(t,q){return _sbGetRaw(t,q);}
  function sbPatch(t,q,b){return sbFetch('PATCH','/rest/v1/'+t+'?'+q,b);}
  function cerrarModal(id){$(id).classList.remove('open');}
  function _tengoRol(){return true;} function _esCoAdmin(){return false;}
  function _dirAutoComplete(){} function _auditar(){} function iniciarCliPickers(){} function _mostrarFrecuentes(){} function _pgRenderCats(){} function _setPedMetodo(){}
  function _renderClientesList(){$('gestion-lista').textContent=Object.values(_cliData).map(u=>u.name).join(', ');}
  function _pgRender(){$('precio-qa').textContent=_precioDe({precios:{cli:100,pat:120,vip:90,cons:155}},tipoLista.ped);}
  function _pedidoGuardarBorrador(){draft++;}
  function showNotif(m){avisos.push(m);} function showSaved(m){showNotif(m);}
  function _obtenerUbicacionActual(){return Promise.resolve({lat:-43.1,lng:-65.2});}
`;

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try{
    const page=await browser.newPage({viewport:{width:365,height:680},isMobile:true,deviceScaleFactor:2});
    page.setDefaultTimeout(4300);
    const errores=[],solicitudes=[];
    page.on('pageerror',e=>errores.push(e.message));
    const filas=Array.from({length:500},(_,i)=>({id:String(i+1).padStart(4,'0'),uid:'CL'+String(i+1).padStart(3,'0'),name:'Fixture '+i}));
    const listas=[['cli','Clientes'],['pat','Patagonia'],['l3','LISTA 3'],['vip','VIP'],['cons','Consumidor "Final" & Más']];
    let conflictoUnaVez=false,perderAck=false,bloquearLookup=false;
    await page.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url()),m=req.method(),q=u.searchParams;
      const ok=(json,status=200)=>route.fulfill({status,json});
      if(u.hostname==='nominatim.openstreetmap.org')return route.fulfill({json:{address:{road:'Calle de prueba',house_number:12,city:'Prueba'}},headers:{'Access-Control-Allow-Origin':'*'}});
      if(u.origin!=='https://alta-qa.test')return route.abort();
      if(u.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;--s2:#fff;--border:#ddd;--text:#171717;--accent:#254aab}.btn{padding:9px}.prov-inp{max-width:100%}${css}</style>${ui}<div id="gestion-lista"></div><button id="abrir" onclick="_abrirClienteRapido()">Abrir alta rápida</button><div id="cli-results-ped"></div><input id="cli-search-ped"><div id="cli-selected-ped"><span id="cli-selected-nom-ped"></span></div><input id="idCli-ped"><input id="nomCli-ped"><span id="badge-ped"></span><span id="precio-qa"></span><script>${boot}</script>`});
      solicitudes.push([m,u.pathname,u.search]);
      if(u.pathname.endsWith('/listas_precios')){assert.equal(q.get('empresa_id'),'eq.emp-fixture');return ok(listas.map(([lista_key,nombre],orden)=>({lista_key,nombre,orden,pct:0})));}
      if(u.pathname.endsWith('/zonas')){assert.equal(q.get('empresa_id'),'eq.emp-fixture');return ok([{id:'zona-centro',nombre:'Centro'}]);}
      if(u.pathname.endsWith('/usuarios')&&m==='GET'){
        assert.equal(q.get('empresa_id'),'eq.emp-fixture');
        if(q.has('uid')){if(bloquearLookup)return route.abort();return ok(filas.filter(f=>f.uid.toLowerCase()===q.get('uid').slice(6).toLowerCase()));}
        const sig=(q.get('id')||'gt.').slice(3);return ok(filas.filter(f=>f.id>sig).slice(0,500));
      }
      if(u.pathname.endsWith('/crear_usuario_seguro')&&m==='POST'){
        const b=req.postDataJSON();assert.equal(b.p_empresa_id,'emp-fixture');
        if(conflictoUnaVez){conflictoUnaVez=false;filas.push({id:'0501',uid:b.p_uid,name:'Otra alta'});}
        if(filas.some(f=>f.uid.toLowerCase()===b.p_uid.toLowerCase()))return ok({message:'USUARIO_DUPLICADO',code:'23505'},409);
        const id=String(filas.length+1).padStart(4,'0');filas.push({id,uid:b.p_uid,name:b.p_name,role:b.p_role,lista:b.p_lista,direccion:b.p_direccion,
          telefono:b.p_telefono,lat:b.p_lat,lng:b.p_lng,zona:b.p_zona,zona_id:b.p_zona_id,recepciona:b.p_recepciona,nota:b.p_nota});
        if(perderAck){perderAck=false;return route.abort();}
        return ok(id);
      }
      if(u.pathname.endsWith('/usuarios')&&m==='PATCH'){
        assert.equal(q.get('empresa_id'),'eq.emp-fixture');const f=filas.find(x=>x.id===q.get('id').slice(3));Object.assign(f,req.postDataJSON());return ok([f]);
      }
      return ok({message:'Endpoint inesperado'},404);
    });
    await page.goto('https://alta-qa.test/');await page.addScriptTag({content:js});
    await page.evaluate(()=>cargarListasPrecios());
    await page.locator('#cli-form-title').click();
    await page.locator('#nc-id').fill('cl074');await page.locator('#nc-name').fill('Alta Gestión');
    await page.locator('#nc-guardar-btn').click();await page.getByText('El ID cl074 ya está en uso.').waitFor();
    assert.equal(solicitudes.filter(r=>r[0]==='POST').length,0);
    assert.equal(await page.locator('#nc-name').inputValue(),'Alta Gestión');
    await page.locator('#nc-id').fill('');conflictoUnaVez=true;
    await page.locator('#nc-guardar-btn').click();await page.getByText('Alta Gestión',{exact:true}).waitFor();
    assert.equal(filas.find(f=>f.name==='Alta Gestión').uid,'CL502');
    assert(solicitudes.some(r=>r[2].includes('id=gt.0500')));
    await page.locator('#abrir').click();
    assert.deepEqual(await page.locator('#cr-lista option').allTextContents(),listas.map(x=>x[1]));
    assert.equal(await page.locator('#cr-cuit').isVisible(),false);
    await page.locator('#cr-nombre').fill('Alta Pedido');await page.locator('#cr-lista').selectOption('VIP');
    await page.locator('#cr-tel').fill('1112345678');await page.locator('#cr-ubic-btn').click();
    await page.getByText('Calle de prueba 12, Prueba — se guarda con el cliente.',{exact:false}).waitFor();
    await page.locator('#cr-mas summary').click();await page.locator('#cr-zona').fill('Centro');await page.locator('#cr-rec').fill('Recepción');
    await page.locator('#cr-cuit').fill('20123456780');await page.locator('#cr-nota').fill('Entregar por la mañana');
    const medida=await page.locator('.cr-box').boundingBox();assert(medida&&medida.x>=0&&medida.x+medida.width<=365&&medida.y>=0&&medida.y+medida.height<=680);
    perderAck=true;bloquearLookup=true;
    await page.locator('#cr-guardar-btn').click();await page.locator('#cr-estado:not([hidden])').waitFor();
    assert.equal(await page.locator('#cr-lista').inputValue(),'VIP');
    bloquearLookup=false;
    await page.locator('#cr-guardar-btn').click();await page.getByText('📋 VIP',{exact:true}).waitFor();
    const altas=filas.filter(f=>f.name==='Alta Pedido');assert.equal(altas.length,1);
    assert.deepEqual([altas[0].lista,altas[0].zona_id,altas[0].recepciona,altas[0].nota,altas[0].lat,altas[0].lng,altas[0].cuit],['VIP','zona-centro','Recepción','Entregar por la mañana',-43.1,-65.2,'20123456780']);
    assert.equal(await page.locator('#precio-qa').textContent(),'90');
    assert.equal(await page.evaluate(()=>draft),1);
    assert.deepEqual(errores,[]);
    console.log('Altas en navegador: ID ocupado y carrera, paginación, las 5 listas, precio VIP, dirección/GPS, datos opcionales y reintento sin duplicar OK');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
