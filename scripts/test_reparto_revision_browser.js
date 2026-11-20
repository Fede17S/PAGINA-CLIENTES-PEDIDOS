// Flujo con dos perfiles aislados. API simulada; la base se verifica aparte con ROLLBACK.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/feder/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const src=fs.readFileSync(process.argv[2]||'PANEL-index_15.html','utf8'),js=fs.readFileSync('reparto-revision-v1.js','utf8');
function fn(n){const s=src.indexOf('function '+n+'(');assert.ok(s>=0,n);const next=src.slice(s+10).search(/\n(?:async )?function /),b=src.slice(s,next<0?src.length:s+10+next),l=b.split('\n')[0];return l.trimEnd().endsWith('}')?l:b.slice(0,b.lastIndexOf('\n}')+2);}
const names=['_devEstado','_rechazoDefinitivo','_devEstadoLabel','_ncTieneRol','_ncPuedeAplicar','_ncPuedeRechazar','_ncLog','_devEsc','_devMotivoLabel','_devItemNom','_devItemCant','_devClone','_devClaveNota','_devEstadoEnPedido','_devBusyKey','_devAbrir','_devAdminVer','_devMostrar','_devProdChange','_devCerrar','_devRenderList','_devAgregar','_devDescuentoCli','_hrNums','_hrBadges'];
const funcs=names.map(n=>(src.slice(src.indexOf('function '+n)-6,src.indexOf('function '+n))==='async '?'async ':'')+fn(n)).join('\n');
const idx=src.indexOf('var _tpTab ='),tp=src.slice(src.lastIndexOf('(function(){',idx),src.indexOf('</script>',idx));
const styles=Array.from(src.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/g),m=>m[0]).join('\n');
const dev=src.slice(src.indexOf('<div id="dev-modal"'),src.indexOf('<!-- Devoluciones -->'));
const tarea=src.slice(src.indexOf('<div class="modal-bg" id="modal-tareas"'),src.indexOf('</header>',src.indexOf('<div class="modal-bg" id="modal-tareas"')));
// No tomar el resto del header: el modal de tareas termina justo antes del header principal.
const modalTareas=tarea.slice(0,tarea.indexOf('<header'));
const origin='https://reparto-qa.test';
function clone(x){return JSON.parse(JSON.stringify(x));}
function html(role,row){return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'<div style="padding:12px" id="tp-inicio-card"></div><div id="tp-bell-btn"></div><span id="tp-bell-badge"></span><span id="tp-sb-badge"></span><div id="hoja" style="display:none"></div><div id="badge"></div>'+modalTareas+dev+'<script>'+`
var currentUser={id:'qa_${role}',role:'${role}'},_sbEmpId='EMP-QA',empresaKey='QA',_devTarget=null,_devBusy={},_rutaMapaKey='R',notifications=[],calls=0;
var rutasData={R:{nombre:'Ruta QA',clientes:{C:${JSON.stringify(row)}}}},_mapaParadas=[{cliKey:'C',cli:rutasData.R.clientes.C}],_offlineQueue=[];
function showNotif(t){notifications.push(t)}function fM(n){return (+n).toFixed(2)}function escHtml(s){return String(s)}function getBackups(){return []}
async function _confirmar(){return true}function _guardarRutasOffline(){}function renderParadas(){}function renderRutas(){}function _ncDashRender(){}function _stkRefrescar(){return Promise.resolve()}
function _hrEsc(s){return String(s)}function _hrQ(s){return String(s)}function _calcularPedidoUnico(){return {ahorroItems:0,montoDscGen:0}}
function abrirModal(id){document.getElementById(id).classList.add('open')}function cerrarModal(id){document.getElementById(id).classList.remove('open')}
function _meMotivoRechazo(){return Promise.resolve('Cliente ausente')}function _esMotivoReprogramacion(m){return /otro día|reprogram/i.test(m)}function _meReprogramar(){throw Error('No era reprogramación')}
async function sbFetch(method,path,data){calls++;var r=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({role:currentUser.role,...data})});var j=await r.json();if(!r.ok)throw Error(j.error);return j}
async function _cargarRutasServidorSeguras(){return (await fetch('/rutas')).json()}function _filtrarRutasParaUsuario(x){return x}
function _enqueue(method,path,data){_offlineQueue.push({method,path,data});return Promise.resolve('QA-OP')}
`+funcs+tp+js+`_tpRefrescar();</script>`;}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{for(const width of [390,1280]){let row={id:'C',ruta_id:'R',empresa_id:'EMP-QA',nom:'Cliente QA',importe:1000,items:[{id:'P',n:'Producto QA',c:10,p:100}],devoluciones:[],rechazado:false,rechazo_confirmado:false,entregado:false,audit_log:[]},stock=100;const writes=[],errors=[];
 const setup=async role=>{const c=await browser.newContext({viewport:{width,height:900}});c.setDefaultTimeout(5000);await c.route('**/*',async route=>{const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
  if(u.pathname==='/rutas')return route.fulfill({json:{R:{clientes:{C:{...clone(row),rechazoConfirmado:row.rechazo_confirmado,motivoRechazo:row.motivo_rechazo||'',rechazadoEn:row.rechazado_en||''}}}}});
  if(u.pathname==='/rpc'){const d=req.postDataJSON();writes.push(d.p_accion);await new Promise(r=>setTimeout(r,40));let error='';
   if(['aplicar_nota','rechazar_nota','confirmar_rechazo','desestimar_rechazo'].includes(d.p_accion)&&d.role!=='admin')error='REVISION_SOLO_ADMIN';
   else if(d.p_accion==='notificar_nota'){let n=d.p_datos.nota;if(!row.devoluciones.some(x=>x.id===n.id))row.devoluciones.push({...n,estado:'notificada',stkDev:false});}
   else if(['aplicar_nota','rechazar_nota'].includes(d.p_accion)){let n=row.devoluciones.find(x=>x.id===d.p_datos.nota.id);if(n.estado!==d.p_datos.esperado)error='REVISION_CAMBIO_EN_OTRO_DISPOSITIVO';else{if(d.p_accion==='aplicar_nota'){stock+=n.cantidad;n.stkDev=true;n.estado='aplicada'}else n.estado='rechazada';}}
   else if(d.p_accion==='notificar_rechazo')Object.assign(row,{rechazado:true,rechazo_confirmado:false,motivo_rechazo:d.p_datos.motivo});
   else if(d.p_accion==='desestimar_rechazo')row.rechazado=false;
   else if(d.p_accion==='confirmar_rechazo'){stock+=10-row.devoluciones.filter(n=>n.stkDev).reduce((s,n)=>s+n.cantidad,0);row.rechazo_confirmado=true;row.devoluciones.forEach(n=>{n.estado='rechazada';n.stkDev=false})}
   return route.fulfill({status:error?409:200,json:error?{error}:{ok:true,parada:clone(row)}});
  }return route.fulfill({contentType:'text/html',body:html(role,clone(row))});});const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(origin);return {c,p};};
 const rep=await setup('repartidor'),adm=await setup('admin');console.log('QA '+width+': perfiles cargados',errors);
 await rep.p.evaluate(()=>_devAbrir(0));await rep.p.locator('#dev-prod').selectOption('Producto QA');await rep.p.locator('#dev-cant').fill('2');
 await rep.p.evaluate(()=>Promise.all([_devAgregar(),_devAgregar()]));console.log('QA devolución notificada');assert.equal(row.devoluciones.length,1);assert.equal(stock,100);assert.equal(writes.filter(x=>x==='notificar_nota').length,1,'doble toque creó dos notas');
 assert.equal(await rep.p.locator('#dev-list button[onclick^="_ncAplicar"]').count(),0);
 await adm.p.evaluate(()=>RepartoRevision.actualizar());assert.ok((await adm.p.locator('#tp-inicio-card').innerText()).includes('devolución(es) por revisar'));
 await adm.p.locator('#tp-inicio-card button').filter({hasText:'devolución(es) por revisar'}).click();await adm.p.evaluate(()=>_tpVerDev('R','C'));
 await adm.p.evaluate(()=>Promise.all([_ncAplicar(0),_ncAplicar(0)]));assert.equal(stock,102);assert.equal(writes.filter(x=>x==='aplicar_nota').length,1);assert.equal(await adm.p.evaluate(()=>_tpData.devols.length),0);
 const badge=await adm.p.evaluate(()=>_hrBadges('R','C',rutasData.R.clientes.C,{saldo:800},'pend'));assert.ok(badge.includes('devolución(es) aprobada(s)'));
 await adm.p.evaluate(()=>_devCerrar());
 await rep.p.evaluate(()=>_devCerrar());await rep.p.evaluate(()=>_meRechazar(0));assert.equal(stock,102);await adm.p.evaluate(()=>RepartoRevision.actualizar());assert.equal(await adm.p.evaluate(()=>_tpData.rechazos.length),1);
 await adm.p.evaluate(()=>_tpAbrirEn('rechazos'));assert.ok(await adm.p.getByRole('button',{name:'No aprobar',exact:true}).isVisible());
 await adm.p.evaluate(()=>document.getAnimations().forEach(a=>a.finish()));await adm.p.screenshot({path:'tmp/reparto-revision-'+width+'.png'});await adm.p.getByRole('button',{name:'No aprobar',exact:true}).click();await adm.p.waitForFunction(()=>_tpData.rechazos.length===0);assert.equal(stock,102);assert.equal(row.rechazado,false);
 await rep.p.evaluate(()=>{_mapaParadas[0].cli.rechazado=false});await rep.p.evaluate(()=>_meRechazar(0));await adm.p.evaluate(()=>RepartoRevision.actualizar());
 await adm.c.setOffline(true);await adm.p.evaluate(()=>_confirmarRechazo('R','C'));assert.equal(stock,102);assert.equal(await adm.p.evaluate(()=>_tpData.rechazos.length),1,'sin señal no debe desaparecer el aviso');
 await adm.c.setOffline(false);await adm.p.evaluate(()=>Promise.all([_confirmarRechazo('R','C'),_confirmarRechazo('R','C')]));assert.equal(stock,110);assert.equal(writes.filter(x=>x==='confirmar_rechazo').length,1);
 assert.deepEqual(errors,[]);await rep.c.close();await adm.c.close();console.log(width+'px: reparto → Inicio admin → aprobar/no aprobar → Hoja de Ruta; doble clic, sin conexión y parcial+total OK');
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
