(function(){
"use strict";

window.DEPOSITO_STOCK_VERSION="1.0.0";

var _dep={
  vista:"inventario",
  filtro:"todos",
  seleccionado:null,
  filas:[],
  cargando:false,
  cargaPromesa:null,
  instalado:false
};

function dEsc(v){
  if(typeof window.escHtml==="function")return window.escHtml(String(v==null?"":v));
  return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function dNorm(v){return String(v==null?"":v).trim().replace(/\s+/g," ");}
function dNormKey(v){return dNorm(v).toLocaleLowerCase("es");}
function dLocKey(p){
  var pas=dNorm(p.pasillo),est=dNorm(p.estante);
  return pas||est ? dNormKey(pas)+"\u0001"+dNormKey(est) : "__sin_ubicar__";
}
function dLocLabel(p){
  var pas=dNorm(p.pasillo),est=dNorm(p.estante);
  if(!pas&&!est)return "Sin ubicar";
  if(pas&&est)return "Pasillo "+pas+" · Estante "+est;
  return pas ? "Pasillo "+pas : "Estante "+est;
}
function dStockKey(codigo){
  if(typeof window._stkClaveStock==="function"){
    var k=window._stkClaveStock(codigo);if(k!==null&&k!==undefined)return k;
  }
  codigo=String(codigo==null?"":codigo);
  return window.stockData&&Object.prototype.hasOwnProperty.call(window.stockData,codigo)?codigo:null;
}
function dCantidad(codigo){var k=dStockKey(codigo);return k===null?0:+((window.stockData||{})[k]||0);}
function dUmbral(codigo){
  if(typeof window.stkUmbral==="function")return +window.stkUmbral(codigo)||0;
  var c=(window.stockConfig||{})[codigo];return c&&c.umbral!=null?+c.umbral:5;
}
function dEstado(f){
  if(f.cantidad<0)return {key:"neg",txt:"Negativo",cls:"neg"};
  if(f.cantidad===0)return {key:"sin",txt:"Sin stock",cls:"sin"};
  if(f.cantidad<=f.umbral)return {key:"bajo",txt:"Bajo",cls:"bajo"};
  return {key:"ok",txt:"Disponible",cls:"ok"};
}
function dFilasDesde(productos,stock,config){
  productos=productos||{};stock=stock||{};config=config||{};
  var out=[],vistos={};
  if(!Array.isArray(productos)){
    Object.keys(productos).forEach(function(id){
      var p=productos[id]||{},codigo=dNorm(p.codigo||id);if(!codigo||vistos[codigo])return;vistos[codigo]=true;
      var cantidad=+(stock[codigo]||0),umbral=config[codigo]&&config[codigo].umbral!=null?+config[codigo].umbral:5;
      out.push({sbId:id,codigo:codigo,nombre:p.nombre||p.n||codigo,familia:p.familia||"",barcode:p.codigoBarras||p.codigo_barras||"",pasillo:p.ubicacionPasillo||p.ubicacion_pasillo||"",estante:p.ubicacionEstante||p.ubicacion_estante||"",orden:p.ubicacionOrden==null?(p.ubicacion_orden==null?null:+p.ubicacion_orden):+p.ubicacionOrden,cantidad:cantidad,umbral:umbral,activo:p.activo!==false});
    });
  }else{
    productos.forEach(function(p){
      p=p||{};var codigo=dNorm(p.codigo||p.id);if(!codigo||vistos[codigo])return;vistos[codigo]=true;
      var cantidad=+(stock[codigo]||0),umbral=config[codigo]&&config[codigo].umbral!=null?+config[codigo].umbral:5;
      out.push({sbId:p.sbId||p._sbId||null,codigo:codigo,nombre:p.nombre||p.n||codigo,familia:p.familia||"",barcode:p.codigoBarras||p.codigo_barras||"",pasillo:p.ubicacionPasillo||p.ubicacion_pasillo||"",estante:p.ubicacionEstante||p.ubicacion_estante||"",orden:p.ubicacionOrden==null?(p.ubicacion_orden==null?null:+p.ubicacion_orden):+p.ubicacionOrden,cantidad:cantidad,umbral:umbral,activo:p.activo!==false});
    });
  }
  return out;
}
function dFilas(){
  var mapa=window._prodData&&Object.keys(window._prodData).length?window._prodData:null;
  if(mapa)return dFilasDesde(mapa,window.stockData||{},window.stockConfig||{}).map(function(f){f.cantidad=dCantidad(f.codigo);f.umbral=dUmbral(f.codigo);return f;});
  return dFilasDesde(window.dbStock||[],window.stockData||{},window.stockConfig||{}).map(function(f){f.cantidad=dCantidad(f.codigo);f.umbral=dUmbral(f.codigo);return f;});
}
function dCoincide(f,q){
  if(!q)return true;
  var texto=[f.codigo,f.nombre,f.familia,f.barcode,f.pasillo,f.estante,dLocLabel(f)].join(" ").toLocaleLowerCase("es");
  if(typeof window._matchBusq==="function")return window._matchBusq(texto,q);
  return texto.indexOf(q)>=0;
}
function dActualizarChips(){
  document.querySelectorAll("[data-dep-filtro]").forEach(function(b){b.classList.toggle("active",b.getAttribute("data-dep-filtro")===_dep.filtro);});
}
function dKpis(filas){
  var ubicadas=filas.filter(function(f){return dLocKey(f)!=="__sin_ubicar__";}).length;
  var sin=filas.length-ubicadas,locs={};
  filas.forEach(function(f){var k=dLocKey(f);if(k!=="__sin_ubicar__")locs[k]=true;});
  var unidades=filas.reduce(function(n,f){return n+Math.max(0,f.cantidad);},0);
  return {productos:filas.length,ubicadas:ubicadas,sinUbicar:sin,ubicaciones:Object.keys(locs).length,unidades:unidades};
}
function dRender(){
  var pane=document.getElementById("stk-deposito-pane"),list=document.getElementById("dep-list"),kpis=document.getElementById("dep-kpis");
  if(!pane||!list||_dep.vista!=="deposito")return;
  var filas=dFilas();_dep.filas=filas;
  var q=dNormKey(((document.getElementById("stk-buscar")||{}).value)||window._stkFiltro||"");
  var base=filas.filter(function(f){return dCoincide(f,q);});
  var m=dKpis(base);
  if(kpis)kpis.innerHTML=
    '<button data-dep-filtro="todos"><b>'+m.productos+'</b><span>Productos</span></button>'+
    '<button data-dep-filtro="ubicados"><b>'+m.ubicadas+'</b><span>Ubicados</span></button>'+
    '<button data-dep-filtro="sin-ubicar" class="'+(m.sinUbicar?'attention':'')+'"><b>'+m.sinUbicar+'</b><span>Sin ubicar</span></button>'+
    '<div><b>'+m.ubicaciones+'</b><span>Ubicaciones</span></div>'+
    '<div><b>'+m.unidades+'</b><span>Unidades</span></div>';
  if(kpis)kpis.querySelectorAll("[data-dep-filtro]").forEach(function(b){b.onclick=function(){window._depSetFiltro(this.getAttribute("data-dep-filtro"));};});
  var mostrar=base.filter(function(f){
    var ubicado=dLocKey(f)!=="__sin_ubicar__",estado=dEstado(f).key;
    if(_dep.filtro==="ubicados")return ubicado;
    if(_dep.filtro==="sin-ubicar")return !ubicado;
    if(_dep.filtro==="bajo")return estado==="bajo";
    if(_dep.filtro==="sin")return estado==="sin";
    return true;
  });
  mostrar.sort(function(a,b){
    var au=dLocKey(a)==="__sin_ubicar__",bu=dLocKey(b)==="__sin_ubicar__";if(au!==bu)return au?-1:1;
    var l=dLocLabel(a).localeCompare(dLocLabel(b),"es");if(l)return l;
    var ao=a.orden==null?999999:a.orden,bo=b.orden==null?999999:b.orden;if(ao!==bo)return ao-bo;
    return String(a.nombre).localeCompare(String(b.nombre),"es");
  });
  if(!mostrar.length){list.innerHTML='<div class="dep-empty"><div>🏬</div><b>Sin productos en este filtro</b><span>Podés cambiar el filtro o buscar por nombre, código, ubicación o código de barras.</span></div>';dActualizarChips();return;}
  var grupos={};mostrar.forEach(function(f){var key=dLocKey(f);if(!grupos[key])grupos[key]={key:key,label:dLocLabel(f),items:[]};grupos[key].items.push(f);});
  var ordenGrupos=Object.keys(grupos).map(function(k){return grupos[k];}).sort(function(a,b){if(a.key==="__sin_ubicar__")return -1;if(b.key==="__sin_ubicar__")return 1;return a.label.localeCompare(b.label,"es");});
  list.innerHTML=ordenGrupos.map(function(g){
    var unidades=g.items.reduce(function(n,f){return n+Math.max(0,f.cantidad);},0),conAlerta=g.items.filter(function(f){return dEstado(f).key!=="ok";}).length;
    var limite=80,items=g.items.slice(0,limite).map(function(f){var e=dEstado(f),token=encodeURIComponent(f.sbId||("codigo:"+f.codigo));return '<div class="dep-producto">'+
      '<div class="dep-producto-main"><b>'+dEsc(f.nombre)+'</b><span>'+dEsc(f.codigo)+(f.familia?' · '+dEsc(f.familia):'')+(f.barcode?' · ▥ '+dEsc(f.barcode):'')+'</span></div>'+
      '<div class="dep-cantidad"><b>'+f.cantidad+'</b><span>unid.</span></div>'+
      '<span class="dep-estado '+e.cls+'">'+e.txt+'</span>'+
      '<button type="button" class="dep-edit" data-dep-edit="'+dEsc(token)+'" aria-label="Editar ubicación de '+dEsc(f.nombre)+'">✏️</button>'+
    '</div>';}).join("");
    if(g.items.length>limite)items+='<div class="dep-more">Mostrando '+limite+' de '+g.items.length+'. Usá el buscador para encontrar los demás.</div>';
    return '<section class="dep-grupo '+(g.key==="__sin_ubicar__"?'unlocated':'')+'"><header><div><b>'+(g.key==="__sin_ubicar__"?'⚠️ ':'📍 ')+dEsc(g.label)+'</b><span>'+g.items.length+' producto'+(g.items.length!==1?'s':'')+'</span></div><div><b>'+unidades+' u.</b>'+(conAlerta?'<span>'+conAlerta+' con alerta</span>':'<span>sin alertas</span>')+'</div></header><div class="dep-grupo-items">'+items+'</div></section>';
  }).join("");
  list.querySelectorAll("[data-dep-edit]").forEach(function(b){b.onclick=function(){window._depEditar(decodeURIComponent(this.getAttribute("data-dep-edit")));};});
  dActualizarChips();
}
async function dCargarProductos(force){
  if(_dep.cargaPromesa)return _dep.cargaPromesa;
  _dep.cargando=true;
  _dep.cargaPromesa=(async function(){
    try{
      if(typeof window._sbGetProductos==="function"){
        var fresh=await window._sbGetProductos(!!force);if(fresh&&Object.keys(fresh).length)window._prodData=fresh;
      }
    }catch(e){console.warn("[Depósito] catálogo:",e&&e.message);}
    finally{_dep.cargando=false;_dep.cargaPromesa=null;dRender();}
  })();
  return _dep.cargaPromesa;
}
function dSugerencias(){
  var pas={},est={};_dep.filas.forEach(function(f){if(dNorm(f.pasillo))pas[dNorm(f.pasillo)]=true;if(dNorm(f.estante))est[dNorm(f.estante)]=true;});
  var p=document.getElementById("dep-pasillos"),e=document.getElementById("dep-estantes");
  if(p)p.innerHTML=Object.keys(pas).sort().map(function(x){return '<option value="'+dEsc(x)+'">';}).join("");
  if(e)e.innerHTML=Object.keys(est).sort().map(function(x){return '<option value="'+dEsc(x)+'">';}).join("");
}
function dBuscarFila(token){
  if(String(token).indexOf("codigo:")===0){var c=String(token).slice(7);return _dep.filas.find(function(f){return String(f.codigo)===c;})||null;}
  return _dep.filas.find(function(f){return String(f.sbId)===String(token);})||null;
}
async function dResolverId(f){
  if(f&&f.sbId)return f.sbId;
  await dCargarProductos(true);
  var mapa=window._prodData||{},id=Object.keys(mapa).find(function(k){return String((mapa[k]||{}).codigo||"")===String(f&&f.codigo||"");});
  return id||null;
}
function dActualizarLocal(id,f,pasillo,estante,orden){
  if(window._prodData&&window._prodData[id]){window._prodData[id].ubicacionPasillo=pasillo;window._prodData[id].ubicacionEstante=estante;window._prodData[id].ubicacionOrden=orden;}
  (window.dbStock||[]).forEach(function(p){if(String(p.codigo||p.id)===String(f.codigo)){p.ubicacionPasillo=pasillo;p.ubicacionEstante=estante;p.ubicacionOrden=orden;}});
}
function dInject(){
  if(_dep.instalado||document.getElementById("stk-vistas"))return;var stock=document.getElementById("stock"),first=document.getElementById("stk-filtros");if(!stock||!first)return;
  _dep.instalado=true;
  var style=document.createElement("style");style.id="deposito-stock-style";style.textContent='\
#stk-vistas{display:flex;gap:5px;margin:0 0 10px;padding:4px;background:var(--s2);border:1px solid var(--border);border-radius:11px}#stk-vistas button{flex:1;border:0;border-radius:8px;background:transparent;color:var(--muted);font:700 12.5px inherit;padding:9px;cursor:pointer}#stk-vistas button.on{background:var(--s1);color:var(--accent);box-shadow:0 1px 4px rgba(0,0,0,.09)}\
#stk-deposito-pane{display:none}.dep-safe{display:flex;align-items:flex-start;gap:9px;padding:11px 12px;margin-bottom:10px;border:1px solid #86efac;background:var(--green-bg,#e8f7ef);border-radius:11px;color:#14532d;font-size:11.5px;line-height:1.4}.dep-safe b{display:block;font-size:12.5px}.dep-safe button{margin-left:auto;flex:0 0 auto;border:1px solid #86efac;background:#fff;color:#166534;border-radius:8px;padding:7px 9px;font:700 11px inherit;cursor:pointer}\
#dep-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-bottom:10px}#dep-kpis>button,#dep-kpis>div{border:1px solid var(--border);background:var(--s1);border-radius:10px;padding:9px 5px;text-align:center;color:var(--text);font-family:inherit}#dep-kpis>button{cursor:pointer}#dep-kpis>button.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}#dep-kpis>button.attention b{color:#b45309}#dep-kpis b{display:block;font-size:17px;line-height:1.1}#dep-kpis span{display:block;font-size:9.5px;color:var(--muted);margin-top:3px}\
.dep-filtros{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px}.dep-filtros button{border:1px solid var(--border);background:var(--s1);color:var(--muted);border-radius:999px;padding:6px 10px;font:700 11px inherit;cursor:pointer}.dep-filtros button.active{background:var(--accent);border-color:var(--accent);color:#fff}\
#dep-list{display:flex;flex-direction:column;gap:10px}.dep-grupo{border:1px solid var(--border);border-radius:12px;background:var(--s1);overflow:hidden}.dep-grupo.unlocated{border-color:#f59e0b}.dep-grupo>header{display:flex;justify-content:space-between;gap:10px;padding:11px 13px;background:var(--s2);border-bottom:1px solid var(--border)}.dep-grupo.unlocated>header{background:var(--amber-bg,#fef3c7)}.dep-grupo>header>div:last-child{text-align:right}.dep-grupo header b{display:block;font-size:12.5px}.dep-grupo header span{display:block;font-size:10px;color:var(--muted);margin-top:2px}.dep-producto{display:grid;grid-template-columns:minmax(0,1fr) 52px 70px 34px;align-items:center;gap:7px;padding:9px 11px;border-bottom:1px solid var(--border)}.dep-producto:last-child{border-bottom:0}.dep-producto-main{min-width:0}.dep-producto-main b,.dep-producto-main span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dep-producto-main b{font-size:12px}.dep-producto-main span{font-size:9.8px;color:var(--muted);margin-top:2px}.dep-cantidad{text-align:right}.dep-cantidad b{display:block;font-size:13px}.dep-cantidad span{font-size:9px;color:var(--muted)}.dep-estado{font-size:9px;font-weight:800;text-align:center;border-radius:999px;padding:4px}.dep-estado.ok{background:#dcfce7;color:#166534}.dep-estado.bajo{background:#fef3c7;color:#92400e}.dep-estado.sin,.dep-estado.neg{background:#fee2e2;color:#991b1b}.dep-edit{width:32px;height:32px;border:1px solid var(--border);background:var(--s2);border-radius:8px;cursor:pointer}.dep-more,.dep-empty{text-align:center;padding:16px;color:var(--muted);font-size:11px}.dep-empty{padding:34px 15px}.dep-empty>div{font-size:30px}.dep-empty b,.dep-empty span{display:block;margin-top:5px}\
#dep-modal .dep-note{padding:10px 12px;border:1px solid #93c5fd;background:#eff6ff;color:#1e40af;border-radius:9px;font-size:11.5px;line-height:1.4;margin-bottom:12px}#dep-modal .dep-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}#dep-modal label{display:block;font-size:10.5px;font-weight:700;color:var(--muted);margin-bottom:4px}#dep-modal input{width:100%;box-sizing:border-box}\
@media(max-width:650px){#dep-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.dep-producto{grid-template-columns:minmax(0,1fr) 42px 58px 34px}.dep-safe{flex-wrap:wrap}.dep-safe button{margin-left:0}#dep-modal .dep-grid{grid-template-columns:1fr}}';document.head.appendChild(style);
  var tabs=document.createElement("div");tabs.id="stk-vistas";tabs.innerHTML='<button type="button" class="on" data-dep-vista="inventario">📦 Inventario</button><button type="button" data-dep-vista="deposito">🏬 Depósito</button>';stock.insertBefore(tabs,first);
  var inv=document.createElement("div");inv.id="stk-inventario-pane";stock.insertBefore(inv,first);["stk-filtros","stk-colgadas","stk-summary","stk-valorizacion","stk-list"].forEach(function(id){var n=document.getElementById(id);if(n)inv.appendChild(n);});
  var dep=document.createElement("div");dep.id="stk-deposito-pane";dep.innerHTML='<div class="dep-safe"><div><b>🛡️ Organización segura del depósito</b>Esta vista solamente cambia pasillo, estante y orden. No modifica cantidades, movimientos ni ventas.</div><button type="button" id="dep-codigos">📷 Completar códigos</button></div><div id="dep-kpis"></div><div class="dep-filtros"><button type="button" class="active" data-dep-filtro="todos">Todos</button><button type="button" data-dep-filtro="ubicados">Ubicados</button><button type="button" data-dep-filtro="sin-ubicar">Sin ubicar</button><button type="button" data-dep-filtro="bajo">⚠️ Bajo</button><button type="button" data-dep-filtro="sin">Sin stock</button></div><div id="dep-list"><div class="dep-empty"><div>🏬</div><b>Cargando depósito…</b></div></div>';stock.appendChild(dep);
  tabs.querySelectorAll("[data-dep-vista]").forEach(function(b){b.onclick=function(){window._depSetVista(this.getAttribute("data-dep-vista"));};});
  dep.querySelectorAll("[data-dep-filtro]").forEach(function(b){b.onclick=function(){window._depSetFiltro(this.getAttribute("data-dep-filtro"));};});
  var cod=document.getElementById("dep-codigos");if(cod)cod.onclick=function(){if(typeof window._prodBarcodeAbrirCargaRapida==="function")window._prodBarcodeAbrirCargaRapida();else if(window.showNotif)window.showNotif("El cargador de códigos todavía no está disponible.","err");};
  var wrap=document.createElement("div");wrap.innerHTML='<div class="modal-bg" id="dep-modal" onclick="if(event.target===this)cerrarModal(\'dep-modal\')"><div class="modal-box" style="max-width:460px"><div class="modal-head"><div><div class="modal-ttl">📍 Ubicación del producto</div><div id="dep-modal-sub" style="font-size:11px;color:var(--muted);margin-top:2px"></div></div><button class="modal-cls" onclick="cerrarModal(\'dep-modal\')">✕</button></div><div style="padding:15px 17px"><div class="dep-note"><b>Esta acción no toca el stock.</b> Solamente indica dónde encontrar el producto dentro del depósito.</div><div class="dep-grid"><div><label>Pasillo</label><input id="dep-pasillo" list="dep-pasillos" maxlength="80" placeholder="Ej: 2"><datalist id="dep-pasillos"></datalist></div><div><label>Estante / posición</label><input id="dep-estante" list="dep-estantes" maxlength="80" placeholder="Ej: B-03"><datalist id="dep-estantes"></datalist></div><div><label>Orden de recorrido</label><input id="dep-orden" type="number" min="0" max="99999" step="1" inputmode="numeric" placeholder="Ej: 20"></div></div></div><div style="padding:12px 17px;border-top:1px solid var(--border);display:flex;gap:8px"><button type="button" class="btn btn-ghost" id="dep-limpiar" style="margin-right:auto">Quitar ubicación</button><button type="button" class="btn btn-ghost" onclick="cerrarModal(\'dep-modal\')">Cancelar</button><button type="button" class="btn btn-primary" id="dep-guardar">Guardar</button></div></div></div>';while(wrap.firstChild)document.body.appendChild(wrap.firstChild);
  document.getElementById("dep-limpiar").onclick=function(){document.getElementById("dep-pasillo").value="";document.getElementById("dep-estante").value="";document.getElementById("dep-orden").value="";};
  document.getElementById("dep-guardar").onclick=window._depGuardar;
  var original=window.renderStock;if(typeof original==="function"&&!original.__depositoV1){var wrapped=function(){var r=original.apply(this,arguments);if(_dep.vista==="deposito")dRender();return r;};wrapped.__depositoV1=true;window.renderStock=wrapped;}
}

window._depSetVista=function(vista){
  dInject();_dep.vista=vista==="deposito"?"deposito":"inventario";
  var inv=document.getElementById("stk-inventario-pane"),dep=document.getElementById("stk-deposito-pane");if(inv)inv.style.display=_dep.vista==="inventario"?"":"none";if(dep)dep.style.display=_dep.vista==="deposito"?"block":"none";
  document.querySelectorAll("[data-dep-vista]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-dep-vista")===_dep.vista);});
  if(_dep.vista==="deposito"){dRender();dCargarProductos(false);}else if(typeof window.renderStock==="function")window.renderStock();
};
window._depSetFiltro=function(f){_dep.filtro=f||"todos";dRender();};
window._depEditar=async function(token){
  var f=dBuscarFila(token);if(!f)return;var id=await dResolverId(f);if(!id){if(window.showNotif)window.showNotif("No pude identificar el producto en el catálogo.","err");return;}f=dBuscarFila(id)||f;f.sbId=id;_dep.seleccionado=f;dSugerencias();
  document.getElementById("dep-modal-sub").textContent=(f.nombre||"")+" · "+f.codigo+" · stock "+f.cantidad;
  document.getElementById("dep-pasillo").value=f.pasillo||"";document.getElementById("dep-estante").value=f.estante||"";document.getElementById("dep-orden").value=f.orden==null?"":f.orden;
  if(typeof window.abrirModal==="function")window.abrirModal("dep-modal");else document.getElementById("dep-modal").classList.add("open");setTimeout(function(){document.getElementById("dep-pasillo").focus();},60);
};
window._depGuardar=async function(){
  var f=_dep.seleccionado;if(!f||!f.sbId)return;var btn=document.getElementById("dep-guardar"),pasillo=dNorm(document.getElementById("dep-pasillo").value),estante=dNorm(document.getElementById("dep-estante").value),raw=document.getElementById("dep-orden").value,orden=raw===""?null:Math.max(0,Math.min(99999,parseInt(raw,10)||0));
  if(btn){btn.disabled=true;btn.textContent="Guardando…";}
  try{
    if(typeof window._sbPatchProducto!=="function")throw new Error("No está disponible el guardado de productos");
    await window._sbPatchProducto(f.sbId,{ubicacionPasillo:pasillo,ubicacionEstante:estante,ubicacionOrden:orden});
    dActualizarLocal(f.sbId,f,pasillo,estante,orden);f.pasillo=pasillo;f.estante=estante;f.orden=orden;
    if(typeof window.cerrarModal==="function")window.cerrarModal("dep-modal");else document.getElementById("dep-modal").classList.remove("open");dRender();
    try{if(typeof window._auditar==="function")window._auditar("editar","producto",f.codigo,"Ubicación de depósito: "+(dLocLabel(f)));}catch(e){}
    if(window.showNotif)window.showNotif("📍 Ubicación actualizada. El stock no cambió.","ok");
  }catch(e){if(window.showNotif)window.showNotif("No se pudo guardar la ubicación: "+((e&&e.message)||e),"err");}
  finally{if(btn){btn.disabled=false;btn.textContent="Guardar";}}
};
window._depRefrescar=function(){return dCargarProductos(true);};

window.__depositoStockTest={normalizar:dNorm,claveUbicacion:dLocKey,etiquetaUbicacion:dLocLabel,filasDesde:dFilasDesde,estado:dEstado};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){dInject();});else dInject();
})();
