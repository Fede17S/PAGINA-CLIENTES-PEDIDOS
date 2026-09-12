(function(){
"use strict";

window.ARMADOR_OPERATIVO_VERSION="2.1.0";

var _armLegacyRenderLista=window._armRenderLista;
var _armLegacyInicioRender=window._armInicioRender;
var _armLockToken=null;
var _armRevision=0;
var _armSustituciones=[];
var _armEscaneados={};
var _armCorrecciones=0;
var _armSaveTimer=null;
var _armSaveBusy=false;
var _armSaveDirty=false;
var _armSavePromise=null;
var _armHeartbeatTimer=null;
var _armOpening=false;
var _armLockLost=false;
var _armFaltaIndex=null;
var _armSustIndex=null;
var _armSustElegido=null;
var _armScanStream=null;
var _armScanTimer=null;
var _armScanLatch="";
var _armScanClearFrames=0;
var _armZxingControls=null;
var _armZxingReader=null;
var _armScanLastHitAt=0;

function aEsc(v){
  if(typeof window.escHtml==="function") return window.escHtml(String(v==null?"":v));
  return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function aNum(v){ var n=Number(v); return isFinite(n)?n:0; }
function aRound(v){ return Math.round((aNum(v)+Number.EPSILON)*100)/100; }
function aCant(it){ return Math.max(0,aNum(it&&(it.c!=null?it.c:(it.cant!=null?it.cant:(it.cantidad!=null?it.cantidad:it.qty))))); }
function aNombre(it){ return (it&&(it.n||it.nombre||it.nom||it.name))||"Producto"; }
function aId(it){ return String((it&&(it.id||it.codigo||it.cod))||""); }
function aPedido(){ return (typeof window._armGetAll==="function"?window._armGetAll():[]).find(function(b){return String(b.id)===String(window._armOpenId);})||null; }
function aSbId(b){ return b&&(b._sbId||b._fbKey||b.id); }
function aUuid(){
  if(window.crypto&&typeof window.crypto.randomUUID==="function") return window.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16);});
}
function aProd(it){
  var id=aId(it), arr=Array.isArray(window.dbStock)?window.dbStock:[];
  var p=arr.find(function(x){return String(x.id)===id || (x.codigo&&String(x.codigo).toUpperCase()===id.toUpperCase());});
  if(p) return p;
  var vals=Object.values(window._prodData||{});
  return vals.find(function(x){return String(x.id||"")===id || String(x.codigo||"").toUpperCase()===id.toUpperCase();})||null;
}
function aUbicacion(it){
  var p=aProd(it)||{}, pa=p.ubicacionPasillo||p.ubicacion_pasillo||"", es=p.ubicacionEstante||p.ubicacion_estante||"";
  return {texto:[pa,es].filter(Boolean).join(" · "),orden:p.ubicacionOrden==null?(p.ubicacion_orden==null?999999:aNum(p.ubicacion_orden)):aNum(p.ubicacionOrden)};
}
function aLineSub(i){ return _armSustituciones.filter(function(s){return +s.original_index===+i;}); }
function aSubCant(i){ return aLineSub(i).reduce(function(t,s){return t+aNum(s.cantidad);},0); }
function aFaltaCant(i){ return Math.max(0,aNum((window._armFalta||{})[i])); }
function aResolved(i){ return !!((window._armCheck||{})[i]||aFaltaCant(i)>0||aSubCant(i)>0); }
function aLocalKey(id){ return "armador_v2:"+String(window._sbEmpId||"")+":"+String(id||"")+":"+String(typeof window._armUid==="function"?window._armUid():""); }
function aConsKey(){ return "armador_consolidado_v2:"+String(window._sbEmpId||"")+":"+String(typeof window._armUid==="function"?window._armUid():""); }
function aJsonObject(v){ return v&&typeof v==="object"&&!Array.isArray(v)?v:{}; }
function aSnapshot(){
  var b=document.getElementById("arm-bultos");
  return {
    version:2,
    check:Object.assign({},window._armCheck||{}),
    faltantes:Object.assign({},window._armFalta||{}),
    sustituciones:_armSustituciones.slice(),
    escaneados:Object.assign({},_armEscaneados),
    bultos:b&&b.value!==""?Math.max(0,parseInt(b.value,10)||0):null,
    correcciones:_armCorrecciones,
    actualizadoEn:new Date().toISOString()
  };
}
function aPersistLocal(){
  if(!window._armOpenId) return;
  try{ localStorage.setItem(aLocalKey(window._armOpenId),JSON.stringify({lockToken:_armLockToken,revision:_armRevision,progreso:aSnapshot()})); }catch(e){}
}
function aLoadLocal(id){ try{return JSON.parse(localStorage.getItem(aLocalKey(id))||"null");}catch(e){return null;} }
function aClearLocal(id){ try{localStorage.removeItem(aLocalKey(id));}catch(e){} }
function aHasProgress(p){ return !!(p&&((p.check&&Object.keys(p.check).length)||(p.faltantes&&Object.keys(p.faltantes).length)||(p.sustituciones&&p.sustituciones.length)||(p.escaneados&&Object.keys(p.escaneados).length)||p.bultos!=null)); }
function aApplyProgress(p){
  p=aJsonObject(p);
  window._armCheck=Object.assign({},aJsonObject(p.check));
  window._armFalta=Object.assign({},aJsonObject(p.faltantes||p.falta));
  Object.keys(window._armFalta).forEach(function(k){window._armFalta[k]=Math.max(0,aNum(window._armFalta[k]));});
  _armSustituciones=Array.isArray(p.sustituciones)?p.sustituciones.slice():[];
  _armEscaneados=Object.assign({},aJsonObject(p.escaneados));
  _armCorrecciones=Math.max(0,parseInt(p.correcciones,10)||0);
  var bin=document.getElementById("arm-bultos"); if(bin&&p.bultos!=null) bin.value=p.bultos;
}
function aSetStatus(texto,tipo){
  var el=document.getElementById("arm-lock-status"); if(!el) return;
  el.className="armv2-lock "+(tipo||""); el.textContent=texto||"";
}
function aRpc(accion,bk,extra){
  extra=extra||{};
  if(typeof window.sbFetch!=="function") return Promise.reject(new Error("Conexión a Supabase no disponible"));
  return window.sbFetch("POST","/rest/v1/rpc/armado_operar",{
    p_empresa:window._sbEmpId,
    p_pedido_id:aSbId(bk),
    p_accion:accion,
    p_usuario:typeof window._armUid==="function"?window._armUid():"",
    p_usuario_nom:typeof window._armNom==="function"?window._armNom():"",
    p_lock_token:extra.token||_armLockToken,
    p_revision:extra.revision===undefined?_armRevision:extra.revision,
    p_progreso:extra.progreso===undefined?null:extra.progreso,
    p_resultado:extra.resultado===undefined?null:extra.resultado,
    p_ttl_seg:180
  }).then(function(r){return Array.isArray(r)?r[0]:r;});
}
function aLost(r){
  _armLockLost=true;
  if(_armHeartbeatTimer){clearInterval(_armHeartbeatTimer);_armHeartbeatTimer=null;}
  aSetStatus("🔒 Este pedido quedó en uso por "+((r&&r.nombre)||"otro armador")+". Tu avance local no se perdió.","err");
  var btn=document.getElementById("arm-listo"); if(btn) btn.disabled=true;
  if(typeof window.showNotif==="function") window.showNotif("El pedido fue tomado por otro armador. Cerralo y volvé a abrirlo.","err");
}
function aStartHeartbeat(){
  if(_armHeartbeatTimer) clearInterval(_armHeartbeatTimer);
  _armHeartbeatTimer=setInterval(function(){
    var bk=aPedido(); if(!bk||!_armLockToken||_armLockLost) return;
    aRpc("renovar",bk).then(function(r){if(!r||r.ok===false)aLost(r||{});else aSetStatus("🔒 Pedido reservado para vos · avance sincronizado","ok");})
      .catch(function(){aSetStatus("📡 Sin conexión · el avance queda guardado en este dispositivo","warn");});
  },60000);
}
function aScheduleSave(){
  if(!window._armOpenId||!_armLockToken) return;
  aPersistLocal(); _armSaveDirty=true;
  if(_armSaveTimer) clearTimeout(_armSaveTimer);
  _armSaveTimer=setTimeout(function(){_armSaveTimer=null;aFlushSave();},650);
}
async function aFlushSave(){
  if(_armSaveTimer){clearTimeout(_armSaveTimer);_armSaveTimer=null;}
  if(_armSaveBusy) return _armSavePromise||false;
  var bk=aPedido(); if(!bk||!_armLockToken||_armLockLost) return false;
  _armSaveBusy=true;
  _armSavePromise=(async function(){
    var ok=true;
    do{
      _armSaveDirty=false;
      var snap=aSnapshot();
      try{
        var r=await aRpc("guardar",bk,{progreso:snap});
        if(!r||r.ok===false){ if(r&&(r.codigo==="BLOQUEO_PERDIDO"||r.codigo==="REVISION_DESACTUALIZADA"))aLost(r); ok=false; break; }
        _armRevision=aNum(r.revision); bk.armadoRevision=_armRevision; bk.armadoProgreso=snap;
        aSetStatus("🔒 Pedido reservado para vos · guardado "+new Date().toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}),"ok");
        aPersistLocal();
      }catch(e){ ok=false; aSetStatus("📡 No se pudo sincronizar · avance guardado en este dispositivo","warn"); break; }
    }while(_armSaveDirty);
    return ok;
  })();
  try{return await _armSavePromise;}finally{_armSaveBusy=false;_armSavePromise=null;}
}

