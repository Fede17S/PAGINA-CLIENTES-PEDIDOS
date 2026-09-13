(function(){
"use strict";

window.DEPOSITO_MAPA_VERSION="1.1.0";

var TIPOS={
  estanteria:{nombre:"Estantería",icono:"▤",color:"#2563eb",almacena:true},
  rack:{nombre:"Rack",icono:"▥",color:"#7c3aed",almacena:true},
  pallet:{nombre:"Pallet",icono:"▦",color:"#b45309",almacena:true},
  frio:{nombre:"Frío",icono:"❄️",color:"#0891b2",almacena:true},
  recepcion:{nombre:"Recepción",icono:"📥",color:"#059669",almacena:false},
  preparacion:{nombre:"Preparación",icono:"📦",color:"#4f46e5",almacena:false},
  devoluciones:{nombre:"Devoluciones",icono:"↩️",color:"#dc2626",almacena:false},
  cuarentena:{nombre:"Cuarentena",icono:"🛑",color:"#ea580c",almacena:false},
  pasillo:{nombre:"Pasillo",icono:"↕",color:"#64748b",almacena:false},
  libre:{nombre:"Área libre",icono:"□",color:"#94a3b8",almacena:false}
};

var M={
  modo:"listado",
  mapa:null,
  cargado:false,
  cargando:false,
  cargaPromesa:null,
  puedeEditar:true,
  editando:false,
  sucio:false,
  respaldo:null,
  elementoId:null,
  detalleId:null,
  instalado:false,
  errorCarga:"",
  arrastreFin:0
};

function mEsc(v){
  if(typeof window.escHtml==="function")return window.escHtml(String(v==null?"":v));
  return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;");
}
function mNorm(v){return String(v==null?"":v).trim().replace(/\s+/g," ");}
function mKey(v){return mNorm(v).toLocaleLowerCase("es");}
function mNum(v,def){var n=parseInt(v,10);return isFinite(n)?n:def;}
function mClamp(n,min,max){return Math.max(min,Math.min(max,n));}
function mCopia(v){return JSON.parse(JSON.stringify(v));}
function mId(prefijo){
  if(window.crypto&&typeof window.crypto.randomUUID==="function")return prefijo+"-"+window.crypto.randomUUID();
  return prefijo+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);
}
function mTipo(tipo){return TIPOS[tipo]||TIPOS.libre;}
function mMapaVacio(){return {nombre:"Depósito principal",ancho:12,alto:8,elementos:[],revision:0,actualizadoEn:null,actualizadoPor:""};}
function mNormalizarElemento(raw,mapa,indice){
  raw=raw||{};var tipo=TIPOS[raw.tipo]?raw.tipo:"libre";
  var x=mClamp(mNum(raw.x,0),0,mapa.ancho-1),y=mClamp(mNum(raw.y,0),0,mapa.alto-1);
  var w=mClamp(mNum(raw.w,2),1,mapa.ancho-x),h=mClamp(mNum(raw.h,2),1,mapa.alto-y);
  var color=mNorm(raw.color);if(!/^#[0-9a-f]{6}$/i.test(color))color=mTipo(tipo).color;
  return {
    id:mNorm(raw.id)||("area-"+(indice+1)),tipo:tipo,nombre:mNorm(raw.nombre)||mTipo(tipo).nombre,
    pasillo:mNorm(raw.pasillo),estante:mNorm(raw.estante),color:color.toLowerCase(),
    x:x,y:y,w:w,h:h
  };
}
function mNormalizarMapa(raw){
  raw=raw||{};var mapa=mMapaVacio();
  mapa.nombre=mNorm(raw.nombre)||mapa.nombre;
  mapa.ancho=mClamp(mNum(raw.ancho,mapa.ancho),4,30);
  mapa.alto=mClamp(mNum(raw.alto,mapa.alto),4,24);
  mapa.revision=Math.max(0,mNum(raw.revision,0));
  mapa.actualizadoEn=raw.actualizadoEn||raw.actualizado_en||null;
  mapa.actualizadoPor=mNorm(raw.actualizadoPor||raw.actualizado_por);
  mapa.elementos=(Array.isArray(raw.elementos)?raw.elementos:[]).slice(0,200).map(function(e,i){return mNormalizarElemento(e,mapa,i);});
  return mapa;
}
function mLocKey(pasillo,estante){
  var p=mKey(pasillo),e=mKey(estante);return p||e?p+"\u0001"+e:"";
}
function mFilas(){
  var productos=window._prodData&&Object.keys(window._prodData).length?window._prodData:null;
  var filas=[];
  if(productos){
    Object.keys(productos).forEach(function(id){
      var p=productos[id]||{},codigo=mNorm(p.codigo||id);if(!codigo)return;
      var sk=codigo;
      if(typeof window._stkClaveStock==="function"){var resolved=window._stkClaveStock(codigo);if(resolved!=null)sk=resolved;}
      var cant=+((window.stockData||{})[sk]||0);
      var cfg=(window.stockConfig||{})[sk]||(window.stockConfig||{})[codigo]||{};
      filas.push({sbId:id,codigo:codigo,nombre:p.nombre||p.n||codigo,pasillo:p.ubicacionPasillo||p.ubicacion_pasillo||"",estante:p.ubicacionEstante||p.ubicacion_estante||"",orden:p.ubicacionOrden==null?p.ubicacion_orden:p.ubicacionOrden,cantidad:cant,umbral:cfg.umbral==null?5:+cfg.umbral||0});
    });
  }else{
    (window.dbStock||[]).forEach(function(p){
      var codigo=mNorm(p.codigo||p.id);if(!codigo)return;
      filas.push({sbId:p._sbId||p.sbId||null,codigo:codigo,nombre:p.nombre||p.n||codigo,pasillo:p.ubicacionPasillo||p.ubicacion_pasillo||"",estante:p.ubicacionEstante||p.ubicacion_estante||"",orden:p.ubicacionOrden==null?p.ubicacion_orden:p.ubicacionOrden,cantidad:+((window.stockData||{})[codigo]||0),umbral:5});
    });
  }
  return filas;
}
function mProductosElemento(elemento,filas){
  if(!elemento||!mTipo(elemento.tipo).almacena)return [];
  var loc=mLocKey(elemento.pasillo,elemento.estante);if(!loc)return [];
  return (filas||[]).filter(function(f){return mLocKey(f.pasillo,f.estante)===loc;});
}
function mUbicacionesFaltantes(filas,elementos){
  var grupos={},cubiertas={};
  (elementos||[]).forEach(function(e){if(mTipo(e.tipo).almacena){var k=mLocKey(e.pasillo,e.estante);if(k)cubiertas[k]=true;}});
  (filas||[]).forEach(function(f){var k=mLocKey(f.pasillo,f.estante);if(!k||cubiertas[k])return;if(!grupos[k])grupos[k]={key:k,pasillo:mNorm(f.pasillo),estante:mNorm(f.estante),productos:0,unidades:0};grupos[k].productos++;grupos[k].unidades+=Math.max(0,+f.cantidad||0);});
  return Object.keys(grupos).map(function(k){return grupos[k];}).sort(function(a,b){return (a.pasillo+" "+a.estante).localeCompare(b.pasillo+" "+b.estante,"es");});
}
function mSolapa(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function mLugarLibre(mapa,w,h,ignorarId){
  for(var y=0;y<=mapa.alto-h;y++)for(var x=0;x<=mapa.ancho-w;x++){
    var candidato={x:x,y:y,w:w,h:h};
    var ocupado=mapa.elementos.some(function(e){return e.id!==ignorarId&&mSolapa(candidato,e);});
    if(!ocupado)return {x:x,y:y};
  }
  if(mapa.alto<24){mapa.alto=Math.min(24,mapa.alto+Math.max(2,h));return mLugarLibre(mapa,w,h,ignorarId);}
  return null;
}
function mAgregarFaltantes(mapa,filas){
  var faltantes=mUbicacionesFaltantes(filas,mapa.elementos),agregados=0;
  faltantes.forEach(function(g){
    var pos=mLugarLibre(mapa,3,2,null);if(!pos)return;
    mapa.elementos.push({id:mId("ubicacion"),tipo:"estanteria",nombre:(g.pasillo?"Pasillo "+g.pasillo:"")+(g.pasillo&&g.estante?" · ":"")+(g.estante?"Estante "+g.estante:""),pasillo:g.pasillo,estante:g.estante,color:TIPOS.estanteria.color,x:pos.x,y:pos.y,w:3,h:2});agregados++;
  });
  return agregados;
}
function mEstadoFila(f){if(f.cantidad<0)return "neg";if(f.cantidad===0)return "sin";if(f.cantidad<=f.umbral)return "bajo";return "ok";}
function mEsAdminLocal(){
  var u=window.currentUser||{},roles=[];if(u.role)roles.push(u.role);if(Array.isArray(u.roles))roles=roles.concat(u.roles);
  if(!roles.length)return true;
  return roles.some(function(r){r=mKey(r);return r==="admin"||r==="co-admin"||r==="superadmin";});
}
function mCacheKey(){return "dm_deposito_mapa_v1_"+String(window._sbEmpId||"sin_empresa");}
function mGuardarCache(){try{localStorage.setItem(mCacheKey(),JSON.stringify({ts:Date.now(),mapa:M.mapa,puedeEditar:M.puedeEditar}));}catch(e){}}
function mLeerCache(){try{var c=JSON.parse(localStorage.getItem(mCacheKey())||"null");return c&&c.mapa?c:null;}catch(e){return null;}}
function mNotif(txt,tipo){if(typeof window.showNotif==="function")window.showNotif(txt,tipo||"info");else console.log(txt);}
function mAbrir(id){if(typeof window.abrirModal==="function")window.abrirModal(id);else{var el=document.getElementById(id);if(el)el.classList.add("open");}}
function mCerrar(id){if(typeof window.cerrarModal==="function")window.cerrarModal(id);else{var el=document.getElementById(id);if(el)el.classList.remove("open");}}
function mFecha(v){if(!v)return "Todavía no guardado";try{return new Intl.DateTimeFormat("es-AR",{dateStyle:"short",timeStyle:"short"}).format(new Date(v));}catch(e){return String(v);}}
function mSetSucio(valor){M.sucio=valor!==false;var b=document.getElementById("dep-map-save");if(b)b.disabled=!M.sucio||M.cargando;}

function mQrPayload(elemento){
  if(!elemento||!elemento.id||!window._sbEmpId)return "";
  return "DISTRIBIX:DEP:"+String(window._sbEmpId)+":"+String(elemento.id);
}
function mParseQr(valor){
  var s=String(valor||"").trim(),m=s.match(/^DISTRIBIX:DEP:([0-9a-f-]{36}):(.+)$/i);
  if(!m)return null;
  if(window._sbEmpId&&String(m[1]).toLowerCase()!==String(window._sbEmpId).toLowerCase())return null;
  return {empresaId:m[1],elementoId:m[2],raw:s};
}
function mRutaElementos(mapa){
  mapa=mNormalizarMapa(mapa||M.mapa||mMapaVacio());
  var pendientes=mapa.elementos.filter(function(e){return mTipo(e.tipo).almacena;}).slice(),ruta=[];
  var actual={x:0,y:mapa.alto};
  while(pendientes.length){
    pendientes.sort(function(a,b){
      function dist(e){return Math.abs(actual.x-(e.x+e.w/2))+Math.abs(actual.y-(e.y+e.h/2));}
      return dist(a)-dist(b)||a.y-b.y||a.x-b.x||String(a.nombre).localeCompare(String(b.nombre),"es");
    });
    var elegido=pendientes.shift();ruta.push(elegido);actual={x:elegido.x+elegido.w/2,y:elegido.y+elegido.h/2};
  }
  return ruta;
}
function mOrdenUbicacion(pasillo,estante){
  var key=mLocKey(pasillo,estante);if(!key)return 999999;
  var ruta=mRutaElementos(M.mapa),i=ruta.findIndex(function(e){return mLocKey(e.pasillo,e.estante)===key;});
  return i<0?999999:i;
}
function mBuscarQr(valor){
  var q=mParseQr(valor);if(!q)return null;
  return (M.mapa&&M.mapa.elementos||[]).find(function(e){return String(e.id)===String(q.elementoId);})||null;
}
function mImprimirQr(id){
  var el=(M.mapa&&M.mapa.elementos||[]).find(function(e){return String(e.id)===String(id);});
  if(!el){mNotif("No encontré esa ubicación.","err");return;}
  if(typeof window.qrcode!=="function"){mNotif("El generador QR todavía no está disponible.","err");return;}
  var payload=mQrPayload(el),qr=window.qrcode(0,"M");qr.addData(payload);qr.make();
  var loc=(el.pasillo?"Pasillo "+el.pasillo:"")+(el.pasillo&&el.estante?" · ":"")+(el.estante?"Estante "+el.estante:"");
  var w=window.open("","_blank","width=520,height=700");
  if(!w){mNotif("Permití ventanas emergentes para imprimir la etiqueta.","err");return;}
  w.document.open();
  w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta '+mEsc(el.nombre)+'</title><style>body{font-family:Arial,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh}.label{width:86mm;min-height:62mm;border:2px solid #111;border-radius:4mm;padding:6mm;box-sizing:border-box;text-align:center}.label h1{font-size:22px;margin:0 0 3mm}.label p{font-size:14px;margin:0 0 4mm}.label svg{width:38mm;height:38mm}.label small{display:block;margin-top:2mm;font-size:9px;color:#555}@media print{body{min-height:auto}.label{break-inside:avoid}}</style></head><body><div class="label"><h1>'+mEsc(el.nombre)+'</h1><p>'+mEsc(loc||mTipo(el.tipo).nombre)+'</p>'+qr.createSvgTag(5,0)+'<small>DISTRIBIX · Escaneá para ir a esta ubicación durante el armado</small></div><script>setTimeout(function(){window.print()},250)<\/script></body></html>');
  w.document.close();
}

function mRenderDetalle(){
  var box=document.getElementById("dep-map-detail");if(!box)return;
  var el=(M.mapa&&M.mapa.elementos||[]).find(function(e){return e.id===M.detalleId;});
  if(!el){box.style.display="none";box.innerHTML="";return;}
  var filas=mProductosElemento(el,mFilas()).sort(function(a,b){var ao=a.orden==null?999999:+a.orden,bo=b.orden==null?999999:+b.orden;return ao-bo||String(a.nombre).localeCompare(String(b.nombre),"es");});
  var unidades=filas.reduce(function(n,f){return n+Math.max(0,f.cantidad);},0);
  box.style.display="block";
  box.innerHTML='<header><div><b>'+mEsc(mTipo(el.tipo).icono+" "+el.nombre)+'</b><span>'+(el.pasillo||el.estante?mEsc((el.pasillo?"Pasillo "+el.pasillo:"")+(el.pasillo&&el.estante?" · ":"")+(el.estante?"Estante "+el.estante:"")):mEsc(mTipo(el.tipo).nombre))+'</span></div>'+(mTipo(el.tipo).almacena?'<button type="button" class="dep-map-qr" id="dep-map-detail-qr">🏷️ QR</button>':'')+'<button type="button" id="dep-map-detail-close">✕</button></header>'+
    '<div class="dep-map-detail-summary"><b>'+filas.length+' productos</b><span>'+unidades+' unidades positivas</span></div>'+
    (filas.length?'<div class="dep-map-detail-list">'+filas.slice(0,100).map(function(f){return '<div><span><b>'+mEsc(f.nombre)+'</b><small>'+mEsc(f.codigo)+'</small></span><strong class="'+mEstadoFila(f)+'">'+f.cantidad+'</strong></div>';}).join("")+'</div>':'<div class="dep-map-detail-empty">Esta área todavía no tiene productos vinculados.</div>');
  document.getElementById("dep-map-detail-close").onclick=function(){M.detalleId=null;mRenderDetalle();};
  var qrBtn=document.getElementById("dep-map-detail-qr");if(qrBtn)qrBtn.onclick=function(){mImprimirQr(el.id);};
}

function mRender(){
  var pane=document.getElementById("dep-map-pane"),canvas=document.getElementById("dep-map-canvas"),status=document.getElementById("dep-map-status");if(!pane||!canvas)return;
  M.mapa=mNormalizarMapa(M.mapa||mMapaVacio());var mapa=M.mapa,filas=mFilas(),faltantes=mUbicacionesFaltantes(filas,mapa.elementos);
  var ubicados={},productosMapeados=0,unidades=0,alertas=0;
  mapa.elementos.forEach(function(e){mProductosElemento(e,filas).forEach(function(f){if(!ubicados[f.codigo]){ubicados[f.codigo]=true;productosMapeados++;unidades+=Math.max(0,f.cantidad);if(mEstadoFila(f)!=="ok")alertas++;}});});
  var almacenamiento=mapa.elementos.filter(function(e){return mTipo(e.tipo).almacena;}).length;
  if(status)status.innerHTML='<span><b>'+almacenamiento+'</b> ubicaciones en el plano</span><span><b>'+productosMapeados+'</b> productos mapeados</span><span><b>'+unidades+'</b> unidades</span>'+(alertas?'<span class="alerta"><b>'+alertas+'</b> con alerta</span>':'')+(faltantes.length?'<span class="pendiente"><b>'+faltantes.length+'</b> ubicaciones sin dibujar</span>':'<span class="ok"><b>✓</b> mapa completo</span>');
  var titulo=document.getElementById("dep-map-title"),meta=document.getElementById("dep-map-meta");if(titulo)titulo.textContent=mapa.nombre;if(meta)meta.textContent=mFecha(mapa.actualizadoEn)+(mapa.actualizadoPor?" · "+mapa.actualizadoPor:"")+(M.errorCarga?" · modo local":"");
  var edit=document.getElementById("dep-map-edit"),actions=document.getElementById("dep-map-actions");if(edit){edit.style.display=(M.puedeEditar&&mEsAdminLocal())?"":"none";edit.textContent=M.editando?"✓ Terminar edición":"✏️ Editar mapa";}if(actions)actions.style.display=M.editando?"flex":"none";
  canvas.style.setProperty("--map-cols",mapa.ancho);canvas.style.setProperty("--map-rows",mapa.alto);canvas.style.width="max(100%, "+(mapa.ancho*62)+"px)";canvas.style.height=(mapa.alto*58)+"px";canvas.classList.toggle("editing",M.editando);
  if(!mapa.elementos.length){
    canvas.innerHTML='<div class="dep-map-empty"><div>🗺️</div><b>El plano está vacío</b><span>Entrá en edición y crealo desde las ubicaciones existentes o agregá las áreas manualmente.</span>'+(M.puedeEditar?'<button type="button" id="dep-map-empty-start">Crear mapa</button>':'')+'</div>';
    var start=document.getElementById("dep-map-empty-start");if(start)start.onclick=function(){window._depMapaEditar();};mRenderDetalle();return;
  }
  canvas.innerHTML=mapa.elementos.map(function(e){
    var prods=mProductosElemento(e,filas),cant=prods.reduce(function(n,f){return n+Math.max(0,f.cantidad);},0),conAlerta=prods.filter(function(f){return mEstadoFila(f)!=="ok";}).length,t=mTipo(e.tipo);
    var loc=(e.pasillo?"P. "+e.pasillo:"")+(e.pasillo&&e.estante?" · ":"")+(e.estante?"E. "+e.estante:"");
    return '<button type="button" class="dep-map-item tipo-'+mEsc(e.tipo)+(conAlerta?' con-alerta':'')+'" data-map-id="'+mEsc(e.id)+'" style="left:'+(e.x/mapa.ancho*100)+'%;top:'+(e.y/mapa.alto*100)+'%;width:'+(e.w/mapa.ancho*100)+'%;height:'+(e.h/mapa.alto*100)+'%;--area-color:'+mEsc(e.color)+'" title="'+mEsc(e.nombre)+'"><span class="dep-map-icon">'+mEsc(t.icono)+'</span><b>'+mEsc(e.nombre)+'</b>'+(loc?'<small>'+mEsc(loc)+'</small>':'')+(t.almacena?'<em>'+prods.length+' prod. · '+cant+' u.</em>':'<em>'+mEsc(t.nombre)+'</em>')+(conAlerta?'<i>⚠ '+conAlerta+'</i>':'')+'</button>';
  }).join("");
  canvas.querySelectorAll("[data-map-id]").forEach(function(btn){
    btn.onclick=function(){if(Date.now()-M.arrastreFin<250)return;var id=this.getAttribute("data-map-id");if(M.editando)window._depMapaAbrirElemento(id);else{M.detalleId=id;mRenderDetalle();var d=document.getElementById("dep-map-detail");if(d)d.scrollIntoView({behavior:"smooth",block:"nearest"});}};
    if(M.editando)mActivarArrastre(btn);
  });
  mRenderDetalle();
}

function mActivarArrastre(btn){
  btn.onpointerdown=function(ev){
    if(!M.editando||ev.button>0)return;var id=btn.getAttribute("data-map-id"),el=M.mapa.elementos.find(function(x){return x.id===id;});if(!el)return;
    ev.preventDefault();var canvas=document.getElementById("dep-map-canvas"),rect=canvas.getBoundingClientRect(),sx=ev.clientX,sy=ev.clientY,ox=el.x,oy=el.y,movio=false;
    btn.classList.add("dragging");
    function mover(e){
      var nx=mClamp(ox+Math.round((e.clientX-sx)/(rect.width/M.mapa.ancho)),0,M.mapa.ancho-el.w),ny=mClamp(oy+Math.round((e.clientY-sy)/(rect.height/M.mapa.alto)),0,M.mapa.alto-el.h);
      if(nx!==el.x||ny!==el.y){movio=true;el.x=nx;el.y=ny;btn.style.left=(nx/M.mapa.ancho*100)+"%";btn.style.top=(ny/M.mapa.alto*100)+"%";}
    }
    function soltar(){
      document.removeEventListener("pointermove",mover);document.removeEventListener("pointerup",soltar);document.removeEventListener("pointercancel",soltar);btn.classList.remove("dragging");
      if(movio){var choca=M.mapa.elementos.some(function(x){return x.id!==el.id&&mSolapa(el,x);});if(choca){el.x=ox;el.y=oy;mNotif("Esa posición está ocupada.","err");}else mSetSucio(true);M.arrastreFin=Date.now();mRender();}
    }
    document.addEventListener("pointermove",mover,{passive:false});document.addEventListener("pointerup",soltar);document.addEventListener("pointercancel",soltar);
  };
}

async function mRpc(nombre,body){
  if(typeof window.sbFetch!=="function")throw new Error("No está disponible la conexión con Supabase");
  return window.sbFetch("POST","/rest/v1/rpc/"+nombre,body);
}
async function mCargar(force){
  if(M.cargaPromesa)return M.cargaPromesa;if(M.cargado&&!force){mRender();return M.mapa;}
  var cache=mLeerCache();if(cache&&!M.cargado){M.mapa=mNormalizarMapa(cache.mapa);M.puedeEditar=cache.puedeEditar!==false&&mEsAdminLocal();mRender();}
  M.cargando=true;M.errorCarga="";mRender();
  M.cargaPromesa=(async function(){
    try{
      if(!window._sbEmpId)throw new Error("Falta seleccionar la empresa");
      var res=await mRpc("deposito_obtener_mapa",{p_empresa:window._sbEmpId});
      if(!res||res.ok===false)throw new Error((res&&res.codigo)||"No se pudo leer el mapa");
      M.mapa=mNormalizarMapa(res.mapa);M.puedeEditar=res.puedeEditar!==false;M.cargado=true;mGuardarCache();
    }catch(e){M.errorCarga=(e&&e.message)||String(e);M.cargado=!!M.mapa;if(!M.mapa)M.mapa=mMapaVacio();mNotif("No pude sincronizar el mapa: "+M.errorCarga,"err");}
    finally{M.cargando=false;M.cargaPromesa=null;mRender();}
    return M.mapa;
  })();
  return M.cargaPromesa;
}

async function mGuardar(){
  if(!M.sucio){M.editando=false;M.respaldo=null;mRender();return;}
  if(!navigator.onLine){mNotif("Necesitás conexión para guardar el mapa sin pisar cambios de otro dispositivo.","err");return;}
  var btn=document.getElementById("dep-map-save");if(btn){btn.disabled=true;btn.textContent="Guardando…";}
  try{
    var res=await mRpc("deposito_guardar_mapa",{p_empresa:window._sbEmpId,p_nombre:M.mapa.nombre,p_ancho:M.mapa.ancho,p_alto:M.mapa.alto,p_elementos:M.mapa.elementos,p_revision:M.mapa.revision});
    if(res&&res.ok===false&&res.codigo==="REVISION_DESACTUALIZADA"){
      if(res.mapa)M.mapa=mNormalizarMapa(res.mapa);M.editando=false;M.sucio=false;M.respaldo=null;mGuardarCache();mRender();mNotif("Otro dispositivo cambió el mapa. Cargué la versión más nueva para evitar pisarla.","err");return;
    }
    if(!res||res.ok===false)throw new Error((res&&res.codigo)||"No se pudo guardar el mapa");
    M.mapa=mNormalizarMapa(res.mapa);M.editando=false;M.sucio=false;M.respaldo=null;M.errorCarga="";M.cargado=true;mGuardarCache();mRender();
    try{if(typeof window._auditar==="function")window._auditar("editar","deposito",String(M.mapa.revision),"Actualizó el mapa del depósito");}catch(e){}
    mNotif("🗺️ Mapa guardado. Las cantidades de stock no cambiaron.","ok");
  }catch(e){mNotif("No se pudo guardar el mapa: "+((e&&e.message)||e),"err");}
  finally{if(btn){btn.textContent="💾 Guardar mapa";btn.disabled=!M.sucio;}}
}

function mSetModo(modo){
  M.modo=modo==="mapa"?"mapa":"listado";
  var listado=[document.getElementById("dep-kpis"),document.querySelector("#stk-deposito-pane .dep-filtros"),document.getElementById("dep-list")],mapa=document.getElementById("dep-map-pane");
  listado.forEach(function(el){if(el)el.style.display=M.modo==="listado"?"":"none";});if(mapa)mapa.style.display=M.modo==="mapa"?"block":"none";
  document.querySelectorAll("[data-dep-modo]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-dep-modo")===M.modo);});
  if(M.modo==="mapa")mCargar(false);
}

function mAbrirElemento(id){
  if(!M.editando)return;var el=id?M.mapa.elementos.find(function(e){return e.id===id;}):null,pos=null;
  if(!el){pos=mLugarLibre(M.mapa,3,2,null);if(!pos){mNotif("No queda espacio. Agrandá el plano desde Configurar.","err");return;}el={id:"",tipo:"estanteria",nombre:"Nueva estantería",pasillo:"",estante:"",color:TIPOS.estanteria.color,x:pos.x,y:pos.y,w:3,h:2};}
  M.elementoId=id||null;
  document.getElementById("dep-mape-title").textContent=id?"Editar área":"Nueva área";
  document.getElementById("dep-mape-tipo").value=el.tipo;document.getElementById("dep-mape-nombre").value=el.nombre;document.getElementById("dep-mape-pasillo").value=el.pasillo||"";document.getElementById("dep-mape-estante").value=el.estante||"";document.getElementById("dep-mape-color").value=el.color||mTipo(el.tipo).color;
  document.getElementById("dep-mape-x").value=el.x+1;document.getElementById("dep-mape-y").value=el.y+1;document.getElementById("dep-mape-w").value=el.w;document.getElementById("dep-mape-h").value=el.h;document.getElementById("dep-mape-delete").style.display=id?"":"none";mActualizarCamposTipo();mAbrir("dep-mape-modal");
}
function mActualizarCamposTipo(){var t=mTipo(document.getElementById("dep-mape-tipo").value),loc=document.getElementById("dep-mape-location");if(loc)loc.style.opacity=t.almacena?"1":".48";}
function mGuardarElemento(){
  var tipo=document.getElementById("dep-mape-tipo").value,t=mTipo(tipo),nombre=mNorm(document.getElementById("dep-mape-nombre").value),pasillo=mNorm(document.getElementById("dep-mape-pasillo").value),estante=mNorm(document.getElementById("dep-mape-estante").value);
  if(!nombre){mNotif("Escribí un nombre para el área.","err");return;}
  var el={id:M.elementoId||mId("area"),tipo:tipo,nombre:nombre,pasillo:t.almacena?pasillo:"",estante:t.almacena?estante:"",color:document.getElementById("dep-mape-color").value||t.color,x:mNum(document.getElementById("dep-mape-x").value,1)-1,y:mNum(document.getElementById("dep-mape-y").value,1)-1,w:mNum(document.getElementById("dep-mape-w").value,1),h:mNum(document.getElementById("dep-mape-h").value,1)};
  if(el.x<0||el.y<0||el.w<1||el.h<1||el.x+el.w>M.mapa.ancho||el.y+el.h>M.mapa.alto){mNotif("El área queda fuera de los límites del plano.","err");return;}
  if(M.mapa.elementos.some(function(x){return x.id!==el.id&&mSolapa(el,x);})){mNotif("Esa posición se superpone con otra área.","err");return;}
  var lk=mLocKey(el.pasillo,el.estante);if(t.almacena&&lk&&M.mapa.elementos.some(function(x){return x.id!==el.id&&mTipo(x.tipo).almacena&&mLocKey(x.pasillo,x.estante)===lk;})){mNotif("Esa combinación de pasillo y estante ya está dibujada.","err");return;}
  var i=M.mapa.elementos.findIndex(function(x){return x.id===el.id;});if(i>=0)M.mapa.elementos[i]=el;else M.mapa.elementos.push(el);M.elementoId=null;mCerrar("dep-mape-modal");mSetSucio(true);mRender();
}
async function mEliminarElemento(){
  if(!M.elementoId)return;var el=M.mapa.elementos.find(function(e){return e.id===M.elementoId;}),cant=mProductosElemento(el,mFilas()).length,ok=true;
  if(typeof window._confirmar==="function")ok=await window._confirmar({icono:"🗺️",titulo:"Quitar área del mapa",mensaje:"Se quitará «"+el.nombre+"» del plano."+(cant?" Sus "+cant+" productos conservarán su pasillo y estante.":"")+" No se modificará el stock.",ok:"Quitar del mapa",peligro:true});else ok=confirm("¿Quitar esta área del mapa?");
  if(!ok)return;M.mapa.elementos=M.mapa.elementos.filter(function(e){return e.id!==M.elementoId;});M.detalleId=null;M.elementoId=null;mCerrar("dep-mape-modal");mSetSucio(true);mRender();
}
function mAbrirConfig(){document.getElementById("dep-mapc-nombre").value=M.mapa.nombre;document.getElementById("dep-mapc-ancho").value=M.mapa.ancho;document.getElementById("dep-mapc-alto").value=M.mapa.alto;mAbrir("dep-mapc-modal");}
function mGuardarConfig(){
  var nombre=mNorm(document.getElementById("dep-mapc-nombre").value)||"Depósito principal",ancho=mClamp(mNum(document.getElementById("dep-mapc-ancho").value,12),4,30),alto=mClamp(mNum(document.getElementById("dep-mapc-alto").value,8),4,24),maxX=0,maxY=0;
  M.mapa.elementos.forEach(function(e){maxX=Math.max(maxX,e.x+e.w);maxY=Math.max(maxY,e.y+e.h);});if(ancho<maxX||alto<maxY){mNotif("El plano nuevo dejaría áreas afuera. Movelas primero o usá al menos "+maxX+" × "+maxY+".","err");return;}
  M.mapa.nombre=nombre;M.mapa.ancho=ancho;M.mapa.alto=alto;mCerrar("dep-mapc-modal");mSetSucio(true);mRender();
}
function mCompletarUbicaciones(){var n=mAgregarFaltantes(M.mapa,mFilas());if(!n){mNotif("Todas las ubicaciones de productos ya están dibujadas.","ok");return;}mSetSucio(true);mRender();mNotif("Agregué "+n+" ubicación"+(n!==1?"es":"")+" al plano. Podés arrastrarlas y luego guardar.","ok");}
async function mCancelarEdicion(){
  var ok=true;if(M.sucio&&typeof window._confirmar==="function")ok=await window._confirmar({icono:"↩️",titulo:"Descartar cambios del mapa",mensaje:"Se perderán solamente los cambios del plano que todavía no guardaste.",ok:"Descartar",peligro:true});if(!ok)return;
  if(M.respaldo)M.mapa=mNormalizarMapa(M.respaldo);M.editando=false;M.sucio=false;M.respaldo=null;M.detalleId=null;mRender();
}
function mEditar(){
  if(!M.editando){if(!M.puedeEditar||!mEsAdminLocal()){mNotif("Solo administradores pueden editar el mapa.","err");return;}M.respaldo=mCopia(M.mapa);M.editando=true;M.sucio=false;M.detalleId=null;mRender();}
  else if(M.sucio)mGuardar();else{M.editando=false;M.respaldo=null;mRender();}
}

function mInject(){
  if(M.instalado)return;var dep=document.getElementById("stk-deposito-pane"),kpis=document.getElementById("dep-kpis");if(!dep||!kpis){setTimeout(mInject,80);return;}M.instalado=true;
  var style=document.createElement("style");style.id="deposito-mapa-style";style.textContent=`
#dep-modos{display:flex;gap:5px;margin:0 0 10px;padding:4px;background:var(--s2);border:1px solid var(--border);border-radius:10px}#dep-modos button{flex:1;border:0;border-radius:7px;background:transparent;color:var(--muted);font:800 11.5px inherit;padding:8px;cursor:pointer}#dep-modos button.on{background:var(--s1);color:var(--accent);box-shadow:0 1px 3px rgba(0,0,0,.1)}
#dep-map-pane{display:none}.dep-map-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:8px}.dep-map-toolbar>div{min-width:0;margin-right:auto}.dep-map-toolbar b,.dep-map-toolbar span{display:block}.dep-map-toolbar b{font-size:14px}.dep-map-toolbar span{font-size:9.5px;color:var(--muted);margin-top:2px}.dep-map-toolbar button,.dep-map-actions button{border:1px solid var(--border);background:var(--s1);color:var(--text);border-radius:8px;padding:7px 9px;font:800 10.5px inherit;cursor:pointer}.dep-map-toolbar button.primary,.dep-map-actions button.primary{background:var(--accent);border-color:var(--accent);color:#fff}
#dep-map-actions{display:none;align-items:center;gap:6px;flex-wrap:wrap;padding:8px;margin-bottom:8px;border:1px solid #93c5fd;background:#eff6ff;border-radius:10px}#dep-map-actions .spacer{flex:1}#dep-map-actions button.danger{color:#b91c1c}#dep-map-actions button:disabled{opacity:.5;cursor:not-allowed}
#dep-map-status{display:flex;gap:6px;overflow:auto;padding:2px 0 8px;scrollbar-width:none}#dep-map-status span{flex:0 0 auto;border:1px solid var(--border);background:var(--s1);border-radius:999px;padding:5px 8px;font-size:9.5px;color:var(--muted)}#dep-map-status span b{color:var(--text)}#dep-map-status .alerta,#dep-map-status .pendiente{background:#fff7ed;border-color:#fdba74;color:#9a3412}#dep-map-status .ok{background:#ecfdf5;border-color:#86efac;color:#166534}
.dep-map-scroll{overflow:auto;border:1px solid var(--border);border-radius:12px;background:var(--s2);overscroll-behavior:contain}.dep-map-canvas{position:relative;min-height:300px;background-color:#f8fafc;background-image:linear-gradient(to right,rgba(100,116,139,.16) 1px,transparent 1px),linear-gradient(to bottom,rgba(100,116,139,.16) 1px,transparent 1px);background-size:calc(100% / var(--map-cols)) calc(100% / var(--map-rows))}.dep-map-canvas:before{content:"ENTRADA";position:absolute;left:8px;bottom:5px;color:#64748b;font-size:9px;font-weight:900;letter-spacing:.08em}.dep-map-item{position:absolute;box-sizing:border-box;border:2px solid var(--area-color);border-left-width:6px;border-radius:9px;background:color-mix(in srgb,var(--area-color) 12%,white);color:#172033;padding:6px;overflow:hidden;text-align:left;font-family:inherit;box-shadow:0 2px 5px rgba(15,23,42,.08);cursor:pointer}.dep-map-item b,.dep-map-item small,.dep-map-item em{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dep-map-item b{font-size:11px}.dep-map-item small{font-size:8.5px;color:#475569;margin-top:2px}.dep-map-item em{font-style:normal;font-size:8.5px;color:#64748b;margin-top:4px}.dep-map-item i{position:absolute;right:4px;top:4px;background:#fff7ed;color:#9a3412;border-radius:999px;padding:2px 4px;font:800 8px inherit}.dep-map-icon{float:right;font-size:14px}.dep-map-canvas.editing .dep-map-item{outline:1px dashed #0f172a;touch-action:none;cursor:grab}.dep-map-canvas.editing .dep-map-item.dragging{opacity:.8;cursor:grabbing;z-index:20}.dep-map-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:30px;color:#64748b}.dep-map-empty>div{font-size:34px}.dep-map-empty b{color:#334155;margin-top:6px}.dep-map-empty span{max-width:390px;font-size:11px;line-height:1.45;margin-top:5px}.dep-map-empty button{margin-top:12px;border:0;border-radius:8px;background:var(--accent);color:#fff;padding:9px 13px;font:800 11px inherit}
#dep-map-detail{display:none;margin-top:10px;border:1px solid var(--border);background:var(--s1);border-radius:11px;overflow:hidden}#dep-map-detail>header{display:flex;align-items:center;padding:10px 12px;background:var(--s2);border-bottom:1px solid var(--border)}#dep-map-detail>header>div{margin-right:auto}#dep-map-detail header b,#dep-map-detail header span{display:block}#dep-map-detail header b{font-size:12px}#dep-map-detail header span{font-size:9.5px;color:var(--muted);margin-top:2px}#dep-map-detail header button{border:0;background:transparent;font-size:15px}.dep-map-detail-summary{display:flex;justify-content:space-between;padding:8px 12px;font-size:10px;color:var(--muted)}.dep-map-detail-list{max-height:260px;overflow:auto}.dep-map-detail-list>div{display:flex;align-items:center;gap:10px;padding:8px 12px;border-top:1px solid var(--border)}.dep-map-detail-list span{min-width:0;margin-right:auto}.dep-map-detail-list b,.dep-map-detail-list small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dep-map-detail-list b{font-size:10.5px}.dep-map-detail-list small{font-size:8.5px;color:var(--muted)}.dep-map-detail-list strong{min-width:42px;text-align:right;font-size:11px}.dep-map-detail-list strong.bajo{color:#b45309}.dep-map-detail-list strong.sin,.dep-map-detail-list strong.neg{color:#dc2626}.dep-map-detail-empty{padding:22px;text-align:center;color:var(--muted);font-size:11px}
#dep-mape-modal .dep-map-form,#dep-mapc-modal .dep-map-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}#dep-mape-modal label,#dep-mapc-modal label{display:block;font-size:10px;font-weight:800;color:var(--muted);margin-bottom:4px}#dep-mape-modal input,#dep-mape-modal select,#dep-mapc-modal input{width:100%;box-sizing:border-box}#dep-mape-modal .full,#dep-mapc-modal .full{grid-column:1/-1}#dep-mape-location{display:grid;grid-template-columns:1fr 1fr;gap:10px;grid-column:1/-1;padding:10px;border:1px solid var(--border);border-radius:9px}.dep-map-safe-note{grid-column:1/-1;padding:9px 10px;border:1px solid #86efac;background:#ecfdf5;color:#166534;border-radius:9px;font-size:10.5px;line-height:1.4}
@media(max-width:650px){.dep-map-toolbar{align-items:flex-start;flex-wrap:wrap}.dep-map-toolbar>div{width:100%}.dep-map-toolbar button{flex:1}.dep-map-actions button{flex:1 1 42%}.dep-map-actions .spacer{display:none}#dep-mape-modal .dep-map-form{grid-template-columns:1fr 1fr}.dep-map-item{padding:5px}.dep-map-item b{font-size:10px}}
`;document.head.appendChild(style);
  var qrStyle=document.createElement("style");qrStyle.textContent="#dep-map-detail>header{gap:6px}.dep-map-qr{border:1px solid var(--border)!important;background:var(--s1)!important;border-radius:7px!important;padding:6px 8px!important;font:800 9.5px inherit!important;color:var(--accent)!important}";document.head.appendChild(qrStyle);
  var modos=document.createElement("div");modos.id="dep-modos";modos.innerHTML='<button type="button" class="on" data-dep-modo="listado">📋 Listado</button><button type="button" data-dep-modo="mapa">🗺️ Mapa del depósito</button>';dep.insertBefore(modos,kpis);
  var pane=document.createElement("div");pane.id="dep-map-pane";pane.innerHTML='<div class="dep-map-toolbar"><div><b id="dep-map-title">Depósito principal</b><span id="dep-map-meta">Todavía no guardado</span></div><button type="button" id="dep-map-refresh">↻ Actualizar</button><button type="button" class="primary" id="dep-map-edit">✏️ Editar mapa</button></div><div id="dep-map-actions"><button type="button" id="dep-map-add">＋ Área</button><button type="button" id="dep-map-auto">✨ Completar ubicaciones</button><button type="button" id="dep-map-config">⚙️ Configurar</button><span class="spacer"></span><button type="button" class="danger" id="dep-map-cancel">Cancelar</button><button type="button" class="primary" id="dep-map-save" disabled>💾 Guardar mapa</button></div><div id="dep-map-status"></div><div class="dep-map-scroll"><div class="dep-map-canvas" id="dep-map-canvas"></div></div><div id="dep-map-detail"></div>';dep.appendChild(pane);
  modos.querySelectorAll("[data-dep-modo]").forEach(function(b){b.onclick=function(){mSetModo(this.getAttribute("data-dep-modo"));};});document.getElementById("dep-map-refresh").onclick=function(){mCargar(true);};document.getElementById("dep-map-edit").onclick=mEditar;document.getElementById("dep-map-add").onclick=function(){mAbrirElemento(null);};document.getElementById("dep-map-auto").onclick=mCompletarUbicaciones;document.getElementById("dep-map-config").onclick=mAbrirConfig;document.getElementById("dep-map-cancel").onclick=mCancelarEdicion;document.getElementById("dep-map-save").onclick=mGuardar;
  var modals=document.createElement("div");modals.innerHTML='<div class="modal-bg" id="dep-mape-modal" onclick="if(event.target===this)cerrarModal(\'dep-mape-modal\')"><div class="modal-box" style="max-width:520px"><div class="modal-head"><div class="modal-ttl" id="dep-mape-title">Nueva área</div><button class="modal-cls" onclick="cerrarModal(\'dep-mape-modal\')">✕</button></div><div style="padding:15px 17px"><div class="dep-map-form"><div class="dep-map-safe-note"><b>El plano es organizativo.</b> Mover, crear o quitar áreas no cambia ninguna cantidad de stock.</div><div><label>Tipo de área</label><select id="dep-mape-tipo"></select></div><div><label>Color</label><input id="dep-mape-color" type="color"></div><div class="full"><label>Nombre visible</label><input id="dep-mape-nombre" maxlength="80" placeholder="Ej: Estantería A"></div><div id="dep-mape-location"><div><label>Pasillo vinculado</label><input id="dep-mape-pasillo" maxlength="80" placeholder="Ej: 2"></div><div><label>Estante vinculado</label><input id="dep-mape-estante" maxlength="80" placeholder="Ej: B-03"></div></div><div><label>Columna</label><input id="dep-mape-x" type="number" min="1" max="30"></div><div><label>Fila</label><input id="dep-mape-y" type="number" min="1" max="24"></div><div><label>Ancho en celdas</label><input id="dep-mape-w" type="number" min="1" max="30"></div><div><label>Alto en celdas</label><input id="dep-mape-h" type="number" min="1" max="24"></div></div></div><div style="padding:11px 17px;border-top:1px solid var(--border);display:flex;gap:8px"><button type="button" class="btn btn-ghost" id="dep-mape-delete" style="margin-right:auto;color:#b91c1c">Quitar</button><button type="button" class="btn btn-ghost" onclick="cerrarModal(\'dep-mape-modal\')">Cancelar</button><button type="button" class="btn btn-primary" id="dep-mape-ok">Aplicar</button></div></div></div><div class="modal-bg" id="dep-mapc-modal" onclick="if(event.target===this)cerrarModal(\'dep-mapc-modal\')"><div class="modal-box" style="max-width:430px"><div class="modal-head"><div class="modal-ttl">⚙️ Configurar plano</div><button class="modal-cls" onclick="cerrarModal(\'dep-mapc-modal\')">✕</button></div><div style="padding:15px 17px"><div class="dep-map-form"><div class="full"><label>Nombre</label><input id="dep-mapc-nombre" maxlength="80"></div><div><label>Columnas (4–30)</label><input id="dep-mapc-ancho" type="number" min="4" max="30"></div><div><label>Filas (4–24)</label><input id="dep-mapc-alto" type="number" min="4" max="24"></div><div class="dep-map-safe-note">Agrandar o achicar el plano solo cambia el dibujo. No modifica productos ni stock.</div></div></div><div style="padding:11px 17px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px"><button type="button" class="btn btn-ghost" onclick="cerrarModal(\'dep-mapc-modal\')">Cancelar</button><button type="button" class="btn btn-primary" id="dep-mapc-ok">Aplicar</button></div></div></div>';while(modals.firstChild)document.body.appendChild(modals.firstChild);
  var select=document.getElementById("dep-mape-tipo");select.innerHTML=Object.keys(TIPOS).map(function(k){return '<option value="'+k+'">'+mEsc(TIPOS[k].icono+" "+TIPOS[k].nombre)+'</option>';}).join("");select.onchange=function(){document.getElementById("dep-mape-color").value=mTipo(this.value).color;mActualizarCamposTipo();};document.getElementById("dep-mape-ok").onclick=mGuardarElemento;document.getElementById("dep-mape-delete").onclick=mEliminarElemento;document.getElementById("dep-mapc-ok").onclick=mGuardarConfig;
  M.mapa=mMapaVacio();mSetModo("listado");mRender();
}

window._depMapaSetModo=mSetModo;
window._depMapaEditar=mEditar;
window._depMapaAbrirElemento=mAbrirElemento;
window._depMapaGuardar=mGuardar;
window._depMapaRefrescar=function(){return mCargar(true);};
window.DepositoMapa={cargar:mCargar,obtener:function(){return M.mapa?mCopia(M.mapa):null;},ruta:mRutaElementos,ordenUbicacion:mOrdenUbicacion,qrPayload:mQrPayload,parseQr:mParseQr,buscarQr:mBuscarQr,imprimirQr:mImprimirQr};
window.__depositoMapaTest={normalizarMapa:mNormalizarMapa,claveUbicacion:mLocKey,productosElemento:mProductosElemento,ubicacionesFaltantes:mUbicacionesFaltantes,solapa:mSolapa,agregarFaltantes:mAgregarFaltantes,tipos:TIPOS,ruta:mRutaElementos,qrPayload:mQrPayload,parseQr:mParseQr};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",mInject);else mInject();
})();
