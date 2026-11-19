const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const panel=fs.readFileSync(fs.existsSync('PANEL-index_15.html')?'PANEL-index_15.html':'index.html','utf8');
const code=fs.readFileSync('sync-avisos-v1.js','utf8');
function build(){
 const memory=new Map(),notices=[],banner={style:{}},account={};let blocked='';
 const ctx={console:{warn:()=>{}},URL,Blob,Date,Math,JSON,encodeURIComponent,clearTimeout:()=>{},setTimeout:()=>1,
  navigator:{onLine:true,userAgent:'QA'},_sbEmpId:'EMP1',empresaKey:'EMP1',currentUser:{id:'ADMIN',role:'admin'},_offlineQueue:[],_isSyncing:false,_syncLastError:null,
  document:{getElementById:id=>id==='sync-avisos-modal'?{}:id==='offline-banner'?banner:id==='cuenta-sync-avisos'?account:id==='app-version-tag'?{textContent:'QA'}:null},
  localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>{if(blocked&&k.includes(blocked))throw Error('QuotaExceeded');memory.set(k,v);}},
  _ofKey:()=> 'cola-EMP1',_saveQueue:()=>{},_updateBanner:()=>{banner.style.display='flex';},_confirmar:async()=>true,showNotif:t=>notices.push(t),
  StockSeguro:{esDiferida:op=>op.method==='STOCK_OUT'||!!op.requiereRevision}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);
 return {ctx,api:ctx.SyncAvisos,memory,notices,banner,setBlock:s=>blocked=s};
}
(async()=>{
 const a=build(),{ctx,api}=a;
 const op={id:'op-1',method:'ROUTE_MOVE',path:'empresas/EMP1/rutas/SECRETO/clientes',ts:'2026-11-19',desc:'Cliente Privado',data:{password:'CLAVE_PRIVADA',telefono:'5492809999999',items:[{nombre:'PRODUCTO_PRIVADO'}]}};
 const error=Object.assign(new Error('insert or update on table "ruta_clientes" violates foreign key constraint "ruta_clientes_ruta_id_fkey"'),{code:'23503',status:409,details:'Key (ruta_id)=(ruta-que-no-existe) is not present in table "rutas".',hint:'authorization=Bearer eyJtest.test.test',requestId:'request-123'});
 api.registrar(op,error);assert.equal(op.pausaSincronizacion,true);assert.equal(op.errorDetalle.codigo,'23503');assert.equal(op.errorDetalle.http,409);
 const text=api.reporte(op);for(const secret of ['CLAVE_PRIVADA','5492809999999','PRODUCTO_PRIVADO','Cliente Privado','eyJtest.test.test'])assert.ok(!text.includes(secret),secret);
 assert.ok(text.includes('ruta-que-no-existe'));assert.ok(text.includes('request-123'));assert.equal(api.telefono,'5492805065662');
 assert.ok(api.redactar('Failing row contains (cliente, telefono, contraseña)').includes('omitido'));
 assert.ok(!api.redactar('Teléfono: +54 9 280 506-5662').includes('506-5662'));
 assert.ok(!api.redactar('Key (nombre)=(CLIENTE PRIVADO)').includes('CLIENTE PRIVADO'));
 ctx._offlineQueue=[op];api.ocultar();ctx._updateBanner();assert.equal(a.banner.style.display,'none');assert.equal(ctx._offlineQueue.length,1);
 op.intentos=9;op.ultimoIntento='otra hora';ctx._updateBanner();assert.equal(a.banner.style.display,'none','No reaparece por el mismo reintento');
 ctx._offlineQueue.push({id:'nueva',method:'PATCH',path:'rutas'});ctx._updateBanner();assert.equal(a.banner.style.display,'flex','Aviso nuevo vuelve a aparecer');
 ctx._offlineQueue=[op];ctx.currentUser={id:'VENDEDOR',role:'vendedor'};assert.equal(await api.archivar(op.id),false);assert.equal(ctx._offlineQueue.length,1);
 ctx.currentUser={id:'ADMIN',role:'admin'};ctx._confirmar=async()=>false;assert.equal(await api.archivar(op.id),false);
 ctx._confirmar=async()=>true;a.setBlock('archivo');assert.equal(await api.archivar(op.id),false);assert.equal(ctx._offlineQueue.length,1);
 a.setBlock('cola');assert.equal(await api.archivar(op.id),false);assert.equal(ctx._offlineQueue.length,1,'Si no guarda la cola no elimina en memoria');
 assert.ok(a.memory.get('distribix:sync:archivo:EMP1').includes('CLAVE_PRIVADA'),'El respaldo local conserva datos para recuperación, pero no se exporta en el reporte');
 a.setBlock('');assert.equal(await api.archivar(op.id),true);assert.equal(ctx._offlineQueue.length,0);assert.equal(a.memory.get('cola-EMP1'),'[]');
 assert.equal(JSON.parse(a.memory.get('distribix:sync:archivo:EMP1')).length,1);
 // No archivar una operación que cambió o si cambió la sesión durante la confirmación.
 const b=build();b.ctx._offlineQueue=[{...op}];b.ctx._confirmar=async()=>{b.ctx._sbEmpId='OTRA';return true;};assert.equal(await b.api.archivar(op.id),false);assert.equal(b.ctx._offlineQueue.length,1);
 const stale=build();stale.ctx._offlineQueue=[{...op}];stale.memory.set('cola-EMP1',JSON.stringify([{...op},{id:'alta-de-otra-pestana'}]));
 assert.equal(await stale.api.archivar(op.id),false);assert.equal(stale.ctx._offlineQueue.length,1);assert.ok(stale.memory.get('cola-EMP1').includes('alta-de-otra-pestana'));
 // Reintentar respeta el orden y nunca habilita stock.
 const c=build();let attempts=0;c.ctx._syncQueue=async()=>attempts++;c.ctx._offlineQueue=[{id:'primera',method:'PATCH'},{id:'segunda',method:'PATCH'}];
 await c.api.reintentar('segunda');assert.equal(attempts,0);await c.api.reintentar('primera');assert.equal(attempts,1);
 c.ctx._offlineQueue=[{id:'stock',method:'STOCK_OUT'}];await c.api.reintentar('stock');assert.equal(attempts,1);
 // Transporte conserva código/HTTP/detalle y no imprime credenciales.
 const transport=panel.slice(panel.indexOf('function _sbFetchTransporte'),panel.indexOf('// ===== LOG DE AUDITORÍA'));
 const tc={currentUser:null,_sbEmpId:null,_empToken:null,_empTokenVigente:()=>true,SB_HDR:{},SB_URL:'https://test.invalid',setTimeout:()=>1,clearTimeout:()=>{},AbortController,
  fetch:async()=>({ok:false,status:409,headers:{get:k=>k==='sb-request-id'?'request-id-1':null},text:async()=>JSON.stringify({code:'23503',message:'mensaje SQL',details:'detalle SQL',hint:'sugerencia SQL'})})};
 vm.createContext(tc);vm.runInContext(transport,tc);
 await assert.rejects(()=>tc._sbFetchTransporte('POST','/rest/v1/ruta_clientes?token=secreto',{}),e=>e.code==='23503'&&e.status===409&&e.details==='detalle SQL'&&e.endpoint==='/rest/v1/ruta_clientes'&&e.requestId==='request-id-1');
 // Cola real: errores permanentes no se repiten ni dejan pasar operaciones posteriores.
 const sync=panel.slice(panel.indexOf('async function _syncQueue(){'),panel.indexOf('/* ─ Banner ─ */',panel.indexOf('async function _syncQueue(){')));
 const s=build();let replayed=0,timers=[];
 Object.assign(s.ctx,{_syncRetryTimer:null,_showSyncing:()=>{},_guardarRutasOffline:()=>{},_refrescarRutasEntreDispositivos:()=>{},cargarRutasFirebase:()=>{},
  _replayOfflineOp:async()=>{replayed++;throw error;},setTimeout:(fn,time)=>{timers.push(time);return 1;}});
 vm.runInContext(sync,s.ctx);s.ctx._offlineQueue=[{id:'fk',method:'ROUTE_MOVE'}, {id:'later',method:'PATCH'}];
 await s.ctx._syncQueue();assert.equal(replayed,1);assert.equal(s.ctx._offlineQueue.length,2);assert.equal(timers.length,0);await s.ctx._syncQueue();assert.equal(replayed,1);
 const transient=build();let retries=[];
 Object.assign(transient.ctx,{_syncRetryTimer:null,_showSyncing:()=>{},_guardarRutasOffline:()=>{},_refrescarRutasEntreDispositivos:()=>{},cargarRutasFirebase:()=>{},
  _replayOfflineOp:async()=>{throw Error('Failed to fetch');},setTimeout:(fn,time)=>{retries.push(time);return 1;}});
 vm.runInContext(sync,transient.ctx);transient.ctx._offlineQueue=[{id:'red',method:'PATCH'}];await transient.ctx._syncQueue();
 assert.equal(transient.ctx._isSyncing,false);assert.equal(transient.ctx._offlineQueue.length,1);assert.equal(transient.ctx._offlineQueue[0].pausaSincronizacion,undefined);assert.deepEqual(retries,[12000]);
 console.log('Avisos sync: detalle SQL, privacidad, ocultar, archivo recuperable, permisos, fallos de almacenamiento, sesión, orden y pausas OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