function aRenderHeader(bk){
  var m=document.getElementById("arm-modal"); if(m)m.style.display="flex";
  var t=document.getElementById("arm-title"); if(t)t.textContent="📦 "+(bk.clienteNom||"Pedido");
  var ruta=typeof window._armRutaNom==="function"?window._armRutaNom(bk):"";
  var sub=document.getElementById("arm-sub"); if(sub)sub.textContent=(bk.items||[]).length+" productos · "+(typeof window._armUnidades==="function"?window._armUnidades(bk):0)+" unidades"+(ruta?" · 🚚 "+ruta:"");
  var bin=document.getElementById("arm-bultos"); if(bin&&bin.value==="")bin.value=(bk.bultos!=null?bk.bultos:"");
  var obs=document.getElementById("arm-obs"),txt=bk.obs||bk.observaciones||bk.nota||"";
  if(obs){obs.style.display=txt?"block":"none";if(txt)obs.innerHTML="📝 <b>Observación:</b> "+aEsc(txt);}
  var info=document.getElementById("arm-info");
  if(info){
    var importe=bk.tipoComprobante==="factura_a"?(bk.totalConIVA!=null?bk.totalConIVA:aRound(aNum(bk.total)*1.21)):aNum(bk.total);
    var fm=typeof window.fM==="function"?window.fM:function(x){return x;};
    info.style.display="block";
    info.innerHTML='<div class="armv2-info-grid"><span>Vendedor</span><b>'+aEsc(bk.usuarioNom||bk.usuario||"—")+'</b><span>Comprobante</span><b>'+(bk.tipoComprobante==="factura_a"?"Factura A (+IVA)":"Remito")+'</b><span>Importe</span><b>$'+fm(importe)+(bk.tipoComprobante==="factura_a"?" c/IVA":"")+'</b></div>';
  }
}

window._armAbrir=async function(id){
  if(_armOpening||window._armGuardando) return;
  var bk=(typeof window._armGetAll==="function"?window._armGetAll():[]).find(function(b){return String(b.id)===String(id);});
  if(!bk)return;
  if(typeof navigator!=="undefined"&&navigator.onLine===false){if(window.showNotif)window.showNotif("Necesitás conexión para reservar el pedido","err");return;}
  if(!aSbId(bk)||!window._sbEmpId){if(window.showNotif)window.showNotif("El pedido todavía no está sincronizado","err");return;}
  _armOpening=true;
  var local=aLoadLocal(id),token=(local&&local.lockToken)||aUuid();
  try{
    var r=await aRpc("reclamar",bk,{token:token,revision:null});
    if(!r||r.ok===false){
      if(window.showNotif) window.showNotif(r&&r.codigo==="PEDIDO_BLOQUEADO"?("🔒 Lo está armando "+(r.nombre||r.usuario||"otra persona")):"Este pedido ya fue armado","warn");
      return;
    }
    _armLockToken=token; _armRevision=aNum(r.revision); _armLockLost=false;
    window._armOpenId=id; window._armGuardando=false;
    bk.estado="preparando"; bk.armadoInicio=r.inicio||bk.armadoInicio; bk.armadoPor=window._armUid(); bk.armadoPorNom=window._armNom();
    bk.armadoRevision=_armRevision; bk.armadoLockToken=token; bk.armadoLockUsuario=window._armUid(); bk.armadoLockNombre=window._armNom(); bk.armadoLockHasta=r.hasta;
    var server=aJsonObject(r.progreso),lp=local&&aJsonObject(local.progreso);
    aApplyProgress(aHasProgress(server)?server:(lp||server));
    aRenderHeader(bk); window._armRenderItems(); aSetStatus("🔒 Pedido reservado para vos · nadie más puede armarlo","ok"); aStartHeartbeat(); aPersistLocal();
    if(!aHasProgress(server)&&aHasProgress(lp))aScheduleSave();
  }catch(e){
    console.error("[Armador] reclamar",e); if(window.showNotif)window.showNotif("No se pudo reservar el pedido: "+(e.message||"error"),"err");
  }finally{_armOpening=false;}
};

