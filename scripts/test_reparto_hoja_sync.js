const fs = require("fs");
const vm = require("vm");

const src = fs.readFileSync(process.argv[2] || (fs.existsSync("PANEL-index_15.html") ? "PANEL-index_15.html" : "index.html"), "utf8");

const required = [
  ["PATCH identifica la parada sin depender de ruta_id", /var match="id=eq\."\+encodeURIComponent\(String\(cliId\)\)\+"&empresa_id=eq\."\+_sbEmpId/],
  ["UPDATE de cero filas es error", /Supabase no encontró la parada para guardar el cambio/],
  ["entrega y cobro salen juntos", /_epConfirmar[\s\S]*?await _mePersistirParada\(rk,ck,\{[\s\S]*?efectivo:ef,transferencia:tr,modo:modo,entregado:true,entregadoEn:ahora/],
  ["Hoja de Ruta usa el mismo guardado", /async function _hrGuardar[\s\S]*?await _mePersistirParada/],
  ["entrega simple espera confirmación", /async function _meEntregar[\s\S]*?await _mePersistirParada/],
  ["fotografía local no reescribe al servidor", /Una fotografía local, por sí sola, ya[\s\S]*?no genera escrituras/],
  ["recuperación local antigua desactivada", /function _recuperarEntregasLocales\(\)\{ return 0; \}/],
];

const failed = required.filter(([, re]) => !re.test(src));
if (failed.length) {
  console.error("Fallaron controles:", failed.map(([name]) => name).join(", "));
  process.exit(1);
}

const start = src.indexOf("async function _mePersistirParada");
const end = src.indexOf("async function _meGuardarCobro", start);
if (start < 0 || end < 0) throw new Error("No se encontró _mePersistirParada");

function bloque(a,b) {
  const i=src.indexOf(a),j=src.indexOf(b,i+a.length);
  if(i<0||j<=i)throw Error(a);
  return src.slice(i,j);
}
function contextFor() {
  const calls=[], mem={}, notices=[], ctx={
    console,Date,empresaKey:"empresa",_sbEmpId:"empresa-uuid",currentUser:{id:"repartidor-1"},navigator:{onLine:false},
    rutasData:{ruta1:{clientes:{cli1:{nom:"Cliente",_rcId:"cli1",pedidoId:"bk1",efectivo:0,transferencia:0,modo:"ninguno"}}}},
    _offlineQueue:[],_ofKey:()=>"cola",_pedidoNuevoId:()=>String(calls.length+Math.random()),_revisionColaRutas:0,_syncLastError:null,
    _isSyncing:false,_syncRetryTimer:null,_updateBanner(){},_showSyncing(){},_guardarRutasOffline(){},_aplicarPendientesRutas(){},
    _programarGuardarRutasOffline(){},_pedirSyncOffline(){},_refrescarRutasEntreDispositivos(){},
    _fbPathParse:path=>path.split("/"),fbPatch:async(path,body)=>{calls.push({path,body});return ctx.noAck?[]:[{id:"fila"}];},
    localStorage:{setItem(k,v){if(ctx.sinEspacio)throw Error("lleno");mem[k]=v;},getItem:k=>mem[k]||null,removeItem:k=>delete mem[k]},
    setTimeout(){return 1;},clearTimeout(){},showNotif:msg=>notices.push(msg)
  };
  ctx.window=ctx;
  vm.createContext(ctx);
  vm.runInContext(src.slice(start,end)+
    bloque("function _loadQueue(){","/* ─ Cache de lecturas")+
    bloque("function _enqueue(method","function _pedirSyncOffline")+
    bloque("async function _replayOfflineOp(op){","/* ─ Banner ─ */"),ctx);
  return {ctx,calls,notices};
}

(async () => {
  const assert=require("node:assert/strict");
  const {ctx,calls,notices}=contextFor();
  const cambio={efectivo:0,transferencia:315074.4,modo:"transferencia",entregado:true,entregadoEn:"2026-08-04T12:00:00Z"};
  ctx.sinEspacio=true;
  assert.equal(await ctx._mePersistirParada("ruta1","cli1",cambio,"Entrega y cobro"),null);
  assert.equal(ctx._offlineQueue.length,0);
  assert.equal(ctx.rutasData.ruta1.clientes.cli1.transferencia,0);
  assert.match(notices.at(-1),/espacio/i);
  ctx.sinEspacio=false;
  assert.equal(await ctx._mePersistirParada("ruta1","cli1",cambio,"Entrega y cobro"),false);
  assert.equal(calls.length,0);
  assert.equal(ctx.rutasData.ruta1.clientes.cli1.transferencia,315074.4);
  const guardados=JSON.parse(ctx.localStorage.getItem("cola"));
  assert.equal(guardados.length,2);
  assert.match(guardados[0].path,/rutas\/ruta1\/clientes\/cli1$/);
  assert.equal(guardados[0].data.entregado,true);
  assert.match(guardados[1].path,/backupPedidos\/bk1$/);
  assert.equal(guardados[1].data.estado,"entregado");
  ctx._offlineQueue=[];
  ctx._loadQueue();
  assert.equal(ctx._offlineQueue.length,2);
  ctx.navigator.onLine=true;
  ctx.noAck=true;
  await ctx._syncQueue();
  assert.equal(ctx._offlineQueue.length,2,"No descartar operaciones sin ACK");
  assert.equal(calls.length,1,"No publicar estado antes de la entrega");
  ctx.noAck=false;
  await ctx._syncQueue();
  assert.equal(ctx._offlineQueue.length,0);
  assert.equal(calls.length,3);
  assert.equal(calls[1].body.transferencia,315074.4,"Reintento absoluto, no incrementa plata");
  assert.equal(calls[2].body.estado,"entregado");
  assert.equal(ctx.localStorage.getItem("cola"),"[]");
  console.log("Reparto ↔ Hoja de Ruta: guardado antes de enviar, cola al reabrir, orden y ACK, sin doble cobro.");
})().catch(error=>{ console.error(error); process.exit(1); });
