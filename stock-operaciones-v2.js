(function(){
"use strict";

window.STOCK_OPERACIONES_VERSION="2.0.0";

var S={
  panel:null,panelAt:0,panelPromise:null,
  modo:"ajuste",archivo:"",filas:[],errores:[],avisos:[],operacion:null,
  lotesFiltro:"todos",lotesBuscar:"",loteOperacion:null,loteFirma:"",instalado:false
};
var C={sector:"todos",valores:{},filtro:"todos",instalado:false};

function soEsc(v){
  if(typeof window.escHtml==="function")return window.escHtml(String(v==null?"":v));
  return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function soNorm(v){return String(v==null?"":v).trim().replace(/\s+/g," ");}
function soKey(v){return soNorm(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_+|_+$/g,"");}
function soInt(v){
  if(typeof v==="number")return Number.isInteger(v)&&v>=0?v:null;
  var s=soNorm(v).replace(/\s/g,"");if(!/^\d+$/.test(s))return null;
  var n=Number(s);return Number.isSafeInteger(n)&&n>=0?n:null;
}
function soUuid(){
  if(window.crypto&&typeof window.crypto.randomUUID==="function")return window.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,function(c){var r=Math.random()*16|0,v=c==="x"?r:(r&3|8);return v.toString(16);});
}
function soUsuario(){
  var u=window.currentUser||{};return soNorm(u.name||u.nombre||u.id||u.uid)||"sistema";
}
function soNotif(txt,tipo){if(typeof window.showNotif==="function")window.showNotif(txt,tipo||"info");else console.log(txt);}
function soOpen(id){if(typeof window.abrirModal==="function")window.abrirModal(id);else{var e=document.getElementById(id);if(e)e.classList.add("open");}}
function soClose(id){if(typeof window.cerrarModal==="function")window.cerrarModal(id);else{var e=document.getElementById(id);if(e)e.classList.remove("open");}}
function soRpc(nombre,body){
  if(!window._sbEmpId)return Promise.reject(new Error("No hay una empresa seleccionada"));
  if(typeof navigator!=="undefined"&&navigator.onLine===false)return Promise.reject(new Error("Necesitás conexión para modificar stock"));
  if(typeof window.sbFetch!=="function")return Promise.reject(new Error("No está disponible la conexión con Supabase"));
  return window.sbFetch("POST","/rest/v1/rpc/"+nombre,body).then(function(r){return Array.isArray(r)?r[0]:r;});
}
function soError(e){
  var s=String((e&&e.message)||e||"");
  var map=[
    [/STOCK_CAMBIO_CONCURRENTE/i,"El stock cambió desde otro dispositivo. Actualizá y revisá el archivo antes de reintentar."],
    [/CODIGOS_DUPLICADOS_EN_ARCHIVO/i,"El archivo repite uno o más códigos."],
    [/LOTES_DUPLICADOS_EN_ARCHIVO/i,"El archivo repite el mismo código, lote y vencimiento."],
    [/CODIGO_PRODUCTO_DUPLICADO/i,"Ese código está duplicado en Mis Productos. Corregilo antes de mover stock."],
    [/PRODUCTO_NO_EXISTE/i,"Hay un código que no existe en Mis Productos."],
    [/LOTE_CAMBIO_CONCURRENTE/i,"Ese lote cambió desde otro dispositivo. Ya recargamos la información."],
    [/LOTE_STOCK_INCONSISTENTE/i,"No se puede aislar ese lote porque el stock oficial es menor. Hacé primero un conteo físico."],
    [/SOLO_ADMIN/i,"Solamente un administrador o coadministrador puede hacer esta operación."],
    [/MOTIVO_CARGA_REQUERIDO/i,"Escribí el motivo de la carga."],
    [/Failed to fetch|NetworkError|Load failed/i,"No hubo respuesta del servidor. Conservamos la operación para poder reintentar sin duplicarla."]
  ];
  for(var i=0;i<map.length;i++)if(map[i][0].test(s))return map[i][1];
  return s.replace(/^Error:\s*/,"").slice(0,260)||"No se pudo completar la operación";
}
function soPanelLocal(){
  var out=[],vistos={};
  function add(p,id){
    p=p||{};var cod=soNorm(p.codigo||p.id||id);if(!cod||vistos[cod.toUpperCase()])return;
    vistos[cod.toUpperCase()]=true;
    out.push({id:p._sbId||p.sbId||id||null,codigo:cod,nombre:p.nombre||p.n||cod,categoria:p.categoria||"",
      controlLotes:!!p.controlLotes,diasAlerta:+p.diasAlerta||30,stock:+((window.stockData||{})[cod]||0),
      loteDisponible:0,cuarentena:0,sinLote:+((window.stockData||{})[cod]||0),inconsistencia:0,codigoDuplicado:false,sugeridoLotes:/aliment|golos|farmac|perfumer|medic|bebida|lact|fiambre|cosmet/i.test(p.categoria||"")});
  }
  if(window._prodData)Object.keys(window._prodData).forEach(function(k){add(window._prodData[k],k);});
  (window.dbStock||[]).forEach(function(p){add(p,p.id);});
  return {ok:true,productos:out,lotes:[],hoy:new Date().toISOString().slice(0,10),local:true};
}
async function soLoadPanel(force){
  if(S.panelPromise)return S.panelPromise;
  if(!force&&S.panel&&Date.now()-S.panelAt<30000)return S.panel;
  S.panelPromise=(async function(){
    try{
      var r=await soRpc("stock_deposito_panel",{p_empresa:window._sbEmpId,p_codigo:null});
      if(!r||r.ok===false)throw new Error("No se pudo leer lotes y vencimientos");
      S.panel=r;S.panelAt=Date.now();return r;
    }finally{S.panelPromise=null;}
  })();
  return S.panelPromise;
}
function soProductos(){return (S.panel&&S.panel.productos)||soPanelLocal().productos;}
function soProducto(codigo){var k=soNorm(codigo).toUpperCase();return soProductos().find(function(p){return soNorm(p.codigo).toUpperCase()===k;})||null;}
function soDateISO(v){
  if(v==null||v==="")return "";
  if(Object.prototype.toString.call(v)==="[object Date]"&&!isNaN(v.getTime()))return v.toISOString().slice(0,10);
  if(typeof v==="number"&&window.XLSX&&XLSX.SSF){
    var d=XLSX.SSF.parse_date_code(v);if(d)return String(d.y).padStart(4,"0")+"-"+String(d.m).padStart(2,"0")+"-"+String(d.d).padStart(2,"0");
  }
  var s=soNorm(v),m;if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if(m)return m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0");
  return null;
}
function soDias(fecha){
  if(!fecha)return null;var a=new Date(fecha+"T12:00:00"),b=new Date();b.setHours(12,0,0,0);
  return Math.round((a-b)/86400000);
}

function soHojaBonita(ws,anchos){
  ws["!cols"]=anchos.map(function(w){return{wch:w};});
  if(ws["!ref"]){var r=XLSX.utils.decode_range(ws["!ref"]);ws["!autofilter"]={ref:XLSX.utils.encode_range({r:0,c:0},{r:r.e.r,c:r.e.c})};}
  ws["!freeze"]={xSplit:0,ySplit:1,topLeftCell:"A2",activePane:"bottomLeft",state:"frozen"};
  return ws;
}
window._exportarPlantillaStock=async function(){
  if(typeof XLSX==="undefined"){soNotif("La librería Excel todavía no cargó. Reintentá en unos segundos.","err");return;}
  soNotif("Preparando plantilla segura…","info");
  try{
    await soLoadPanel(true);
    var ps=soProductos().slice().sort(function(a,b){return String(a.nombre).localeCompare(String(b.nombre),"es");});
    var ajuste=[["CODIGO","PRODUCTO","CATEGORIA","STOCK_ACTUAL","STOCK_NUEVO","MOTIVO_FILA"]];
    var lotes=[["CODIGO","PRODUCTO","CATEGORIA","CONTROL_LOTES","CANTIDAD_INGRESO","LOTE","VENCIMIENTO","MOTIVO_FILA"]];
    ps.forEach(function(p){
      ajuste.push([p.codigo,p.nombre,p.categoria||"",+p.stock||0,"",""]);
      lotes.push([p.codigo,p.nombre,p.categoria||"",p.controlLotes?"SI":(p.sugeridoLotes?"SUGERIDO":"NO"),"","","",""]);
    });
    var info=[
      ["PLANTILLA SEGURA DE STOCK · DISTRIBIX"],
      ["No cambies CODIGO ni STOCK_ACTUAL. Completá únicamente las celdas vacías."],
      ["AJUSTE STOCK: escribí STOCK_NUEVO sólo para los productos que contaste."],
      ["INGRESO LOTES: cada fila suma mercadería; CANTIDAD_INGRESO debe ser un entero positivo."],
      ["VENCIMIENTO usa AAAA-MM-DD. Puede quedar vacío si el producto no vence."],
      ["El importador valida el archivo completo y recién después pide confirmación."],
      ["Si una sola fila tiene error, no se modifica ningún producto."]
    ];
    var wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,soHojaBonita(XLSX.utils.aoa_to_sheet(ajuste),[15,42,23,14,14,28]),"AJUSTE STOCK");
    XLSX.utils.book_append_sheet(wb,soHojaBonita(XLSX.utils.aoa_to_sheet(lotes),[15,42,23,16,18,18,16,28]),"INGRESO LOTES");
    var wi=XLSX.utils.aoa_to_sheet(info);wi["!cols"]=[{wch:105}];XLSX.utils.book_append_sheet(wb,wi,"LEEME");
    XLSX.writeFile(wb,"Stock_y_lotes_DISTRIBIX_"+new Date().toISOString().slice(0,10)+".xlsx");
    soNotif("Plantilla descargada: "+ps.length+" productos","ok");
  }catch(e){soNotif(soError(e),"err");}
};

function soBulkMode(modo){
  S.modo=modo==="ingreso_lotes"?"ingreso_lotes":"ajuste";S.filas=[];S.errores=[];S.avisos=[];S.archivo="";S.operacion=null;
  document.querySelectorAll("[data-som-modo]").forEach(function(b){b.classList.toggle("on",b.getAttribute("data-som-modo")===S.modo);});
  var hint=document.getElementById("som-hint"),lab=document.getElementById("som-upload-label"),inp=document.getElementById("carga-stock-input");
  if(hint)hint.innerHTML=S.modo==="ajuste"
    ?"<b>Ajuste por conteo.</b> Completá STOCK_NUEVO. Las celdas vacías no se tocan."
    :"<b>Ingreso por lotes.</b> Cada fila suma mercadería y registra lote y vencimiento.";
  if(lab)lab.innerHTML=(S.modo==="ajuste"?"📤 Elegir archivo de ajuste":"📤 Elegir archivo de lotes")+'<input type="file" id="carga-stock-input" accept=".xlsx,.xls,.csv,text/csv" onchange="_importarStockXLSX(event)" style="display:none">';
  var r=document.getElementById("carga-stock-result");if(r){r.style.display="none";r.innerHTML="";}
  var a=document.getElementById("som-apply");if(a)a.style.display="none";
}
window._somModo=soBulkMode;
window._abrirCargaStock=function(){
  soBulkMode("ajuste");var mot=document.getElementById("som-motivo");if(mot)mot.value="";
  soOpen("modal-carga-stock");soLoadPanel(false).catch(function(e){soNotif(soError(e),"err");});
};
function soHeaderIndex(header,nombres){
  for(var i=0;i<nombres.length;i++){var x=header.indexOf(nombres[i]);if(x>=0)return x;}return -1;
}
function soReadWorkbook(file){
  return file.arrayBuffer().then(function(buf){return XLSX.read(buf,{type:"array",cellDates:true,raw:true});});
}
function soBuildPreview(){
  var host=document.getElementById("carga-stock-result"),apply=document.getElementById("som-apply");if(!host)return;
  host.style.display="block";
  var entradas=S.filas.reduce(function(n,x){return n+Math.max(0,(x.nuevo==null?x.cantidad:x.nuevo-x.esperado));},0);
  var salidas=S.filas.reduce(function(n,x){return n+Math.max(0,(x.nuevo==null?0:x.esperado-x.nuevo));},0);
  var head='<div class="som-resumen"><span><b>'+S.filas.length+'</b> filas válidas</span><span class="'+(S.errores.length?"bad":"ok")+'"><b>'+S.errores.length+'</b> errores</span><span><b>+'+entradas+'</b> entran</span>'+(S.modo==="ajuste"?'<span><b>−'+salidas+'</b> salen</span>':'')+'</div>';
  var issues="";
  if(S.errores.length)issues='<div class="som-issues bad"><b>Corregí el archivo antes de continuar</b>'+S.errores.slice(0,30).map(function(x){return"<div>• "+soEsc(x)+"</div>";}).join("")+(S.errores.length>30?"<div>… y "+(S.errores.length-30)+" errores más</div>":"")+"</div>";
  if(S.avisos.length)issues+='<div class="som-issues warn"><b>Revisá estos avisos</b>'+S.avisos.slice(0,20).map(function(x){return"<div>• "+soEsc(x)+"</div>";}).join("")+"</div>";
  var rows=S.filas.slice(0,120).map(function(x){
    return '<tr><td>'+soEsc(x.codigo)+'</td><td>'+soEsc(x.nombre)+'</td>'+(S.modo==="ajuste"
      ?'<td class="num">'+x.esperado+'</td><td class="num">'+x.nuevo+'</td><td class="num '+(x.nuevo>x.esperado?"up":"down")+'">'+(x.nuevo>x.esperado?"+":"")+(x.nuevo-x.esperado)+'</td>'
      :'<td class="num">+'+x.cantidad+'</td><td>'+soEsc(x.lote)+'</td><td>'+soEsc(x.vencimiento||"Sin fecha")+'</td>')+'</tr>';
  }).join("");
  var cols=S.modo==="ajuste"?"<th>Código</th><th>Producto</th><th>Antes</th><th>Después</th><th>Δ</th>":"<th>Código</th><th>Producto</th><th>Cant.</th><th>Lote</th><th>Vence</th>";
  host.innerHTML=head+issues+(S.filas.length?'<div class="som-table-wrap"><table><thead><tr>'+cols+'</tr></thead><tbody>'+rows+'</tbody></table>'+(S.filas.length>120?'<small>Vista previa de 120 filas; se validaron todas.</small>':'')+'</div>':'<div class="som-empty">No hay filas con cantidades para aplicar.</div>');
  if(apply){apply.style.display=(S.filas.length&&!S.errores.length)?"block":"none";apply.disabled=!!S.errores.length;}
}
window._importarStockXLSX=async function(ev){
  var file=ev.target.files&&ev.target.files[0];if(!file)return;
  if(typeof XLSX==="undefined"){soNotif("La librería Excel no está disponible","err");return;}
  var host=document.getElementById("carga-stock-result");if(host){host.style.display="block";host.innerHTML='<div class="som-loading">Validando todas las filas…</div>';}
  S.archivo=file.name;S.filas=[];S.errores=[];S.avisos=[];S.operacion=null;
  try{
    await soLoadPanel(true);
    var wb=await soReadWorkbook(file),wanted=S.modo==="ajuste"?"AJUSTE_STOCK":"INGRESO_LOTES";
    var sheetName=wb.SheetNames.find(function(n){return soKey(n)===wanted;})||wb.SheetNames[0];
    var rows=XLSX.utils.sheet_to_json(wb.Sheets[sheetName],{header:1,defval:"",raw:true,blankrows:false});
    if(!rows.length)throw new Error("El archivo está vacío");
    var header=rows[0].map(soKey),iCod=soHeaderIndex(header,["CODIGO","SKU"]),iNuevo=soHeaderIndex(header,["STOCK_NUEVO","NUEVO","STOCK"]),iActual=soHeaderIndex(header,["STOCK_ACTUAL","ACTUAL","ESPERADO"]);
    var iCant=soHeaderIndex(header,["CANTIDAD_INGRESO","CANTIDAD","INGRESO"]),iLote=soHeaderIndex(header,["LOTE","NUMERO_LOTE"]),iVence=soHeaderIndex(header,["VENCIMIENTO","FECHA_VENCIMIENTO","VENCE"]);
    if(iCod<0)throw new Error("Falta la columna CODIGO");
    if(S.modo==="ajuste"&&iNuevo<0)throw new Error("Falta la columna STOCK_NUEVO");
    if(S.modo==="ingreso_lotes"&&(iCant<0||iLote<0))throw new Error("Faltan CANTIDAD_INGRESO y LOTE");
    var usados={};
    for(var r=1;r<rows.length;r++){
      var line=rows[r]||[],cod=soNorm(line[iCod]);if(!cod)continue;
      var valor=S.modo==="ajuste"?line[iNuevo]:line[iCant];if(valor===""||valor==null)continue;
      var p=soProducto(cod),n=soInt(valor);
      if(!p){S.errores.push("Fila "+(r+1)+": el código «"+cod+"» no existe.");continue;}
      if(p.codigoDuplicado){S.errores.push("Fila "+(r+1)+": «"+cod+"» está duplicado en Mis Productos.");continue;}
      if(n==null){S.errores.push("Fila "+(r+1)+": la cantidad de «"+cod+"» debe ser un entero no negativo.");continue;}
      if(S.modo==="ajuste"){
        var esperado=iActual>=0&&line[iActual]!==""?soInt(line[iActual]):+p.stock;
        if(esperado==null){S.errores.push("Fila "+(r+1)+": STOCK_ACTUAL inválido.");continue;}
        var dk=String(p.codigo).toUpperCase();
        if(usados[dk]){S.errores.push("Fila "+(r+1)+": el código «"+p.codigo+"» aparece más de una vez.");continue;}usados[dk]=1;
        if(esperado!==+p.stock){S.errores.push("Fila "+(r+1)+": «"+p.codigo+"» ahora tiene "+p.stock+", pero el archivo esperaba "+esperado+".");continue;}
        if(n!==esperado)S.filas.push({codigo:p.codigo,nombre:p.nombre,esperado:esperado,nuevo:n});
      }else{
        if(n<=0){S.errores.push("Fila "+(r+1)+": el ingreso de «"+cod+"» debe ser mayor que cero.");continue;}
        var lote=soNorm(line[iLote]),vence=iVence>=0?soDateISO(line[iVence]):"";
        if(!lote){S.errores.push("Fila "+(r+1)+": falta el lote de «"+cod+"».");continue;}
        if(vence===null){S.errores.push("Fila "+(r+1)+": el vencimiento de «"+cod+"» no tiene una fecha válida.");continue;}
        var lk=[String(p.codigo).toUpperCase(),lote.toUpperCase(),vence||""].join("|");
        if(usados[lk]){S.errores.push("Fila "+(r+1)+": ese mismo código, lote y vencimiento está repetido.");continue;}usados[lk]=1;
        if(!vence&&p.sugeridoLotes)S.avisos.push("«"+p.nombre+"» parece ser sensible a vencimiento, pero el lote quedó sin fecha.");
        S.filas.push({codigo:p.codigo,nombre:p.nombre,cantidad:n,lote:lote,vencimiento:vence||null});
      }
    }
    soBuildPreview();
  }catch(e){S.errores=[soError(e)];soBuildPreview();}
  ev.target.value="";
};
window._somAplicar=async function(){
  if(!S.filas.length||S.errores.length)return;
  var motivo=soNorm((document.getElementById("som-motivo")||{}).value);
  if(motivo.length<3){soNotif("Escribí por qué se hace esta carga","err");return;}
  var entrada=S.filas.reduce(function(n,x){return n+Math.max(0,x.nuevo==null?x.cantidad:x.nuevo-x.esperado);},0);
  var salida=S.filas.reduce(function(n,x){return n+Math.max(0,x.nuevo==null?0:x.esperado-x.nuevo);},0);
  var ok=typeof window._confirmar==="function"?await window._confirmar({
    icono:S.modo==="ajuste"?"📦":"🧪",titulo:S.modo==="ajuste"?"Confirmar carga masiva":"Confirmar ingreso por lotes",
    mensaje:S.filas.length+" filas validadas.\nEntran: "+entrada+" unidades"+(S.modo==="ajuste"?"\nSalen: "+salida+" unidades":"")+"\n\nMotivo: "+motivo+"\n\nSe aplicará todo junto. Si una fila falla, no se cambia ninguna.",
    ok:"Sí, aplicar todo",cancelar:"Volver a revisar",peligro:S.modo==="ajuste"&&salida>0,persistente:true
  }):confirm("¿Aplicar la carga completa?");
  if(!ok)return;
  var btn=document.getElementById("som-apply");if(btn){btn.disabled=true;btn.textContent="Validando y guardando…";}
  if(!S.operacion)S.operacion=soUuid();
  try{
    var items=S.filas.map(function(x){return S.modo==="ajuste"?{codigo:x.codigo,esperado:x.esperado,nuevo:x.nuevo}:{codigo:x.codigo,cantidad:x.cantidad,lote:x.lote,vencimiento:x.vencimiento};});
    var res=await soRpc("stock_carga_masiva_atomica",{p_empresa:window._sbEmpId,p_operacion:S.operacion,p_modo:S.modo,p_items:items,p_usuario:soUsuario(),p_motivo:motivo});
    if(!res||res.ok===false)throw new Error((res&&res.codigo)||"No se pudo aplicar");
    S.panel=null;S.panelAt=0;
    try{if(typeof window._stkRefrescar==="function")await window._stkRefrescar();}catch(_e){}
    try{if(typeof window.renderStock==="function")window.renderStock();}catch(_e){}
    soClose("modal-carga-stock");soNotif("✅ Operación completa: "+res.cambiados+" fila"+(res.cambiados!==1?"s":"")+" aplicada"+(res.cambiados!==1?"s":""),"ok");
    if(document.getElementById("dep-lotes-pane")&&document.getElementById("dep-lotes-pane").style.display!=="none")soRenderLotes(true);
  }catch(e){soNotif(soError(e),"err");soLoadPanel(true).catch(function(){});}
  finally{if(btn){btn.disabled=false;btn.textContent="✓ Aplicar operación completa";}}
};

function soFechaEstado(l,p){
  if(!l.vencimiento)return{key:"sin-fecha",txt:"Sin vencimiento",dias:null};
  var d=soDias(l.vencimiento),alerta=+(p&&p.diasAlerta||30);
  if(d<0)return{key:"vencido",txt:"Venció hace "+Math.abs(d)+" d.",dias:d};
  if(d===0)return{key:"vencido",txt:"Vence hoy",dias:d};
  if(d<=alerta)return{key:"pronto",txt:"Vence en "+d+" d.",dias:d};
  return{key:"ok",txt:"Vence "+l.vencimiento,dias:d};
}
async function soRenderLotes(force){
  var pane=document.getElementById("dep-lotes-pane");if(!pane||pane.style.display==="none")return;
  var body=document.getElementById("som-lotes-body");if(body)body.innerHTML='<div class="som-loading">Sincronizando lotes…</div>';
  try{await soLoadPanel(!!force);}catch(e){if(body)body.innerHTML='<div class="som-issues bad">'+soEsc(soError(e))+"</div>";return;}
  var ps=soProductos(),lots=(S.panel.lotes||[]),q=soNorm(S.lotesBuscar).toLocaleLowerCase("es"),by={};
  lots.forEach(function(l){(by[String(l.codigo).toUpperCase()]||(by[String(l.codigo).toUpperCase()]=[])).push(l);});
  var stats={vencidos:0,pronto:0,cuarentena:0,sinLote:0};
  lots.forEach(function(l){var p=soProducto(l.codigo),e=soFechaEstado(l,p);if(l.estado==="cuarentena")stats.cuarentena+=l.cantidad;else if(e.key==="vencido")stats.vencidos+=l.cantidad;else if(e.key==="pronto")stats.pronto+=l.cantidad;});
  ps.forEach(function(p){stats.sinLote+=Math.max(0,+p.sinLote||0);});
  var k=document.getElementById("som-lotes-kpis");if(k)k.innerHTML=[
    ["todos",lots.reduce(function(n,l){return n+l.cantidad;},0),"Con lote"],
    ["vencido",stats.vencidos,"Vencidas"],
    ["pronto",stats.pronto,"Por vencer"],
    ["cuarentena",stats.cuarentena,"Cuarentena"],
    ["sin-lote",stats.sinLote,"Sin lote"]
  ].map(function(x){return'<button data-som-lf="'+x[0]+'" class="'+(S.lotesFiltro===x[0]?"on":"")+'"><b>'+x[1]+'</b><span>'+x[2]+'</span></button>';}).join("");
  if(k)k.querySelectorAll("[data-som-lf]").forEach(function(b){b.onclick=function(){S.lotesFiltro=this.getAttribute("data-som-lf");soRenderLotes(false);};});
  var show=ps.filter(function(p){
    var text=[p.codigo,p.nombre,p.categoria].join(" ").toLocaleLowerCase("es");if(q&&text.indexOf(q)<0)return false;
    var ls=by[String(p.codigo).toUpperCase()]||[];
    if(S.lotesFiltro==="sin-lote")return +p.sinLote>0;
    if(S.lotesFiltro==="cuarentena")return ls.some(function(l){return l.estado==="cuarentena";});
    if(S.lotesFiltro==="vencido"||S.lotesFiltro==="pronto")return ls.some(function(l){return l.estado==="disponible"&&soFechaEstado(l,p).key===S.lotesFiltro;});
    return p.controlLotes||p.sugeridoLotes||ls.length||+p.sinLote>0;
  }).sort(function(a,b){return (+b.inconsistencia)-(+a.inconsistencia)||String(a.nombre).localeCompare(String(b.nombre),"es");});
  if(!show.length){body.innerHTML='<div class="som-empty">No hay productos para este filtro.</div>';return;}
  body.innerHTML=show.slice(0,300).map(function(p){
    var ls=by[String(p.codigo).toUpperCase()]||[];
    var rows=ls.map(function(l){var e=soFechaEstado(l,p),dest=l.estado==="disponible"?"cuarentena":"disponible";return'<div class="som-lote-row '+l.estado+'"><div><b>Lote '+soEsc(l.lote)+'</b><span>'+soEsc(e.txt)+(l.estado==="cuarentena"?" · En cuarentena":"")+'</span></div><strong>'+l.cantidad+' u.</strong><button data-som-lote="'+l.id+'" data-som-dest="'+dest+'" title="'+(dest==="cuarentena"?"Enviar a cuarentena":"Liberar al stock")+'">'+(dest==="cuarentena"?"🛑 Aislar":"✅ Liberar")+'</button></div>';}).join("");
    if(!rows)rows='<div class="som-lote-empty">Todavía no hay lotes identificados.</div>';
    return'<section class="som-producto '+(+p.inconsistencia>0?"inconsistente":"")+'"><header><div><b>'+soEsc(p.nombre)+'</b><span>'+soEsc(p.codigo)+(p.categoria?" · "+soEsc(p.categoria):"")+'</span></div><button data-som-new="'+soEsc(p.codigo)+'">＋ Lote</button><button data-som-cfg="'+soEsc(p.codigo)+'">⚙️</button></header><div class="som-prod-meta"><span>Stock <b>'+p.stock+'</b></span><span>Con lote <b>'+p.loteDisponible+'</b></span><span class="'+(+p.sinLote>0?"warn":"")+'">Sin lote <b>'+p.sinLote+'</b></span><span>Cuarentena <b>'+p.cuarentena+'</b></span>'+(p.sugeridoLotes?'<i>Control sugerido</i>':'')+(p.controlLotes?'<i class="on">Control activo</i>':'')+'</div>'+(+p.inconsistencia>0?'<div class="som-inconsistencia">⚠️ Los lotes disponibles superan al stock por '+p.inconsistencia+' u. Hacé un conteo antes de aislarlos.</div>':"")+rows+"</section>";
  }).join("");
  body.querySelectorAll("[data-som-new]").forEach(function(b){b.onclick=function(){window._somAbrirLote(this.getAttribute("data-som-new"));};});
  body.querySelectorAll("[data-som-cfg]").forEach(function(b){b.onclick=function(){window._somAbrirConfig(this.getAttribute("data-som-cfg"));};});
  body.querySelectorAll("[data-som-lote]").forEach(function(b){b.onclick=function(){window._somCambiarEstado(this.getAttribute("data-som-lote"),this.getAttribute("data-som-dest"));};});
}
window._somLotesBuscar=function(v){S.lotesBuscar=v;soRenderLotes(false);};
window._somAbrirLote=function(codigo){
  var p=soProducto(codigo),sel=document.getElementById("som-lote-codigo");if(sel){sel.innerHTML=soProductos().map(function(x){return'<option value="'+soEsc(x.codigo)+'">'+soEsc(x.codigo+" · "+x.nombre)+'</option>';}).join("");sel.value=p?p.codigo:codigo||"";}
  ["som-lote-nro","som-lote-vence","som-lote-motivo"].forEach(function(id){var e=document.getElementById(id);if(e)e.value="";});
  var q=document.getElementById("som-lote-cant");if(q)q.value="";S.loteOperacion=null;S.loteFirma="";soOpen("som-lote-modal");
};
window._somGuardarLote=async function(){
  var cod=soNorm((document.getElementById("som-lote-codigo")||{}).value),lote=soNorm((document.getElementById("som-lote-nro")||{}).value),vence=soDateISO((document.getElementById("som-lote-vence")||{}).value),cant=soInt((document.getElementById("som-lote-cant")||{}).value),mot=soNorm((document.getElementById("som-lote-motivo")||{}).value);
  if(!cod||!lote||cant==null||cant<=0){soNotif("Completá producto, cantidad y lote","err");return;}
  if(vence===null){soNotif("La fecha de vencimiento no es válida","err");return;}
  if(mot.length<3)mot="Ingreso de mercadería por lote";
  var p=soProducto(cod),ok=await window._confirmar({icono:"🧪",titulo:"Confirmar ingreso de lote",mensaje:(p?p.nombre:cod)+"\nLote: "+lote+"\nVencimiento: "+(vence||"sin fecha")+"\nCantidad: +"+cant+" u.\n\nEl stock pasará de "+(+p.stock||0)+" a "+((+p.stock||0)+cant)+".",ok:"Ingresar "+cant+" u.",cancelar:"Revisar",persistente:true});
  if(!ok)return;var btn=document.getElementById("som-lote-save");if(btn){btn.disabled=true;btn.textContent="Guardando…";}
  var firma=JSON.stringify([cod,lote,vence||null,cant,mot]);if(S.loteFirma!==firma){S.loteFirma=firma;S.loteOperacion=soUuid();}
  try{await soRpc("stock_lote_registrar_ingreso",{p_empresa:window._sbEmpId,p_operacion:S.loteOperacion,p_codigo:cod,p_lote:lote,p_vencimiento:vence||null,p_cantidad:cant,p_usuario:soUsuario(),p_motivo:mot});S.panel=null;S.loteOperacion=null;S.loteFirma="";soClose("som-lote-modal");try{await window._stkRefrescar();}catch(_e){}await soRenderLotes(true);soNotif("Lote ingresado y stock actualizado","ok");}
  catch(e){soNotif(soError(e),"err");}finally{if(btn){btn.disabled=false;btn.textContent="Confirmar ingreso";}}
};
window._somAbrirConfig=function(codigo){
  var p=soProducto(codigo);if(!p)return;document.getElementById("som-cfg-codigo").value=p.codigo;document.getElementById("som-cfg-nombre").textContent=p.nombre;document.getElementById("som-cfg-control").checked=!!p.controlLotes;document.getElementById("som-cfg-dias").value=+p.diasAlerta||30;soOpen("som-cfg-modal");
};
window._somGuardarConfig=async function(){
  var cod=document.getElementById("som-cfg-codigo").value,on=document.getElementById("som-cfg-control").checked,dias=soInt(document.getElementById("som-cfg-dias").value);
  if(dias==null||dias<1||dias>3650){soNotif("Los días de alerta deben estar entre 1 y 3650","err");return;}
  var p=soProducto(cod),lots=(S.panel.lotes||[]).filter(function(l){return String(l.codigo).toUpperCase()===String(cod).toUpperCase();});
  if(p.controlLotes&&!on&&lots.length){var ok=await window._confirmar({icono:"⚠️",titulo:"Desactivar control de lotes",mensaje:"Los lotes existentes no se borrarán. Solamente dejará de sugerirse la carga por lote para este producto.",ok:"Desactivar",cancelar:"Cancelar",persistente:true});if(!ok)return;}
  try{await soRpc("stock_lote_configurar_producto",{p_empresa:window._sbEmpId,p_codigo:cod,p_control:on,p_dias_alerta:dias});S.panel=null;soClose("som-cfg-modal");await soRenderLotes(true);soNotif("Configuración de lotes guardada","ok");}catch(e){soNotif(soError(e),"err");}
};
window._somCambiarEstado=async function(id,dest){
  var l=(S.panel.lotes||[]).find(function(x){return String(x.id)===String(id);});if(!l)return;
  var p=soProducto(l.codigo),aislar=dest==="cuarentena",mot=aislar?"Lote aislado por rotura, devolución o revisión":"Lote liberado de cuarentena";
  var ok=await window._confirmar({icono:aislar?"🛑":"✅",titulo:aislar?"Enviar lote a cuarentena":"Liberar lote al stock",mensaje:(p?p.nombre:l.codigo)+"\nLote: "+l.lote+"\nCantidad: "+l.cantidad+" u.\n\n"+(aislar?"Estas unidades dejarán de estar disponibles para vender.":"Estas unidades volverán al stock disponible."),ok:aislar?"Aislar lote completo":"Liberar lote completo",cancelar:"Cancelar",peligro:aislar,persistente:true});
  if(!ok)return;
  try{await soRpc("stock_lote_cambiar_estado",{p_empresa:window._sbEmpId,p_operacion:soUuid(),p_lote_id:l.id,p_destino:dest,p_cantidad:l.cantidad,p_esperado:l.cantidad,p_usuario:soUsuario(),p_motivo:mot});S.panel=null;try{await window._stkRefrescar();}catch(_e){}await soRenderLotes(true);soNotif(aislar?"Lote aislado y descontado del disponible":"Lote liberado al stock","ok");}catch(e){soNotif(soError(e),"err");await soRenderLotes(true);}
};

function soCatalogoConteo(){
  var out=[],seen={};
  function add(p,id){
    p=p||{};var cod=soNorm(p.codigo||p.id||id);if(!cod||seen[cod.toUpperCase()])return;seen[cod.toUpperCase()]=1;
    var key=typeof window._stkClaveStock==="function"?window._stkClaveStock(cod):cod;if(key==null)key=cod;
    out.push({codigo:cod,nombre:p.nombre||p.n||cod,pasillo:soNorm(p.ubicacionPasillo||p.ubicacion_pasillo),estante:soNorm(p.ubicacionEstante||p.ubicacion_estante),actual:+((window.stockData||{})[key]||0),activo:p.activo!==false});
  }
  if(window._prodData)Object.keys(window._prodData).forEach(function(k){add(window._prodData[k],k);});
  (window.dbStock||[]).forEach(function(p){add(p,p.id);});
  return out.filter(function(p){return p.activo;});
}
function soLocKey(p,e){return soNorm(p).toLocaleLowerCase("es")+"\u0001"+soNorm(e).toLocaleLowerCase("es");}
function soAreas(){
  var mapa=window.DepositoMapa&&window.DepositoMapa.obtener?window.DepositoMapa.obtener():null;
  return (mapa&&mapa.elementos||[]).filter(function(e){return["estanteria","rack","pallet","frio"].indexOf(e.tipo)>=0&&soLocKey(e.pasillo,e.estante)!=="\u0001";});
}
function soDraftKey(){return"distribix_conteo_v2:"+String(window._sbEmpId||"")+":"+C.sector;}
function soDraftSave(){try{localStorage.setItem(soDraftKey(),JSON.stringify({ts:Date.now(),valores:C.valores}));}catch(e){}}
function soDraftLoad(){try{var d=JSON.parse(localStorage.getItem(soDraftKey())||"null");C.valores=d&&d.valores&&typeof d.valores==="object"?d.valores:{};}catch(e){C.valores={};}window._invContado=C.valores;}
function soSectorNombre(){
  if(C.sector==="todos")return"Todo el depósito";var a=soAreas().find(function(x){return x.id===C.sector;});return a?a.nombre:"Sector";
}
function soFilasConteo(){
  var arr=soCatalogoConteo();if(C.sector!=="todos"){var a=soAreas().find(function(x){return x.id===C.sector;});if(a){var k=soLocKey(a.pasillo,a.estante);arr=arr.filter(function(p){return soLocKey(p.pasillo,p.estante)===k;});}else arr=[];}return arr;
}
function soInstallCount(){
  if(C.instalado)return;var search=document.getElementById("inv-buscar");if(!search)return;C.instalado=true;
  var block=document.createElement("div");block.id="som-conteo-sector";block.innerHTML='<label>Sector del conteo</label><select id="som-conteo-select"></select><small>El borrador queda guardado en este dispositivo hasta que confirmes.</small>';
  search.parentNode.insertBefore(block,search);
}
function soPopulateSectors(){
  soInstallCount();var sel=document.getElementById("som-conteo-select");if(!sel)return;var areas=soAreas();
  sel.innerHTML='<option value="todos">Todo el depósito</option>'+areas.map(function(a){return'<option value="'+soEsc(a.id)+'">'+soEsc(a.nombre+(a.pasillo||a.estante?" · "+[a.pasillo,a.estante].filter(Boolean).join(" / "):""))+'</option>';}).join("");
  if(!areas.some(function(a){return a.id===C.sector;}))C.sector="todos";sel.value=C.sector;
  sel.onchange=function(){soDraftSave();C.sector=this.value;soDraftLoad();window._invRender();};
}
window._invAbrir=async function(){
  C.sector="todos";C.filtro="todos";
  try{if(window.DepositoMapa&&window.DepositoMapa.cargar)await window.DepositoMapa.cargar(false);}catch(e){}
  soPopulateSectors();soDraftLoad();var b=document.getElementById("inv-buscar");if(b)b.value="";
  window._invRender();soOpen("inv-modal");
};
window._invFiltro=function(f){C.filtro=f||"todos";document.querySelectorAll('[id^="inv-f-"]').forEach(function(b){b.classList.toggle("active",b.id==="inv-f-"+C.filtro);});window._invRender();};
window._invSet=function(id,val){if(val===""||val==null)delete C.valores[id];else{var n=soInt(val);if(n!=null)C.valores[id]=n;}window._invContado=C.valores;soDraftSave();window._invRender();};
window._invRender=function(){
  var host=document.getElementById("inv-lista");if(!host)return;var q=soNorm((document.getElementById("inv-buscar")||{}).value).toLocaleLowerCase("es");
  var base=soFilasConteo(),arr=base.filter(function(p){var c=C.valores[p.codigo],has=c!==undefined&&c!=="";if(q&&[p.codigo,p.nombre,p.pasillo,p.estante].join(" ").toLocaleLowerCase("es").indexOf(q)<0)return false;if(C.filtro==="contados")return has;if(C.filtro==="dif")return has&&+c!==p.actual;return true;});
  var counted=base.filter(function(p){return C.valores[p.codigo]!==undefined;});var dif=counted.filter(function(p){return+C.valores[p.codigo]!==p.actual;});
  var res=document.getElementById("inv-resumen");if(res)res.innerHTML='<div class="som-count-kpi"><b>'+base.length+'</b><span>DEL SECTOR</span></div><div class="som-count-kpi"><b>'+counted.length+'</b><span>CONTADOS</span></div><div class="som-count-kpi warn"><b>'+dif.length+'</b><span>DIFERENCIAS</span></div>';
  if(!arr.length){host.innerHTML='<div class="som-empty">'+(C.filtro==="dif"?"Todo lo contado coincide.":"No hay productos en este sector o filtro.")+'</div>';return;}
  host.innerHTML=arr.slice(0,300).map(function(p){var v=C.valores[p.codigo],has=v!==undefined,d=has?v-p.actual:0,token=encodeURIComponent(p.codigo);return'<div class="som-count-row"><div><b>'+soEsc(p.nombre)+'</b><span>'+soEsc(p.codigo)+(p.pasillo||p.estante?" · 📍 "+soEsc([p.pasillo,p.estante].filter(Boolean).join(" / ")):"")+' · sistema <strong>'+p.actual+'</strong></span></div>'+(has?'<em class="'+(d===0?"ok":d>0?"up":"down")+'">'+(d===0?"✓":(d>0?"+":"")+d)+'</em>':"")+'<input type="number" min="0" step="1" value="'+(has?v:"")+'" placeholder="—" onchange="_invSet(decodeURIComponent(\''+token+'\'),this.value)"></div>';}).join("");
};
window._invAplicar=async function(){
  var rows=soFilasConteo().filter(function(p){return C.valores[p.codigo]!==undefined&&+C.valores[p.codigo]!==p.actual;}).map(function(p){return{codigo:p.codigo,nombre:p.nombre,esperado:p.actual,nuevo:+C.valores[p.codigo]};});
  if(!rows.length){soNotif("No hay diferencias para ajustar","err");return;}
  var ent=rows.reduce(function(n,x){return n+Math.max(0,x.nuevo-x.esperado);},0),sal=rows.reduce(function(n,x){return n+Math.max(0,x.esperado-x.nuevo);},0),sector=soSectorNombre();
  var ok=await window._confirmar({icono:"🔢",titulo:"Confirmar conteo de "+sector,mensaje:rows.length+" productos con diferencia.\nEntran: "+ent+" u.\nSalen: "+sal+" u.\n\nSe guardará todo junto como conteo cíclico. Si otro dispositivo cambió una cantidad, no se aplicará ninguna.",ok:"Aplicar conteo completo",cancelar:"Volver a revisar",peligro:sal>0,persistente:true});if(!ok)return;
  var btn=document.getElementById("inv-btn");if(btn){btn.disabled=true;btn.textContent="Aplicando todo o nada…";}
  try{var res=await soRpc("stock_carga_masiva_atomica",{p_empresa:window._sbEmpId,p_operacion:soUuid(),p_modo:"conteo",p_items:rows.map(function(x){return{codigo:x.codigo,esperado:x.esperado,nuevo:x.nuevo};}),p_usuario:soUsuario(),p_motivo:"Conteo cíclico · "+sector});if(!res||res.ok===false)throw new Error("No se pudo aplicar el conteo");try{localStorage.removeItem(soDraftKey());}catch(e){}C.valores={};window._invContado={};soClose("inv-modal");if(typeof window._stkRefrescar==="function")await window._stkRefrescar();if(typeof window.renderStock==="function")window.renderStock();S.panel=null;soNotif("Conteo aplicado completo: "+res.cambiados+" productos","ok");}
  catch(e){soNotif(soError(e)+" No se perdió tu conteo.","err");try{if(typeof window._stkRefrescar==="function")await window._stkRefrescar();}catch(_e){}}
  finally{if(btn){btn.disabled=false;btn.textContent="✓ Ajustar el stock a lo contado";}}
};

function soInject(){
  if(S.instalado)return;
  var modal=document.getElementById("modal-carga-stock"),dep=document.getElementById("stk-deposito-pane"),modes=document.getElementById("dep-modos");
  if(!modal||!dep||!modes){setTimeout(soInject,100);return;}S.instalado=true;
  var style=document.createElement("style");style.id="stock-operaciones-v2-style";style.textContent=
    '#modal-carga-stock .modal-box{max-width:760px!important}.som-mode{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px;background:var(--s2);border:1px solid var(--border);border-radius:10px}.som-mode button{border:0;border-radius:7px;padding:9px;background:transparent;color:var(--muted);font:800 12px inherit}.som-mode button.on{background:var(--s1);color:var(--accent);box-shadow:0 1px 4px rgba(0,0,0,.1)}#som-hint{margin:10px 0;padding:10px 12px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:9px;font-size:11.5px;line-height:1.45}.som-upload{display:block;border:2px dashed var(--border);border-radius:11px;padding:16px;text-align:center;font-weight:800;color:var(--accent);cursor:pointer}.som-field{display:block;margin-top:10px;font-size:10.5px;font-weight:800;color:var(--muted)}.som-field input{width:100%;box-sizing:border-box;margin-top:5px}.som-loading,.som-empty{padding:24px;text-align:center;color:var(--muted);font-size:12px}.som-resumen{display:flex;gap:6px;overflow:auto;margin-bottom:8px}.som-resumen span{flex:1;min-width:85px;padding:7px;text-align:center;border:1px solid var(--border);border-radius:8px;font-size:9px;color:var(--muted)}.som-resumen b{display:block;font-size:15px;color:var(--text)}.som-resumen .bad b{color:#dc2626}.som-resumen .ok b{color:#059669}.som-issues{padding:9px 11px;border-radius:8px;margin:7px 0;font-size:10.5px;line-height:1.45;max-height:150px;overflow:auto}.som-issues.bad{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.som-issues.warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e}.som-issues b{display:block;margin-bottom:4px}.som-table-wrap{border:1px solid var(--border);border-radius:9px;overflow:auto;max-height:280px}.som-table-wrap table{width:100%;border-collapse:collapse;font-size:10.5px}.som-table-wrap th{position:sticky;top:0;background:var(--s2);padding:7px;text-align:left}.som-table-wrap td{padding:6px 7px;border-top:1px solid var(--border)}.som-table-wrap .num{text-align:right}.som-table-wrap .up{color:#059669}.som-table-wrap .down{color:#dc2626}#dep-lotes-pane{display:none}.som-lotes-toolbar{display:flex;gap:7px;align-items:center;margin-bottom:8px}.som-lotes-toolbar input{flex:1;min-width:0}.som-lotes-toolbar button{border:0;border-radius:8px;background:var(--accent);color:#fff;padding:9px 11px;font:800 10.5px inherit}.som-lotes-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:9px}.som-lotes-kpis button{border:1px solid var(--border);border-radius:9px;background:var(--s1);padding:7px 3px;color:var(--text)}.som-lotes-kpis button.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.som-lotes-kpis b,.som-lotes-kpis span{display:block}.som-lotes-kpis b{font-size:14px}.som-lotes-kpis span{font-size:8px;color:var(--muted)}.som-producto{border:1px solid var(--border);border-radius:11px;background:var(--s1);margin:8px 0;overflow:hidden}.som-producto.inconsistente{border-color:#f59e0b}.som-producto>header{display:flex;align-items:center;gap:5px;padding:9px 10px;background:var(--s2)}.som-producto>header>div{flex:1;min-width:0}.som-producto>header b,.som-producto>header span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.som-producto>header b{font-size:11.5px}.som-producto>header span{font-size:8.5px;color:var(--muted)}.som-producto>header button,.som-lote-row button{border:1px solid var(--border);border-radius:7px;background:var(--s1);color:var(--text);padding:6px;font:800 9px inherit}.som-prod-meta{display:flex;gap:5px;flex-wrap:wrap;padding:7px 10px}.som-prod-meta span,.som-prod-meta i{font-style:normal;border-radius:999px;background:var(--s2);padding:3px 6px;font-size:8.5px}.som-prod-meta .warn{color:#b45309}.som-prod-meta i{background:#fff7ed;color:#9a3412}.som-prod-meta i.on{background:#ecfdf5;color:#166534}.som-lote-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--border)}.som-lote-row>div{flex:1;min-width:0}.som-lote-row b,.som-lote-row span{display:block}.som-lote-row b{font-size:10px}.som-lote-row span{font-size:8.5px;color:var(--muted)}.som-lote-row strong{font-size:10.5px}.som-lote-row.cuarentena{background:#fff7ed}.som-lote-empty{padding:10px;color:var(--muted);font-size:9.5px}.som-inconsistencia{padding:7px 10px;background:#fffbeb;color:#92400e;font-size:9px}#som-conteo-sector{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;align-items:center;padding:9px 10px;margin-bottom:8px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:9px}#som-conteo-sector label{font-size:10px;font-weight:800;color:#1e3a8a}#som-conteo-sector select{min-width:0}#som-conteo-sector small{grid-column:1/-1;color:#64748b;font-size:8.5px}.som-count-kpi{flex:1;text-align:center;padding:7px;background:var(--s2);border-radius:8px}.som-count-kpi b,.som-count-kpi span{display:block}.som-count-kpi b{font-size:15px}.som-count-kpi span{font-size:8px;color:var(--muted)}.som-count-kpi.warn b{color:#b45309}.som-count-row{display:flex;align-items:center;gap:7px;padding:8px 10px;border-bottom:1px solid var(--border)}.som-count-row>div{flex:1;min-width:0}.som-count-row b,.som-count-row span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.som-count-row b{font-size:10.5px}.som-count-row span{font-size:8.5px;color:var(--muted)}.som-count-row em{font:800 10px inherit}.som-count-row em.ok{color:#059669}.som-count-row em.up{color:#059669}.som-count-row em.down{color:#dc2626}.som-count-row input{width:64px;text-align:center}@media(max-width:650px){.som-lotes-kpis{grid-template-columns:repeat(3,1fr)}#dep-modos{flex-wrap:wrap}#dep-modos button{flex:1 1 30%}}';
  document.head.appendChild(style);
  modal.innerHTML='<div class="modal-box" style="max-height:90vh;display:flex;flex-direction:column"><div class="modal-head"><div><div class="modal-ttl">📥 Carga masiva segura</div><div style="font-size:9px;color:var(--muted)">Vista previa · confirmación · todo o nada</div></div><button class="modal-cls" onclick="cerrarModal(\'modal-carga-stock\')">✕</button></div><div style="padding:14px 16px;overflow:auto"><div class="som-mode"><button class="on" data-som-modo="ajuste" onclick="_somModo(\'ajuste\')">🔢 Ajustar por conteo</button><button data-som-modo="ingreso_lotes" onclick="_somModo(\'ingreso_lotes\')">🧪 Ingresar lotes</button></div><div id="som-hint"></div><button class="btn btn-ghost" onclick="_exportarPlantillaStock()" style="width:100%;margin-bottom:9px">📊 Descargar Excel compatible</button><label id="som-upload-label" class="som-upload"></label><label class="som-field">Motivo general de la operación<input id="som-motivo" class="cat-inp" maxlength="500" placeholder="Ej: Conteo físico del depósito"></label><div id="carga-stock-result" style="display:none;margin-top:10px"></div><button id="som-apply" class="btn btn-primary" onclick="_somAplicar()" style="display:none;width:100%;margin-top:10px">✓ Aplicar operación completa</button></div></div>';
  soBulkMode("ajuste");
  var lotBtn=document.createElement("button");lotBtn.type="button";lotBtn.setAttribute("data-som-dep","lotes");lotBtn.textContent="🧪 Lotes";modes.appendChild(lotBtn);
  var pane=document.createElement("div");pane.id="dep-lotes-pane";pane.innerHTML='<div class="som-lotes-toolbar"><input class="cat-inp" placeholder="Buscar producto o código…" oninput="_somLotesBuscar(this.value)"><button onclick="_somAbrirLote(\'\')">＋ Ingresar lote</button><button onclick="_somLotesRefrescar()">↻</button></div><div id="som-lotes-kpis" class="som-lotes-kpis"></div><div id="som-lotes-body"></div>';dep.appendChild(pane);
  lotBtn.onclick=function(){modes.querySelectorAll("button").forEach(function(b){b.classList.toggle("on",b===lotBtn);});var ids=["dep-kpis","dep-list","dep-map-pane"];ids.forEach(function(id){var e=document.getElementById(id);if(e)e.style.display="none";});var f=dep.querySelector(".dep-filtros");if(f)f.style.display="none";pane.style.display="block";soRenderLotes(false);};
  modes.querySelectorAll("[data-dep-modo]").forEach(function(b){b.addEventListener("click",function(){pane.style.display="none";var f=dep.querySelector(".dep-filtros");if(f)f.style.display=this.getAttribute("data-dep-modo")==="listado"?"flex":"none";});});
  var mods=document.createElement("div");mods.innerHTML='<div class="modal-bg" id="som-lote-modal"><div class="modal-box" style="max-width:500px"><div class="modal-head"><div class="modal-ttl">🧪 Ingresar lote</div><button class="modal-cls" onclick="cerrarModal(\'som-lote-modal\')">✕</button></div><div style="padding:15px 17px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="som-field" style="grid-column:1/-1">Producto<select id="som-lote-codigo" class="cat-inp"></select></label><label class="som-field">Cantidad<input id="som-lote-cant" type="number" min="1" step="1" class="cat-inp"></label><label class="som-field">Número de lote<input id="som-lote-nro" maxlength="120" class="cat-inp"></label><label class="som-field">Vencimiento<input id="som-lote-vence" type="date" class="cat-inp"></label><label class="som-field">Motivo<input id="som-lote-motivo" maxlength="500" class="cat-inp" placeholder="Ingreso de compra"></label><div style="grid-column:1/-1;padding:9px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:9.5px;color:#1e3a8a">El ingreso suma stock. Antes de guardar verás la cantidad anterior, la nueva y una confirmación.</div></div><div style="padding:11px 17px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:8px"><button class="btn btn-ghost" onclick="cerrarModal(\'som-lote-modal\')">Cancelar</button><button id="som-lote-save" class="btn btn-primary" onclick="_somGuardarLote()">Confirmar ingreso</button></div></div></div><div class="modal-bg" id="som-cfg-modal"><div class="modal-box" style="max-width:430px"><div class="modal-head"><div class="modal-ttl">⚙️ Control de lotes</div><button class="modal-cls" onclick="cerrarModal(\'som-cfg-modal\')">✕</button></div><div style="padding:15px 17px"><input id="som-cfg-codigo" type="hidden"><b id="som-cfg-nombre"></b><label class="som-field"><input id="som-cfg-control" type="checkbox"> Activar control de lotes para este producto</label><label class="som-field">Avisar con anticipación<input id="som-cfg-dias" type="number" min="1" max="3650" class="cat-inp"></label><div style="margin-top:8px;font-size:9.5px;color:var(--muted)">La categoría sólo genera una sugerencia. Nunca se cambia la familia ni se activa este control automáticamente.</div></div><div style="padding:11px 17px;border-top:1px solid var(--border);text-align:right"><button class="btn btn-primary" onclick="_somGuardarConfig()">Guardar configuración</button></div></div></div>';while(mods.firstChild)document.body.appendChild(mods.firstChild);
  soInstallCount();
}
window._somLotesRefrescar=function(){S.panel=null;S.panelAt=0;soRenderLotes(true);};
window.__stockOperacionesV2Test={int:soInt,fecha:soDateISO,error:soError,locKey:soLocKey,fechaEstado:soFechaEstado};
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",soInject);else soInject();
})();