function aItemHtml(it,i){
  var n=aNombre(it),c=aCant(it),ub=typeof window._itBulto==="function"?window._itBulto({n:n,c:c,_esCaja:it._esCaja,_ub:it._ub}):0;
  var qTxt=ub?('×'+aRound(c/ub)+' <small>bulto'+(aRound(c/ub)!==1?'s':'')+'</small>'):('×'+c);
  var fa=aFaltaCant(i),subs=aLineSub(i),on=!!(window._armCheck||{})[i],scan=aNum(_armEscaneados[i]),u=aUbicacion(it);
  var tags="";
  if(u.texto)tags+='<span class="armv2-tag loc">📍 '+aEsc(u.texto)+'</span>';
  if(fa>0)tags+='<span class="armv2-tag falta">Faltan '+fa+' de '+c+'</span>';
  if(scan>0)tags+='<span class="armv2-tag scan">Escaneado '+scan+'×</span>';
  subs.forEach(function(s){tags+='<span class="armv2-tag sust">↔ '+aEsc(s.reemplazo_nombre)+' ×'+aNum(s.cantidad)+' <button onclick="event.stopPropagation();_armSustQuitar(\''+aEsc(s.id)+'\')">×</button></span>';});
  return '<div class="arm-item'+(on?' arm-on':'')+(fa?' arm-falta':'')+(subs.length?' armv2-sust-row':'')+'" data-arm-index="'+i+'" role="button" tabindex="0" onclick="_armTick('+i+')">'
    +'<div class="arm-chk">'+(on?'✓':(fa?'!':''))+'</div><div class="armv2-main"><div class="arm-item-n">'+aEsc(n)+'</div><div class="armv2-tags">'+tags+'</div></div>'
    +'<div class="arm-item-q">'+qTxt+'</div>'
    +'<button type="button" class="armv2-sust-btn" onclick="event.stopPropagation();_armSustAbrir('+i+')" title="Sustituir">↔</button>'
    +'<button type="button" class="arm-falta-btn'+(fa?' on':'')+'" onclick="event.stopPropagation();_armFaltaAbrir('+i+')" title="Faltante parcial">'+(fa?fa:'⚠️')+'</button></div>';
}
window._armRenderItems=function(){
  var bk=aPedido(),cont=document.getElementById("arm-items"); if(!bk||!cont)return;
  var filas=(bk.items||[]).map(function(it,i){var u=aUbicacion(it);return{it:it,i:i,u:u};});
  filas.sort(function(a,b){return a.u.orden-b.u.orden||a.u.texto.localeCompare(b.u.texto)||aNombre(a.it).localeCompare(aNombre(b.it));});
  cont.innerHTML=filas.map(function(x){return aItemHtml(x.it,x.i);}).join("");
  window._armActualizarProgreso(bk.items||[]);
};
window._armActualizarFila=function(i){
  var bk=aPedido(),cont=document.getElementById("arm-items"); if(!bk||!cont||!bk.items[i])return;
  var row=cont.querySelector('[data-arm-index="'+i+'"]'); if(row)row.outerHTML=aItemHtml(bk.items[i],i);
};
window._armContarResueltos=function(items){var n=0;(items||[]).forEach(function(_x,i){if(aResolved(i))n++;});return n;};
window._armActualizarProgreso=function(items){
  var bk=aPedido();items=items||(bk?bk.items:[])||[];
  var done=window._armContarResueltos(items),pct=items.length?Math.round(done/items.length*100):0;
  var pr=document.getElementById("arm-progress");if(pr)pr.innerHTML='<div class="arm-bar"><div class="arm-bar-fill" style="width:'+pct+'%"></div></div><div class="arm-prog-tx">'+done+'/'+items.length+' renglones resueltos · '+pct+'%</div>';
  var btn=document.getElementById("arm-listo"),ready=items.length>0&&done===items.length&&!_armLockLost;
  if(btn){btn.disabled=!!window._armGuardando||!ready;btn.classList.toggle("arm-ready",ready);btn.textContent="🔎 Revisar y finalizar";}
};
window._armGuardarBorrador=function(){
  if(!window._armOpenId)return;
  window._armDrafts=window._armDrafts||{};window._armDrafts[window._armOpenId]=aSnapshot();aScheduleSave();
};
window._armTick=function(i){
  var bk=aPedido();if(!bk||!bk.items[i]||_armLockLost)return;
  var nuevo=!((window._armCheck||{})[i]);window._armCheck[i]=nuevo;
  if(nuevo&&aFaltaCant(i)>0)window._armFalta[i]=0;
  _armCorrecciones++;window._armGuardarBorrador();window._armActualizarFila(i);window._armActualizarProgreso();
};
window._armMarcarTodos=function(){
  var bk=aPedido();if(!bk||_armLockLost)return;(bk.items||[]).forEach(function(_x,i){window._armCheck[i]=true;window._armFalta[i]=0;});
  _armCorrecciones++;window._armGuardarBorrador();window._armRenderItems();
};
window._armLimpiarMarcas=function(){
  window._armCheck={};window._armFalta={};_armSustituciones=[];_armEscaneados={};_armCorrecciones++;window._armGuardarBorrador();window._armRenderItems();
};

window._armFaltaAbrir=function(i){
  var bk=aPedido();if(!bk||!bk.items[i])return;_armFaltaIndex=i;
  var max=Math.max(0,aCant(bk.items[i])-aSubCant(i)),inp=document.getElementById("armv2-falta-cant");
  document.getElementById("armv2-falta-title").textContent=aNombre(bk.items[i]);document.getElementById("armv2-falta-max").textContent="Pedido: "+aCant(bk.items[i])+" · máximo faltante: "+max;
  inp.max=max;inp.value=aFaltaCant(i)||Math.min(1,max);document.getElementById("armv2-falta-modal").classList.add("on");setTimeout(function(){inp.focus();inp.select();},50);
};
window._armFaltaPaso=function(d){var i=document.getElementById("armv2-falta-cant"),max=aNum(i.max);i.value=Math.max(0,Math.min(max,aNum(i.value)+d));};
window._armFaltaTodo=function(){var i=document.getElementById("armv2-falta-cant");i.value=i.max;};
window._armFaltaAplicar=function(){
  var bk=aPedido(),i=_armFaltaIndex;if(!bk||i==null||!bk.items[i])return;
  var max=Math.max(0,aCant(bk.items[i])-aSubCant(i)),q=Math.max(0,Math.min(max,aNum(document.getElementById("armv2-falta-cant").value)));
  window._armFalta[i]=q;if(q>0)window._armCheck[i]=true;else if(!aSubCant(i))window._armCheck[i]=false;
  _armCorrecciones++;document.getElementById("armv2-falta-modal").classList.remove("on");window._armGuardarBorrador();window._armActualizarFila(i);window._armActualizarProgreso();
};
window._armFaltaCerrar=function(){document.getElementById("armv2-falta-modal").classList.remove("on");_armFaltaIndex=null;};

function aPrecioProducto(p,bk){
  try{var v=typeof window._precioDe==="function"?window._precioDe(p,bk.lista||"Clientes"):0;if(aNum(v)>0)return aNum(v);}catch(e){}
  return aNum(p.pCli||p.precioClientes||p.precio_clientes||p.precioBase||p.precio_base);
}
window._armSustAbrir=function(i){
  var bk=aPedido();if(!bk||!bk.items[i])return;_armSustIndex=i;_armSustElegido=null;
  document.getElementById("armv2-sust-original").textContent="Reemplazar parte de "+aNombre(bk.items[i]);document.getElementById("armv2-sust-q").value="";document.getElementById("armv2-sust-elegido").style.display="none";
  var q=document.getElementById("armv2-sust-buscar");q.value="";document.getElementById("armv2-sust-modal").classList.add("on");window._armSustBuscar("");setTimeout(function(){q.focus();},50);
};
window._armSustBuscar=function(q){
  q=String(q||"").toLowerCase().trim();var orig=aPedido().items[_armSustIndex],oid=aId(orig);
  var arr=(Array.isArray(window.dbStock)?window.dbStock:[]).filter(function(p){return p&&p.activo!==false&&String(p.id)!==oid&&(!q||String((p.n||p.nombre||"")+" "+(p.codigo||"")).toLowerCase().indexOf(q)>=0);}).slice(0,25);
  var el=document.getElementById("armv2-sust-resultados");
  el.innerHTML=arr.length?arr.map(function(p){var u=[p.ubicacionPasillo,p.ubicacionEstante].filter(Boolean).join(" · "),pr=aPrecioProducto(p,aPedido());return '<button type="button" onclick="_armSustElegir(\''+aEsc(p.id)+'\')"><span><b>'+aEsc(p.n||p.nombre)+'</b><small>'+aEsc(p.codigo||"")+(u?' · 📍 '+aEsc(u):'')+'</small></span><strong>$'+(typeof window.fM==="function"?window.fM(pr):pr)+'</strong></button>';}).join(""):'<div class="armv2-empty">No se encontraron productos.</div>';
};
window._armSustElegir=function(id){
  var p=(window.dbStock||[]).find(function(x){return String(x.id)===String(id);});if(!p)return;_armSustElegido=p;
  var box=document.getElementById("armv2-sust-elegido"),bk=aPedido(),max=Math.max(0,aCant(bk.items[_armSustIndex])-aFaltaCant(_armSustIndex)-aSubCant(_armSustIndex));
  box.style.display="block";document.getElementById("armv2-sust-elegido-n").textContent=p.n||p.nombre;var inp=document.getElementById("armv2-sust-q");inp.max=max;inp.value=Math.min(1,max);inp.focus();
};
window._armSustAplicar=function(){
  var bk=aPedido(),i=_armSustIndex,p=_armSustElegido;if(!bk||i==null||!p)return;
  var max=Math.max(0,aCant(bk.items[i])-aFaltaCant(i)-aSubCant(i)),q=Math.max(0,Math.min(max,aNum(document.getElementById("armv2-sust-q").value)));if(!q){if(window.showNotif)window.showNotif("Indicá una cantidad","warn");return;}
  _armSustituciones.push({id:aUuid(),original_index:i,original_id:aId(bk.items[i]),original_nombre:aNombre(bk.items[i]),cantidad:q,reemplazo_id:p.id,reemplazo_codigo:p.codigo||"",reemplazo_nombre:p.n||p.nombre,precio:aPrecioProducto(p,bk),ubicacion_pasillo:p.ubicacionPasillo||"",ubicacion_estante:p.ubicacionEstante||""});
  window._armCheck[i]=true;_armCorrecciones++;window._armSustCerrar();window._armGuardarBorrador();window._armActualizarFila(i);window._armActualizarProgreso();
};
window._armSustQuitar=function(id){var s=_armSustituciones.find(function(x){return String(x.id)===String(id);});_armSustituciones=_armSustituciones.filter(function(x){return String(x.id)!==String(id);});if(s){_armCorrecciones++;window._armGuardarBorrador();window._armActualizarFila(+s.original_index);window._armActualizarProgreso();}};
window._armSustCerrar=function(){document.getElementById("armv2-sust-modal").classList.remove("on");_armSustIndex=null;_armSustElegido=null;};

function aSetQty(it,q,origQ){
  var n=Object.assign({},it),unit=origQ>0?(it.sub!=null?aNum(it.sub)/origQ:aNum(it.p||it.precio)):aNum(it.p||it.precio);
  if(n.c!=null||(!("cant" in n)&&!("cantidad" in n)&&!("qty" in n)))n.c=q;else if(n.cant!=null)n.cant=q;else if(n.cantidad!=null)n.cantidad=q;else n.qty=q;
  n.sub=aRound(unit*q);return n;
}
function aBuildResult(bk){
  var orig=bk.items||[],finalItems=[],falt=[],subs=[];
  orig.forEach(function(it,i){
    var oq=aCant(it),fq=Math.min(oq,aFaltaCant(i)),ss=aLineSub(i),sq=Math.min(Math.max(0,oq-fq),ss.reduce(function(t,s){return t+aNum(s.cantidad);},0)),remain=Math.max(0,oq-fq-sq);
    if(remain>0)finalItems.push(aSetQty(it,remain,oq));
    if(fq>0)falt.push({id:aId(it),n:aNombre(it),c:fq,cantidad_original:oq,indice:i});
    var used=0;ss.forEach(function(s){var q=Math.min(aNum(s.cantidad),Math.max(0,oq-fq-used));if(!q)return;used+=q;var ni={id:s.reemplazo_id,codigo:s.reemplazo_codigo||s.reemplazo_id,n:s.reemplazo_nombre,c:q,p:aNum(s.precio),sub:aRound(aNum(s.precio)*q),_sustitucionDe:aId(it),_sustitucionDeNombre:aNombre(it)};finalItems.push(ni);subs.push(Object.assign({},s,{cantidad:q}));});
  });
  var sum=function(items){return aRound((items||[]).reduce(function(t,it){return t+(it.sub!=null?aNum(it.sub):aNum(it.p||it.precio)*aCant(it));},0));};
  var oldLines=sum(orig),newLines=sum(finalItems),total=aRound(Math.max(0,aNum(bk.total)+(newLines-oldLines)));
  var now=new Date().toISOString(),hist=(bk.historial||[]).slice();
  if(falt.length||subs.length)hist.push({tipo:"ajuste_armado",fecha:now,por:window._armNom()||window._armUid(),faltantes:falt,sustituciones:subs,total_anterior:aNum(bk.total),total_nuevo:total});
  var met={unidades_originales:orig.reduce(function(t,it){return t+aCant(it);},0),unidades_finales:finalItems.reduce(function(t,it){return t+aCant(it);},0),faltantes_unidades:falt.reduce(function(t,x){return t+aNum(x.c);},0),sustituciones_unidades:subs.reduce(function(t,x){return t+aNum(x.cantidad);},0),correcciones:_armCorrecciones,escaneos:Object.keys(_armEscaneados).reduce(function(t,k){return t+aNum(_armEscaneados[k]);},0),productos_originales:orig.length,productos_finales:finalItems.length};
  return {items:finalItems,total:total,total_con_iva:bk.tipoComprobante==="factura_a"?aRound(total*1.21):total,historial:hist,faltantes:falt,sustituciones:subs,metricas:met};
}
window._armPrepararFaltantes=function(bk){return aBuildResult(bk);};

window._armListo=function(){
  var bk=aPedido();if(!bk||window._armGuardando||_armLockLost)return;var items=bk.items||[];
  if(!items.length||window._armContarResueltos(items)!==items.length){if(window.showNotif)window.showNotif("Resolvé cada renglón antes de finalizar","warn");return;}
  var r=aBuildResult(bk),fm=typeof window.fM==="function"?window.fM:function(x){return x;},fq=r.faltantes.reduce(function(t,x){return t+aNum(x.c);},0),sq=r.sustituciones.reduce(function(t,x){return t+aNum(x.cantidad);},0),b=document.getElementById("arm-bultos");
  var lines='<div class="armv2-review-kpis"><div><b>'+(r.items.length)+'</b><span>renglones finales</span></div><div><b>'+fq+'</b><span>unidades faltantes</span></div><div><b>'+sq+'</b><span>sustituidas</span></div></div>';
  if(r.faltantes.length)lines+='<div class="armv2-review-sec"><b>⚠️ Faltantes</b>'+r.faltantes.map(function(x){return '<span>'+aEsc(x.n)+' · faltan '+x.c+' de '+x.cantidad_original+'</span>';}).join("")+'</div>';
  if(r.sustituciones.length)lines+='<div class="armv2-review-sec"><b>↔ Sustituciones</b>'+r.sustituciones.map(function(x){return '<span>'+aEsc(x.original_nombre)+' → '+aEsc(x.reemplazo_nombre)+' ×'+x.cantidad+'</span>';}).join("")+'</div>';
  lines+='<div class="armv2-total"><span>Total final</span><b>$'+fm(r.total)+(bk.tipoComprobante==="factura_a"?' + IVA':'')+'</b></div>'+(b&&b.value===""?'<div class="armv2-warning">📦 No indicaron cantidad de bultos. Podés confirmar igual.</div>':'');
  document.getElementById("armv2-review-body").innerHTML=lines;document.getElementById("armv2-review-modal").classList.add("on");
};
window._armReviewCerrar=function(){document.getElementById("armv2-review-modal").classList.remove("on");};

async function aActualizarRuta(bk,res){
  if(!bk.rutaVinculadaId||typeof window._sbPatchRutaCli!=="function")return true;
  var rk=bk.rutaVinculadaId;
  if((!window.rutasData||!window.rutasData[rk])&&typeof window._sbGetRutas==="function"){try{var d=await window._sbGetRutas();if(d)window.rutasData=Object.assign(window.rutasData||{},d);}catch(e){}}
  var ruta=window.rutasData&&window.rutasData[rk];if(!ruta||!ruta.clientes)return true;
  var ck=null,cli=null;Object.keys(ruta.clientes).some(function(k){var c=ruta.clientes[k];if((bk.clienteId&&String(c.id)===String(bk.clienteId))||(bk.clienteNom&&c.nom===bk.clienteNom)){ck=k;cli=c;return true;}return false;});
  if(!cli)return true;var importe=typeof window._importeRutaConIVA==="function"?window._importeRutaConIVA(rk,ck,res.total):res.total;
  cli.items=res.items;cli.importe=importe;
  try{if(cli._rcId)await window._sbPatchRutaCli(rk,cli._rcId,{items:res.items,importe:importe});return true;}catch(e){console.warn("[Armador] ruta",e);return false;}
}
window._armConfirmarFinal=async function(){
  var bk=aPedido();if(!bk||window._armGuardando||_armLockLost)return;if(navigator.onLine===false){if(window.showNotif)window.showNotif("Necesitás conexión para confirmar","err");return;}
  window._armGuardando=true;window._armReviewCerrar();var btn=document.getElementById("arm-listo");if(btn){btn.disabled=true;btn.textContent="⏳ Confirmando…";}
  var saveOk=await aFlushSave();if(!saveOk||_armLockLost){window._armGuardando=false;window._armActualizarProgreso();return;}
  var res=aBuildResult(bk),bi=document.getElementById("arm-bultos");if(bi&&bi.value!=="")res.bultos=Math.max(0,parseInt(bi.value,10)||0);
  try{
    var rr=await aRpc("confirmar",bk,{resultado:res});if(!rr||rr.ok===false){aLost(rr||{});throw new Error((rr&&rr.codigo)||"No se confirmó");}
    var armadoEn=rr.armado_en||new Date().toISOString();bk.items=res.items;bk.total=res.total;bk.totalConIVA=res.total_con_iva;bk.historial=res.historial;bk.faltantes=res.faltantes;bk.armadoSustituciones=res.sustituciones;bk.armadoMetricas=rr.metricas||res.metricas;bk.armadoEn=armadoEn;bk.estado="enviado";bk.armadoPor=window._armUid();bk.armadoPorNom=window._armNom();bk.armadoRevision=aNum(rr.revision);bk.armadoProgreso={};if(res.bultos!=null)bk.bultos=res.bultos;
    var rutaOk=await aActualizarRuta(bk,res);
    if(typeof window.saveBackups==="function")window.saveBackups(window._armGetAll());
    if(typeof window._ofrecerAvisoWhatsApp==="function"){try{window._ofrecerAvisoWhatsApp(bk,"enviado");}catch(e){}}
    var oldId=window._armOpenId;aClearLocal(oldId);delete window._armDrafts[oldId];
    if(_armHeartbeatTimer){clearInterval(_armHeartbeatTimer);_armHeartbeatTimer=null;}_armLockToken=null;_armRevision=0;window._armOpenId=null;
    document.getElementById("arm-modal").style.display="none";window._armGuardando=false;
    if(typeof window._armInicioRender==="function")await window._armInicioRender();
    if(!rutaOk&&window.showNotif)window.showNotif("Pedido armado. La hoja de ruta no respondió; actualizala antes de imprimir.","warn");
    var next=typeof window._armPendientes==="function"?window._armPendientes()[0]:null;
    if(next&&typeof window._confirmar==="function"){
      var seguir=await window._confirmar({icono:"✅",titulo:"Pedido listo",mensaje:(res.faltantes.length?"Se registraron "+res.faltantes.reduce(function(t,x){return t+aNum(x.c);},0)+" unidades faltantes. ":"")+"¿Querés continuar con el siguiente pedido?",ok:"Armar siguiente",cancelar:"Volver a la lista"});
      if(seguir)window._armAbrir(next.id);
    }else if(window.showNotif)window.showNotif("✅ Pedido listo para reparto","ok");
  }catch(e){console.error("[Armador] confirmar",e);window._armGuardando=false;if(btn)btn.textContent="🔎 Revisar y finalizar";window._armActualizarProgreso();if(window.showNotif)window.showNotif("No se pudo confirmar: "+(e.message||"error"),"err");}
};

window._armCerrar=async function(){
  if(window._armGuardando){if(window.showNotif)window.showNotif("Esperá a que termine de guardarse","info");return;}
  window._armScanCerrar();var bk=aPedido(),ok=await aFlushSave();if(_armHeartbeatTimer){clearInterval(_armHeartbeatTimer);_armHeartbeatTimer=null;}
  if(bk&&_armLockToken&&ok&&!_armLockLost){try{await aRpc("liberar",bk);}catch(e){}}
  _armLockToken=null;_armRevision=0;_armLockLost=false;window._armOpenId=null;var m=document.getElementById("arm-modal");if(m)m.style.display="none";
  if(!ok&&window.showNotif)window.showNotif("El avance quedó en este dispositivo y se reintentará al abrir el pedido","warn");
  if(typeof window._armInicioRender==="function")window._armInicioRender();
};
window._armEditarPedido=async function(){var bk=aPedido();if(!bk)return;await window._armCerrar();if(typeof window.abrirEditarBackup==="function")window.abrirEditarBackup(bk,true);};

function aScanTarget(it,i){var rest=Math.max(0,aCant(it)-aFaltaCant(i)-aSubCant(i)),ub=typeof window._itBulto==="function"?aNum(window._itBulto({n:aNombre(it),c:aCant(it),_esCaja:it._esCaja,_ub:it._ub})):0;return Math.max(1,Math.ceil(rest/(ub||1)));}
function aBarcodeNorm(raw,format){return typeof window._barcodeNormalizar==="function"?window._barcodeNormalizar(raw,format):String(raw||"").trim().toUpperCase().replace(/\s+/g,"");}
function aBarcodeKeys(raw,format){
  if(typeof window._barcodeClaves==="function")return window._barcodeClaves(raw,format);
  var code=aBarcodeNorm(raw,format),out=code?[code]:[];if(/^\d{12}$/.test(code))out.push("0"+code);if(/^0\d{12}$/.test(code))out.push(code.slice(1));return out;
}
window._armProcesarCodigo=function(raw,opts){
  opts=opts||{};var code=aBarcodeNorm(raw,opts.formato),keys=aBarcodeKeys(raw,opts.formato),bk=aPedido();if(!code||!bk)return false;
  var candidatos=[];(bk.items||[]).forEach(function(it,i){
    var p=aProd(it)||{},bar=p.codigoBarras||p.codigo_barras||it.codigoBarras||it.codigo_barras||"";
    var match=aBarcodeKeys(bar).some(function(k){return keys.indexOf(k)>=0;});
    if(!match&&opts.permitirSku!==false){var sku=[p.codigo,aId(it)].filter(Boolean).map(function(x){return String(x).trim().toUpperCase();});match=sku.indexOf(String(raw||"").trim().toUpperCase())>=0;}
    if(match)candidatos.push({it:it,i:i});
  });
  if(!candidatos.length){if(window.showNotif)window.showNotif("Código "+code+" no pertenece a este pedido","warn");return false;}
  var x=candidatos.find(function(z){return aNum(_armEscaneados[z.i])<aScanTarget(z.it,z.i);})||candidatos[0],target=aScanTarget(x.it,x.i);
  _armEscaneados[x.i]=Math.min(target,aNum(_armEscaneados[x.i])+1);if(_armEscaneados[x.i]>=target)window._armCheck[x.i]=true;
  if(navigator.vibrate)navigator.vibrate(60);var inp=document.getElementById("armv2-scan-code");if(inp)inp.value="";var status=document.getElementById("armv2-scan-status");if(status)status.textContent="✅ "+aNombre(x.it)+" · "+_armEscaneados[x.i]+"/"+target+(opts.desdeCamara?" · retiralo antes de escanear otra unidad":"");
  window._armGuardarBorrador();window._armActualizarFila(x.i);window._armActualizarProgreso();return true;
};
window._armScanManual=function(){window._armProcesarCodigo((document.getElementById("armv2-scan-code")||{}).value,{permitirSku:true});};
async function aScanLoop(detector,video){
  if(!_armScanStream)return;
  try{
    var codes=await detector.detect(video),hit=codes&&codes[0];
    if(hit&&hit.rawValue){
      _armScanClearFrames=0;var key=aBarcodeNorm(hit.rawValue,hit.format);
      if(key&&key!==_armScanLatch){_armScanLatch=key;window._armProcesarCodigo(hit.rawValue,{formato:hit.format,permitirSku:false,desdeCamara:true});}
    }else if(++_armScanClearFrames>=2){_armScanLatch="";_armScanClearFrames=0;}
  }catch(e){}
  if(_armScanStream)_armScanTimer=setTimeout(function(){aScanLoop(detector,video);},260);
}
async function aCrearDetector(){
  var wanted=["ean_13","ean_8","upc_a","upc_e","code_128","code_39","codabar","itf","data_matrix","qr_code"],supported=[];
  if(typeof window.BarcodeDetector.getSupportedFormats==="function")try{supported=await window.BarcodeDetector.getSupportedFormats();}catch(e){}
  var formats=supported.length?wanted.filter(function(f){return supported.indexOf(f)>=0;}):wanted;
  try{return formats.length?new window.BarcodeDetector({formats:formats}):new window.BarcodeDetector();}catch(e){return new window.BarcodeDetector();}
}
function aZxingFormat(result){
  try{
    var value=result.getBarcodeFormat(),name=window.ZXingBrowser.BarcodeFormat[value];
    return String(name||"").toLowerCase();
  }catch(e){return "";}
}
window._armScanAbrir=async function(){
  if(!aPedido())return;document.getElementById("armv2-scan-modal").classList.add("on");var inp=document.getElementById("armv2-scan-code");inp.value="";inp.focus();var st=document.getElementById("armv2-scan-status");st.textContent="Podés escribir el código o usar la cámara.";
  var nativeOk=!!(window.BarcodeDetector&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia),zxingOk=!!(window.ZXingBrowser&&window.ZXingBrowser.BrowserMultiFormatReader);
  if(!nativeOk&&!zxingOk){st.textContent="La cámara automática no está disponible acá. Usá el lector Bluetooth o escribí el código.";return;}
  try{
    _armScanLatch="";_armScanClearFrames=0;_armScanLastHitAt=0;var v=document.getElementById("armv2-scan-video"),guide=document.getElementById("armv2-scan-guide");v.style.display="block";if(guide)guide.style.display="block";st.textContent="Alineá el código. Para repetir el mismo producto, retiralo del cuadro y volvé a mostrarlo.";
    if(nativeOk){
      _armScanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});v.srcObject=_armScanStream;await v.play();var d=await aCrearDetector();aScanLoop(d,v);
    }else{
      _armZxingReader=new window.ZXingBrowser.BrowserMultiFormatReader(undefined,{delayBetweenScanAttempts:260,delayBetweenScanSuccess:900});
      _armZxingControls=await _armZxingReader.decodeFromConstraints({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false},v,function(result){
        if(result){var raw=result.getText(),format=aZxingFormat(result),key=aBarcodeNorm(raw,format);_armScanLastHitAt=Date.now();_armScanClearFrames=0;if(key&&key!==_armScanLatch){_armScanLatch=key;window._armProcesarCodigo(raw,{formato:format,permitirSku:false,desdeCamara:true});}}
        else if(_armScanLatch&&Date.now()-_armScanLastHitAt>800){_armScanLatch="";}
      });
    }
  }catch(e){window._armScanCerrar();document.getElementById("armv2-scan-modal").classList.add("on");st.textContent="No se pudo abrir la cámara. Revisá el permiso o ingresá el código manualmente.";}
};
window._armScanCerrar=function(){
  var m=document.getElementById("armv2-scan-modal");if(m)m.classList.remove("on");if(_armScanTimer){clearTimeout(_armScanTimer);_armScanTimer=null;}if(_armZxingControls&&typeof _armZxingControls.stop==="function")try{_armZxingControls.stop();}catch(e){}_armZxingControls=null;_armZxingReader=null;if(_armScanStream){_armScanStream.getTracks().forEach(function(t){t.stop();});_armScanStream=null;}_armScanLatch="";_armScanClearFrames=0;_armScanLastHitAt=0;var guide=document.getElementById("armv2-scan-guide");if(guide)guide.style.display="none";var v=document.getElementById("armv2-scan-video");if(v){v.srcObject=null;v.style.display="none";}
};

window._armConsolidado=function(){
  var map={};(typeof window._armPendientes==="function"?window._armPendientes():[]).forEach(function(b){(b.items||[]).forEach(function(it,i){var id=aId(it),key=id||aNombre(it).trim().toLowerCase(),n=aNombre(it);if(window._armQuery&&n.toLowerCase().indexOf(window._armQuery)<0)return;var u=aUbicacion(it);if(!map[key])map[key]={key:key,id:id,n:n,c:0,ubicacion:u.texto,orden:u.orden,asignaciones:[]};map[key].c+=aCant(it);map[key].asignaciones.push({pedidoId:b.id,indice:i,c:aCant(it),cliente:b.clienteNom||"Pedido"});});});
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.orden-b.orden||a.ubicacion.localeCompare(b.ubicacion)||a.n.localeCompare(b.n);});
};
window._armConsTick=function(k){window._armConsCheck[k]=!window._armConsCheck[k];try{localStorage.setItem(aConsKey(),JSON.stringify(window._armConsCheck));}catch(e){}window._armRenderLista();};
window._armConsTodos=function(v){window._armConsolidado().forEach(function(x){window._armConsCheck[x.key]=v;});try{localStorage.setItem(aConsKey(),JSON.stringify(window._armConsCheck));}catch(e){}window._armRenderLista();};
async function aAplicarConsPedido(bk,indices){
  var token=aUuid(),uid=window._armUid(),nom=window._armNom(),base={p_empresa:window._sbEmpId,p_pedido_id:aSbId(bk),p_usuario:uid,p_usuario_nom:nom,p_lock_token:token,p_revision:null,p_progreso:null,p_resultado:null,p_ttl_seg:180};
  var claim=await window.sbFetch("POST","/rest/v1/rpc/armado_operar",Object.assign({},base,{p_accion:"reclamar"}));claim=Array.isArray(claim)?claim[0]:claim;if(!claim||claim.ok===false)return{ok:false,codigo:claim&&claim.codigo};
  var p=aJsonObject(claim.progreso);p.check=Object.assign({},aJsonObject(p.check));indices.forEach(function(i){p.check[i]=true;});p.version=2;p.actualizadoEn=new Date().toISOString();
  var save=await window.sbFetch("POST","/rest/v1/rpc/armado_operar",Object.assign({},base,{p_accion:"guardar",p_revision:aNum(claim.revision),p_progreso:p}));save=Array.isArray(save)?save[0]:save;
  if(save&&save.ok!==false){bk.armadoProgreso=p;bk.armadoRevision=aNum(save.revision);try{await window.sbFetch("POST","/rest/v1/rpc/armado_operar",Object.assign({},base,{p_accion:"liberar",p_revision:aNum(save.revision)}));}catch(e){}return{ok:true};}
  return{ok:false,codigo:save&&save.codigo};
}
window._armConsDistribuir=async function(){
  var sel=window._armConsolidado().filter(function(x){return !!window._armConsCheck[x.key];});if(!sel.length){if(window.showNotif)window.showNotif("Marcá al menos un producto consolidado","warn");return;}
  var porPedido={};sel.forEach(function(x){x.asignaciones.forEach(function(a){(porPedido[a.pedidoId]=porPedido[a.pedidoId]||[]).push(a.indice);});});var ids=Object.keys(porPedido),ok=0,bloq=0,err=0,btn=document.getElementById("armv2-cons-aplicar");if(btn){btn.disabled=true;btn.textContent="Distribuyendo 0/"+ids.length+"…";}
  for(var i=0;i<ids.length;i++){var bk=window._armGetAll().find(function(b){return String(b.id)===String(ids[i]);});try{var r=await aAplicarConsPedido(bk,porPedido[ids[i]]);if(r.ok)ok++;else if(r.codigo==="PEDIDO_BLOQUEADO")bloq++;else err++;}catch(e){err++;}if(btn)btn.textContent="Distribuyendo "+(i+1)+"/"+ids.length+"…";}
  if(ok===ids.length){sel.forEach(function(x){delete window._armConsCheck[x.key];});try{localStorage.setItem(aConsKey(),JSON.stringify(window._armConsCheck));}catch(e){}}
  if(window.showNotif)window.showNotif("Consolidado aplicado a "+ok+" pedido"+(ok!==1?"s":"")+(bloq?" · "+bloq+" bloqueados":"")+(err?" · "+err+" con error":""),err?"warn":"ok");window._armRenderLista();
};

function aLockOtro(b){return b.armadoLockToken&&String(b.armadoLockUsuario||"")!==String(window._armUid())&&new Date(b.armadoLockHasta||0).getTime()>Date.now();}
window._armRenderLista=function(){
  var cont=document.getElementById("arm-lista");if(!cont)return;
  if(window._armModo==="consolidado"){
    var cons=window._armConsolidado(),sel=cons.filter(function(x){return !!window._armConsCheck[x.key];}).length;
    cont.innerHTML='<div class="armv2-cons-actions"><button onclick="_armConsTodos(true)">✓ Marcar todo</button><button onclick="_armConsTodos(false)">Limpiar</button><button id="armv2-cons-aplicar" class="primary" onclick="_armConsDistribuir()" '+(!sel?'disabled':'')+'>📦 Distribuir en pedidos'+(sel?' ('+sel+')':'')+'</button></div>'+(cons.length?cons.map(function(x){var on=!!window._armConsCheck[x.key],det=x.asignaciones.slice(0,4).map(function(a){return aEsc(a.cliente)+' ×'+a.c;}).join(" · "),safeKey=encodeURIComponent(x.key).replace(/'/g,"%27");return '<div class="arm-cons'+(on?' arm-on':'')+'" onclick="_armConsTick(decodeURIComponent(\''+safeKey+'\'))"><div class="arm-chk">'+(on?'✓':'')+'</div><div class="armv2-main"><div class="arm-item-n">'+aEsc(x.n)+'</div><div class="armv2-tags">'+(x.ubicacion?'<span class="armv2-tag loc">📍 '+aEsc(x.ubicacion)+'</span>':'')+'<span class="armv2-alloc">'+aEsc(det)+(x.asignaciones.length>4?' · +'+(x.asignaciones.length-4)+' pedidos':'')+'</span></div></div><div class="arm-item-q">'+x.c+' u</div></div>';}).join(""):'<div class="repi-empty">No hay productos pendientes.</div>');return;
  }
  var pend=(typeof window._armPendientes==="function"?window._armPendientes():[]).filter(typeof window._armMatch==="function"?window._armMatch:function(){return true;});
  if(!pend.length){cont.innerHTML='<div class="repi-empty">🎉 No hay pedidos pendientes de armado.</div>';return;}
  cont.innerHTML=pend.map(function(b){var badges="",lock=aLockOtro(b),p=aJsonObject(b.armadoProgreso),done=Object.keys(aJsonObject(p.check)).length+Object.keys(aJsonObject(p.faltantes)).filter(function(k){return aNum(p.faltantes[k])>0&&!p.check[k];}).length,ruta=typeof window._armRutaNom==="function"?window._armRutaNom(b):"";
    if(b.armadorAsignado&&String(b.armadorAsignado)===String(window._armUid()))badges+='<span class="arm-badge arm-badge-mine">👤 Para vos</span>';if(typeof window._armEsOnline==="function"&&window._armEsOnline(b))badges+='<span class="arm-badge arm-badge-online">🛒 Online</span>';if(lock)badges+='<span class="arm-badge armv2-badge-lock">🔒 '+aEsc(b.armadoLockNombre||"En uso")+'</span>';else if(done)badges+='<span class="arm-badge arm-badge-prep">↻ '+done+'/'+(b.items||[]).length+'</span>';
    return '<div class="arm-ped"><div class="arm-ped-top"><div class="arm-ped-nom">'+aEsc(b.clienteNom||"Pedido")+'</div><div class="arm-ped-badges">'+badges+'</div></div><div class="arm-ped-meta">'+(b.items||[]).length+' productos · '+(typeof window._armUnidades==="function"?window._armUnidades(b):0)+' u'+(ruta?' · 🚚 '+aEsc(ruta):'')+(typeof window._armHace==="function"?' · '+window._armHace(b.fecha):'')+'</div><button class="arm-ped-btn" '+(lock?'disabled':'')+' onclick="_armAbrir(\''+aEsc(b.id)+'\')">'+(lock?'🔒 En uso':(done?'↻ Continuar':'📦 Armar'))+'</button></div>';
  }).join("");
};

function aRenderMetrics(){
  var host=document.getElementById("armv2-metricas");if(!host)return;var all=(typeof window._armArmados==="function"?window._armArmados():[]),mins=[],units=0,falt=0,sust=0,corr=0;
  all.forEach(function(b){var m=aJsonObject(b.armadoMetricas);units+=aNum(m.unidades_originales)||((b.items||[]).reduce(function(t,it){return t+aCant(it);},0));falt+=aNum(m.faltantes_unidades)||((b.faltantes||[]).reduce(function(t,x){return t+aNum(x.c||x.cantidad);},0));sust+=aNum(m.sustituciones_unidades)||((b.armadoSustituciones||[]).reduce(function(t,x){return t+aNum(x.cantidad);},0));corr+=aNum(m.correcciones);var sec=aNum(m.duracion_segundos);if(sec>0)mins.push(sec/60);else if(typeof window._armTiempoMin==="function"){var mm=window._armTiempoMin(b);if(mm!=null)mins.push(mm);}});
  var prom=mins.length?Math.round(mins.reduce(function(t,x){return t+x;},0)/mins.length):0;
  host.innerHTML='<div><b>'+prom+' min</b><span>promedio/pedido</span></div><div><b>'+units+'</b><span>unidades armadas</span></div><div><b>'+falt+'</b><span>faltantes</span></div><div><b>'+sust+'</b><span>sustituciones</span></div><div><b>'+corr+'</b><span>correcciones</span></div>';
}
window._armInicioRender=async function(){if(typeof _armLegacyInicioRender==="function")await _armLegacyInicioRender();aRenderMetrics();};

function aInject(){
  if(document.getElementById("armador-operativo-v2-style"))return;
  var st=document.createElement("style");st.id="armador-operativo-v2-style";st.textContent='\
.armv2-lock{font-size:11.5px;font-weight:700;padding:7px 10px;border-radius:9px;margin-bottom:9px;background:rgba(16,185,129,.1);color:#047857;border:1px solid rgba(16,185,129,.3)}.armv2-lock.warn{background:rgba(245,158,11,.1);color:#a16207;border-color:rgba(245,158,11,.35)}.armv2-lock.err{background:rgba(220,38,38,.1);color:#b91c1c;border-color:rgba(220,38,38,.35)}\
.armv2-info-grid{display:grid;grid-template-columns:1fr auto;gap:4px 12px}.armv2-info-grid span{color:var(--muted)}.armv2-main{flex:1;min-width:0}.armv2-tags{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}.armv2-tag{display:inline-flex;align-items:center;gap:3px;border-radius:999px;padding:2px 7px;font-size:10px;font-weight:750;line-height:1.25}.armv2-tag.loc{background:rgba(59,130,246,.1);color:#2563eb}.armv2-tag.falta{background:rgba(220,38,38,.1);color:#dc2626}.armv2-tag.scan{background:rgba(16,185,129,.1);color:#059669}.armv2-tag.sust{background:rgba(147,51,234,.1);color:#7e22ce}.armv2-tag button{border:0;background:none;color:inherit;padding:0 0 0 2px;font-weight:900;cursor:pointer}.armv2-sust-btn{width:36px;height:38px;border:1px solid var(--border);border-radius:8px;background:var(--s2);color:#7e22ce;font-size:17px;cursor:pointer}.armv2-sust-row{border-color:rgba(147,51,234,.35)}\
.armv2-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.58);z-index:100020;align-items:center;justify-content:center;padding:14px}.armv2-overlay.on{display:flex}.armv2-card{width:min(430px,100%);max-height:90vh;overflow:auto;background:var(--s1,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:16px;padding:17px;box-shadow:0 20px 60px rgba(0,0,0,.35)}.armv2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}.armv2-head b{font-size:17px}.armv2-head small{display:block;color:var(--muted);margin-top:3px}.armv2-x{border:0;background:var(--s3);border-radius:8px;width:34px;height:34px;cursor:pointer;color:var(--text)}.armv2-actions{display:flex;gap:8px;margin-top:13px}.armv2-actions button{flex:1;padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--s2);color:var(--text);font-weight:750;cursor:pointer}.armv2-actions .primary{background:#24459d;color:white;border-color:#24459d}.armv2-stepper{display:grid;grid-template-columns:48px 1fr 48px;gap:7px}.armv2-stepper button,.armv2-stepper input{height:48px;border:1px solid var(--border);border-radius:10px;background:var(--s2);color:var(--text);font-size:20px;text-align:center}.armv2-stepper button{font-weight:900;cursor:pointer}\
.armv2-review-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.armv2-review-kpis div{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:9px;text-align:center}.armv2-review-kpis b{display:block;font-size:18px}.armv2-review-kpis span{font-size:9.5px;color:var(--muted)}.armv2-review-sec{display:flex;flex-direction:column;gap:4px;margin-top:12px;padding:10px;background:var(--s2);border-radius:10px}.armv2-review-sec span{font-size:12px}.armv2-total{display:flex;justify-content:space-between;align-items:center;margin-top:13px;padding:12px;border-top:1px solid var(--border)}.armv2-total b{font-size:20px}.armv2-warning{font-size:11px;color:#a16207;background:rgba(245,158,11,.1);padding:8px;border-radius:8px}\
.armv2-search{width:100%;box-sizing:border-box;padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--s2);color:var(--text);font:inherit}.armv2-results{display:flex;flex-direction:column;gap:6px;margin-top:9px;max-height:38vh;overflow:auto}.armv2-results>button{display:flex;justify-content:space-between;align-items:center;text-align:left;padding:9px;border:1px solid var(--border);border-radius:9px;background:var(--s2);color:var(--text);cursor:pointer}.armv2-results span{display:flex;flex-direction:column}.armv2-results small{color:var(--muted);margin-top:2px}.armv2-picked{margin-top:10px;padding:10px;border:1px solid rgba(147,51,234,.35);background:rgba(147,51,234,.07);border-radius:10px}.armv2-picked input{width:100%;box-sizing:border-box;margin-top:7px;padding:9px;border:1px solid var(--border);border-radius:8px;background:var(--s1);color:var(--text)}\
.armv2-scan-video-wrap{position:relative}#armv2-scan-video{display:none;width:100%;max-height:250px;object-fit:cover;border-radius:10px;background:#000;margin-bottom:8px}.armv2-scan-guide{pointer-events:none;position:absolute;display:none;left:10%;right:10%;top:50%;height:54px;transform:translateY(-50%);border:2px solid rgba(255,255,255,.92);border-radius:8px;box-shadow:0 0 0 999px rgba(0,0,0,.18)}.armv2-scan-row{display:flex;gap:7px}.armv2-scan-row input{flex:1;min-width:0;padding:11px;border:1px solid var(--border);border-radius:9px;background:var(--s2);color:var(--text)}.armv2-scan-row button{padding:0 14px;border:0;border-radius:9px;background:#24459d;color:#fff;font-weight:750}.armv2-scan-status{font-size:12px;color:var(--muted);padding:8px 1px;line-height:1.4}\
.armv2-cons-actions{display:flex;gap:6px;position:sticky;top:0;z-index:2;background:var(--bg);padding:4px 0 9px}.armv2-cons-actions button{padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--s2);color:var(--text);font-weight:700}.armv2-cons-actions .primary{margin-left:auto;background:#24459d;color:#fff}.armv2-cons-actions button:disabled{opacity:.45}.armv2-alloc{display:block;width:100%;font-size:10px;color:var(--muted)}.armv2-badge-lock{background:rgba(220,38,38,.1);color:#b91c1c}.arm-ped-btn:disabled{opacity:.55;cursor:not-allowed}\
#armv2-metricas{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0 14px}#armv2-metricas div{background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:8px;text-align:center}#armv2-metricas b{display:block;font-size:15px}#armv2-metricas span{display:block;font-size:8.5px;text-transform:uppercase;color:var(--muted);margin-top:2px}.armv2-empty{text-align:center;padding:14px;color:var(--muted)}\
@media(max-width:560px){#armv2-metricas{grid-template-columns:repeat(3,1fr)}.arm-item{gap:7px;padding:10px}.armv2-sust-btn,.arm-falta-btn{width:34px}.armv2-review-kpis{grid-template-columns:1fr 1fr 1fr}}';document.head.appendChild(st);
  var lock=document.createElement("div");lock.id="arm-lock-status";lock.className="armv2-lock";var progress=document.getElementById("arm-progress");if(progress&&progress.parentNode)progress.parentNode.insertBefore(lock,progress);
  var qa=document.querySelector("#arm-modal .arm-quick-actions");if(qa){var scan=document.createElement("button");scan.type="button";scan.className="arm-quick-btn";scan.textContent="📷 Escanear";scan.onclick=window._armScanAbrir;qa.appendChild(scan);}
  var bin=document.getElementById("arm-bultos");if(bin)bin.addEventListener("input",function(){window._armGuardarBorrador();});
  var kpis=document.getElementById("armi-kpis");if(kpis&&kpis.parentNode){var met=document.createElement("div");met.id="armv2-metricas";kpis.parentNode.insertBefore(met,kpis.nextSibling);}
  var wrap=document.createElement("div");wrap.innerHTML='\
<div id="armv2-falta-modal" class="armv2-overlay"><div class="armv2-card"><div class="armv2-head"><div><b>⚠️ Faltante parcial</b><small id="armv2-falta-title"></small></div><button class="armv2-x" onclick="_armFaltaCerrar()">×</button></div><div id="armv2-falta-max" style="font-size:12px;color:var(--muted);margin-bottom:8px"></div><div class="armv2-stepper"><button onclick="_armFaltaPaso(-1)">−</button><input id="armv2-falta-cant" type="number" min="0" step="1" inputmode="decimal"><button onclick="_armFaltaPaso(1)">+</button></div><button onclick="_armFaltaTodo()" style="width:100%;margin-top:7px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--s2);color:var(--text)">Falta todo el renglón</button><div class="armv2-actions"><button onclick="_armFaltaCerrar()">Cancelar</button><button class="primary" onclick="_armFaltaAplicar()">Aplicar faltante</button></div></div></div>\
<div id="armv2-sust-modal" class="armv2-overlay"><div class="armv2-card"><div class="armv2-head"><div><b>↔ Sustituir producto</b><small id="armv2-sust-original"></small></div><button class="armv2-x" onclick="_armSustCerrar()">×</button></div><input id="armv2-sust-buscar" class="armv2-search" placeholder="Buscar reemplazo por nombre o código…" oninput="_armSustBuscar(this.value)"><div id="armv2-sust-resultados" class="armv2-results"></div><div id="armv2-sust-elegido" class="armv2-picked" style="display:none"><b id="armv2-sust-elegido-n"></b><input id="armv2-sust-q" type="number" min="0" step="1" inputmode="decimal" placeholder="Cantidad a sustituir"><div class="armv2-actions"><button onclick="_armSustCerrar()">Cancelar</button><button class="primary" onclick="_armSustAplicar()">Usar reemplazo</button></div></div></div></div>\
<div id="armv2-review-modal" class="armv2-overlay"><div class="armv2-card"><div class="armv2-head"><div><b>🔎 Revisión final</b><small>Confirmá antes de mandar el pedido a reparto</small></div><button class="armv2-x" onclick="_armReviewCerrar()">×</button></div><div id="armv2-review-body"></div><div class="armv2-actions"><button onclick="_armReviewCerrar()">Volver a revisar</button><button class="primary" onclick="_armConfirmarFinal()">Confirmar armado</button></div></div></div>\
<div id="armv2-scan-modal" class="armv2-overlay"><div class="armv2-card"><div class="armv2-head"><div><b>📷 Escanear productos</b><small>Un escaneo suma una unidad o un bulto</small></div><button class="armv2-x" onclick="_armScanCerrar()">×</button></div><div class="armv2-scan-video-wrap"><video id="armv2-scan-video" playsinline muted></video><div id="armv2-scan-guide" class="armv2-scan-guide"></div></div><div class="armv2-scan-row"><input id="armv2-scan-code" inputmode="text" placeholder="Código de barras o SKU" onkeydown="if(event.key===\'Enter\')_armScanManual()"><button onclick="_armScanManual()">Agregar</button></div><div id="armv2-scan-status" class="armv2-scan-status"></div></div></div>';
  while(wrap.firstChild)document.body.appendChild(wrap.firstChild);
  try{var saved=JSON.parse(localStorage.getItem(aConsKey())||"{}");window._armConsCheck=Object.assign(window._armConsCheck||{},aJsonObject(saved));}catch(e){}
}
window.__armadorV2Test={
  buildResult:aBuildResult,
  applyProgress:aApplyProgress,
  snapshot:aSnapshot,
  resolved:aResolved,
  consolidated:window._armConsolidado
};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",aInject);else aInject();

})();
