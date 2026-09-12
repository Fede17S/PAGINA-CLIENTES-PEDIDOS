(function(){
"use strict";

window.BARCODE_PRODUCTOS_VERSION="1.0.0";

var _bp={
  mode:"quick",
  selectedId:"",
  query:"",
  stream:null,
  timer:null,
  detector:null,
  cameraBusy:false,
  saving:false,
  lastSeen:"",
  clearFrames:0,
  undo:null
};

function bEsc(v){
  if(typeof window.escHtml==="function")return window.escHtml(String(v==null?"":v));
  return String(v==null?"":v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function bNorm(value,format){
  var s=String(value==null?"":value).trim().toUpperCase();
  if(!s)return "";
  var compact=s.replace(/\s+/g,"");
  if(/^[0-9-]+$/.test(compact)){
    var digits=compact.replace(/[^0-9]/g,"");
    // UPC-A y EAN-13 con cero inicial representan el mismo GTIN.
    if(digits.length===12 && (!format || format==="upc_a"))return "0"+digits;
    return digits;
  }
  return compact;
}

function bKeys(value,format){
  var code=bNorm(value,format),out=[];
  function add(v){if(v&&out.indexOf(v)<0)out.push(v);}
  add(code);
  if(/^\d{12}$/.test(code))add("0"+code);
  if(/^0\d{12}$/.test(code))add(code.slice(1));
  return out;
}

function bGtin(value,format){
  var code=bNorm(value,format);
  if(!/^\d+$/.test(code))return {esGtin:false,valido:null,codigo:code,tipo:"Código interno"};
  if(format==="code_128"||format==="code_39"||format==="codabar"||format==="itf"||format==="qr_code"||format==="data_matrix"){
    return {esGtin:false,valido:null,codigo:code,tipo:String(format).toUpperCase()};
  }
  if(format==="upc_e")return {esGtin:true,valido:null,codigo:code,tipo:"UPC-E"};
  var tipos={8:"EAN-8",13:"EAN-13 / UPC-A",14:"GTIN-14"},tipo=tipos[code.length];
  if(!tipo)return {esGtin:false,valido:null,codigo:code,tipo:"Código numérico"};
  var sum=0,weight=3;
  for(var i=code.length-2;i>=0;i--){sum+=(code.charCodeAt(i)-48)*weight;weight=weight===3?1:3;}
  var expected=(10-(sum%10))%10,actual=code.charCodeAt(code.length-1)-48;
  return {esGtin:true,valido:expected===actual,codigo:code,tipo:tipo,digitoEsperado:expected,digitoActual:actual};
}

function bProductCode(p){return p&&(p.codigoBarras||p.codigo_barras)||"";}
function bCatalog(){
  return Object.entries(window._prodData||{}).map(function(e){
    var p=e[1]||{};return {id:String(p.id||e[0]),p:p};
  });
}
function bConflict(value,excludeId,format){
  var keys=bKeys(value,format);
  if(!keys.length)return [];
  return bCatalog().filter(function(x){
    if(String(x.id)===String(excludeId||""))return false;
    var other=bKeys(bProductCode(x.p));
    return other.some(function(k){return keys.indexOf(k)>=0;});
  });
}
function bValidate(value,excludeId,format){
  var code=bNorm(value,format);
  if(!code)return {ok:true,empty:true,code:"",message:"Sin código de barras cargado."};
  if(code.length<4||code.length>64)return {ok:false,code:code,message:"El código debe tener entre 4 y 64 caracteres."};
  if(/[\u0000-\u001f\u007f]/.test(code))return {ok:false,code:code,message:"El código contiene caracteres no válidos."};
  var conflicts=bConflict(code,excludeId,format);
  if(conflicts.length){
    var p=conflicts[0].p;
    return {ok:false,code:code,conflicts:conflicts,message:"Ya está asignado a "+(p.nombre||p.codigo||"otro producto")+"."};
  }
  var gtin=bGtin(code,format);
  if(gtin.esGtin&&gtin.valido===false){
    return {ok:true,warning:true,code:code,gtin:gtin,message:"El dígito verificador no coincide. Revisalo antes de guardar."};
  }
  return {ok:true,code:code,gtin:gtin,message:(gtin.tipo||"Código")+" listo para usar."};
}

function bSetStatus(message,type){
  var el=document.getElementById("bp-status");if(!el)return;
  el.className="bp-status "+(type||"");el.textContent=message||"";
}
function bCurrent(){
  var id=String(_bp.selectedId||"");
  return bCatalog().find(function(x){return x.id===id;})||null;
}
function bSorted(){
  return bCatalog().sort(function(a,b){
    var ao=a.p.ubicacionOrden==null?(a.p.ubicacion_orden==null?999999:+a.p.ubicacion_orden):+a.p.ubicacionOrden;
    var bo=b.p.ubicacionOrden==null?(b.p.ubicacion_orden==null?999999:+b.p.ubicacion_orden):+b.p.ubicacionOrden;
    return ao-bo||String(a.p.nombre||"").localeCompare(String(b.p.nombre||""),"es");
  });
}
function bNextMissing(excludeId){
  return bSorted().find(function(x){return x.id!==String(excludeId||"")&&!bNorm(bProductCode(x.p));})||null;
}
function bFocusInput(){setTimeout(function(){var el=document.getElementById("bp-code");if(el){el.value="";el.focus();}},40);}

function bRenderQuick(){
  var all=bSorted(),done=all.filter(function(x){return !!bNorm(bProductCode(x.p));}).length;
  var progress=document.getElementById("bp-progress");
  if(progress)progress.innerHTML='<div><b>'+done+' de '+all.length+'</b><span>productos identificados</span></div><div class="bp-progress-track"><i style="width:'+(all.length?Math.round(done*100/all.length):0)+'%"></i></div>';
  var current=bCurrent();
  if(!current){current=bNextMissing("")||all[0]||null;_bp.selectedId=current?current.id:"";}
  var picked=document.getElementById("bp-picked");
  if(picked){
    if(!current)picked.innerHTML='<b>No hay productos en el catálogo.</b>';
    else{
      var p=current.p,barcode=bNorm(bProductCode(p));
      picked.innerHTML='<span class="bp-picked-label">PRODUCTO SELECCIONADO</span><b>'+bEsc(p.nombre||"Sin nombre")+'</b><small>SKU '+bEsc(p.codigo||"—")+(barcode?' · Código '+bEsc(barcode):' · Sin código de barras')+'</small>';
    }
  }
  var q=String(_bp.query||"").trim().toLowerCase(),candidates=all.filter(function(x){
    var p=x.p,hay=(String(p.nombre||"")+" "+String(p.codigo||"")+" "+String(bProductCode(p))).toLowerCase();
    return x.id!==_bp.selectedId&&(q?hay.indexOf(q)>=0:!bNorm(bProductCode(p)));
  }).slice(0,8);
  var results=document.getElementById("bp-results");
  if(results)results.innerHTML=candidates.length?candidates.map(function(x){
    var p=x.p,has=!!bNorm(bProductCode(p));
    return '<button type="button" onclick="_prodBarcodeSeleccionar(\''+bEsc(x.id)+'\')"><span><b>'+bEsc(p.nombre||"Sin nombre")+'</b><small>SKU '+bEsc(p.codigo||"—")+(has?' · ya tiene código':' · pendiente')+'</small></span><em>'+(has?'Editar':'Elegir')+'</em></button>';
  }).join(""):'<div class="bp-empty">'+(q?'No hay coincidencias.':'No quedan otros productos pendientes.')+'</div>';
  var next=document.getElementById("bp-next");if(next)next.disabled=!bNextMissing(_bp.selectedId);
  var undo=document.getElementById("bp-undo");if(undo)undo.style.display=_bp.undo?"":"none";
}

function bStopCamera(){
  if(_bp.timer){clearTimeout(_bp.timer);_bp.timer=null;}
  if(_bp.stream){_bp.stream.getTracks().forEach(function(t){t.stop();});_bp.stream=null;}
  _bp.detector=null;_bp.cameraBusy=false;_bp.lastSeen="";_bp.clearFrames=0;
  var video=document.getElementById("bp-video");if(video){video.srcObject=null;video.style.display="none";}
  var btn=document.getElementById("bp-camera");if(btn){btn.disabled=false;btn.textContent="📷 Activar cámara";}
}

async function bProcess(value,format){
  if(_bp.saving)return false;
  var current=bCurrent(),exclude=_bp.mode==="field"?String((document.getElementById("mprod-key")||{}).value||""):(current&&current.id);
  var check=bValidate(value,exclude,format);
  if(!check.code){bSetStatus("Ingresá o escaneá un código.","err");return false;}
  if(!check.ok){bSetStatus("⚠️ "+check.message,"err");if(navigator.vibrate)navigator.vibrate([80,60,80]);return false;}
  if(_bp.mode==="field"){
    var field=document.getElementById("mprod-codigo-barras");if(field)field.value=check.code;
    window._prodBarcodeValidarCampo();
    bStopCamera();window._prodBarcodeCerrar();
    if(typeof window.showNotif==="function")window.showNotif("Código leído: "+check.code+(check.warning?" · revisá el dígito verificador":""),check.warning?"warn":"ok");
    return true;
  }
  if(!current){bSetStatus("Elegí primero el producto que tenés en la mano.","err");return false;}
  if(typeof window._sbPatchProducto!=="function"){bSetStatus("No está disponible la conexión para guardar.","err");return false;}
  _bp.saving=true;bStopCamera();bSetStatus("Guardando "+check.code+" en "+(current.p.nombre||"el producto")+"…","info");
  var old=bNorm(bProductCode(current.p));
  try{
    await window._sbPatchProducto(current.id,{codigoBarras:check.code});
    current.p.codigoBarras=check.code;current.p.codigo_barras=check.code;
    _bp.undo={id:current.id,old:old,nuevo:check.code,nombre:current.p.nombre||"Producto"};
    if(typeof window._sincronizarDbStock==="function")window._sincronizarDbStock();
    if(typeof window._auditar==="function")try{window._auditar("editar","producto",current.id,"Asignó código de barras a "+(current.p.nombre||current.id));}catch(e){}
    var next=bNextMissing(current.id);_bp.selectedId=next?next.id:current.id;_bp.query="";
    var search=document.getElementById("bp-search");if(search)search.value="";
    bRenderQuick();bSetStatus("✅ "+check.code+" guardado en "+(current.p.nombre||"el producto")+(check.warning?" · revisá el dígito verificador":"")+".",check.warning?"warn":"ok");
    if(navigator.vibrate)navigator.vibrate(60);bFocusInput();return true;
  }catch(e){
    var msg=(e&&e.message)||String(e||"Error");
    if(/duplicate|unique|23505|codigo_barras/i.test(msg))msg="Ese código ya fue asignado a otro producto.";
    bSetStatus("No se pudo guardar: "+msg,"err");return false;
  }finally{_bp.saving=false;}
}

async function bLoop(){
  if(!_bp.stream||!_bp.detector)return;
  try{
    var video=document.getElementById("bp-video"),codes=video?await _bp.detector.detect(video):[];
    var hit=codes&&codes[0];
    if(hit&&hit.rawValue){
      _bp.clearFrames=0;
      var key=bNorm(hit.rawValue,hit.format);
      if(key&&key!==_bp.lastSeen){
        _bp.lastSeen=key;
        var ok=await bProcess(hit.rawValue,hit.format);
        if(ok)return;
      }
    }else if(++_bp.clearFrames>=2){_bp.lastSeen="";_bp.clearFrames=0;}
  }catch(e){}
  if(_bp.stream)_bp.timer=setTimeout(bLoop,240);
}

async function bDetector(){
  var wanted=["ean_13","ean_8","upc_a","upc_e","code_128","code_39","codabar","itf","data_matrix","qr_code"];
  var supported=[];
  if(typeof window.BarcodeDetector.getSupportedFormats==="function"){
    try{supported=await window.BarcodeDetector.getSupportedFormats();}catch(e){}
  }
  var formats=supported.length?wanted.filter(function(f){return supported.indexOf(f)>=0;}):wanted;
  try{return formats.length?new window.BarcodeDetector({formats:formats}):new window.BarcodeDetector();}
  catch(e){return new window.BarcodeDetector();}
}

function bInject(){
  if(document.getElementById("barcode-productos-style"))return;
  var style=document.createElement("style");style.id="barcode-productos-style";style.textContent='\
.barcode-field-row{display:flex;gap:7px}.barcode-field-row input{flex:1;min-width:0}.barcode-field-row button{border:1px solid var(--border);border-radius:8px;background:var(--accent-bg);color:var(--accent);padding:0 12px;font-weight:750;cursor:pointer;white-space:nowrap}.barcode-field-status{display:none;font-size:11px;font-weight:650;padding:2px 1px}.barcode-field-status.ok{display:block;color:#059669}.barcode-field-status.warn{display:block;color:#b45309}.barcode-field-status.err{display:block;color:#dc2626}\
.bp-overlay{display:none;position:fixed;inset:0;z-index:100040;background:rgba(0,0,0,.62);align-items:center;justify-content:center;padding:14px}.bp-overlay.on{display:flex}.bp-card{width:min(480px,100%);max-height:92vh;overflow:auto;box-sizing:border-box;background:var(--s1,#fff);color:var(--text,#111);border:1px solid var(--border,#ddd);border-radius:18px;padding:17px;box-shadow:0 22px 70px rgba(0,0,0,.38)}.bp-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.bp-head b{font-size:18px}.bp-head small{display:block;color:var(--muted);margin-top:3px}.bp-close{width:34px;height:34px;border:0;border-radius:9px;background:var(--s3);color:var(--text);font-size:20px;cursor:pointer}.bp-progress{margin:13px 0 9px;padding:10px;border:1px solid var(--border);border-radius:11px;background:var(--s2)}.bp-progress>div:first-child{display:flex;justify-content:space-between;align-items:center}.bp-progress span{font-size:11px;color:var(--muted)}.bp-progress-track{height:6px;margin-top:7px;background:var(--s3);border-radius:99px;overflow:hidden}.bp-progress-track i{display:block;height:100%;background:#10b981}.bp-picked{padding:11px;border:1px solid rgba(37,99,235,.35);border-radius:11px;background:rgba(37,99,235,.07);display:flex;flex-direction:column;gap:3px}.bp-picked-label{font-size:9px;font-weight:800;color:#2563eb}.bp-picked small{color:var(--muted)}.bp-search{width:100%;box-sizing:border-box;margin-top:9px;padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--s2);color:var(--text);font:inherit}.bp-results{display:flex;flex-direction:column;gap:5px;max-height:190px;overflow:auto;margin-top:6px}.bp-results button{display:flex;justify-content:space-between;align-items:center;text-align:left;border:1px solid var(--border);border-radius:9px;padding:8px 10px;background:var(--s2);color:var(--text);cursor:pointer}.bp-results button span{display:flex;flex-direction:column;min-width:0}.bp-results button b,.bp-results button small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.bp-results button small{color:var(--muted);margin-top:2px}.bp-results button em{font-style:normal;color:#2563eb;font-size:11px;font-weight:750}.bp-empty{text-align:center;color:var(--muted);font-size:12px;padding:8px}\
.bp-video-wrap{position:relative;margin-top:10px}.bp-video{display:none;width:100%;height:230px;object-fit:cover;background:#000;border-radius:11px}.bp-scan-guide{pointer-events:none;position:absolute;left:10%;right:10%;top:50%;height:58px;transform:translateY(-50%);border:2px solid rgba(255,255,255,.9);border-radius:9px;box-shadow:0 0 0 999px rgba(0,0,0,.18)}.bp-code-row{display:flex;gap:7px;margin-top:9px}.bp-code-row input{flex:1;min-width:0;padding:11px;border:1px solid var(--border);border-radius:9px;background:var(--s2);color:var(--text);font:inherit}.bp-code-row button{border:0;border-radius:9px;padding:0 13px;background:#24459d;color:#fff;font-weight:750}.bp-status{min-height:34px;box-sizing:border-box;margin-top:7px;padding:8px 9px;border-radius:8px;background:var(--s2);font-size:12px;color:var(--muted)}.bp-status.ok{background:rgba(16,185,129,.1);color:#047857}.bp-status.warn{background:rgba(245,158,11,.12);color:#a16207}.bp-status.err{background:rgba(220,38,38,.1);color:#b91c1c}.bp-actions{display:flex;gap:7px;margin-top:9px}.bp-actions button{flex:1;padding:10px;border:1px solid var(--border);border-radius:9px;background:var(--s2);color:var(--text);font-weight:750;cursor:pointer}.bp-actions button.primary{background:#24459d;border-color:#24459d;color:#fff}.bp-actions button:disabled{opacity:.45}.bp-help{font-size:10.5px;color:var(--muted);line-height:1.45;margin-top:9px}\
@media(max-width:560px){.bp-overlay{align-items:flex-end;padding:0}.bp-card{border-radius:18px 18px 0 0;max-height:94vh;padding-bottom:calc(17px + var(--safe-bottom,0px))}.bp-video{height:210px}}';document.head.appendChild(style);
  var wrap=document.createElement("div");wrap.innerHTML='\
<div id="bp-overlay" class="bp-overlay" role="dialog" aria-modal="true" aria-labelledby="bp-title"><div class="bp-card">\
  <div class="bp-head"><div><b id="bp-title">📷 Cargar códigos de barras</b><small id="bp-subtitle">Elegí el producto que tenés en la mano y escanealo.</small></div><button class="bp-close" type="button" onclick="_prodBarcodeCerrar()" aria-label="Cerrar">×</button></div>\
  <div id="bp-quick">\
    <div id="bp-progress" class="bp-progress"></div><div id="bp-picked" class="bp-picked"></div>\
    <input id="bp-search" class="bp-search" placeholder="Buscar producto o SKU…" oninput="_prodBarcodeBuscar(this.value)"><div id="bp-results" class="bp-results"></div>\
  </div>\
  <div class="bp-video-wrap"><video id="bp-video" class="bp-video" playsinline muted></video><div id="bp-guide" class="bp-scan-guide" style="display:none"></div></div>\
  <div class="bp-code-row"><input id="bp-code" inputmode="numeric" autocomplete="off" placeholder="Código de barras" onkeydown="if(event.key===\'Enter\'){event.preventDefault();_prodBarcodeUsarManual();}"><button type="button" onclick="_prodBarcodeUsarManual()">Usar</button></div>\
  <div id="bp-status" class="bp-status">Podés usar la cámara, un lector Bluetooth/USB o escribir el número.</div>\
  <div class="bp-actions"><button id="bp-camera" class="primary" type="button" onclick="_prodBarcodeCamara()">📷 Activar cámara</button><button id="bp-next" type="button" onclick="_prodBarcodeSiguiente()">Siguiente pendiente</button><button id="bp-undo" type="button" onclick="_prodBarcodeDeshacer()" style="display:none">↶ Deshacer</button></div>\
  <div class="bp-help">EAN-13, EAN-8, UPC y GTIN se validan y normalizan. Un mismo código no puede pertenecer a dos productos de la misma empresa.</div>\
</div></div>';
  while(wrap.firstChild)document.body.appendChild(wrap.firstChild);
}

window._barcodeNormalizar=bNorm;
window._barcodeClaves=bKeys;
window._barcodeValidarGTIN=bGtin;
window._prodBarcodeValidarValor=bValidate;

window._prodBarcodeValidarCampo=function(){
  var input=document.getElementById("mprod-codigo-barras"),status=document.getElementById("mprod-codigo-barras-estado");
  if(!input||!status)return true;
  var key=String((document.getElementById("mprod-key")||{}).value||""),check=bValidate(input.value,key);
  input.style.borderColor="";status.className="barcode-field-status";
  if(check.empty){status.textContent="";return true;}
  status.textContent=(check.ok?(check.warning?"⚠️ ":"✓ "):"⚠️ ")+check.message;
  status.classList.add(check.ok?(check.warning?"warn":"ok"):"err");
  if(!check.ok)input.style.borderColor="#dc2626";
  return check.ok;
};

window._prodBarcodeAbrirCargaRapida=async function(){
  bInject();
  if(!window._sbEmpId){if(window.showNotif)window.showNotif("Primero cargá una empresa.","err");return;}
  try{
    if(typeof window._sbGetProductos==="function"){
      var fresh=await window._sbGetProductos(true);if(fresh)window._prodData=fresh;
    }
  }catch(e){if(window.showNotif)window.showNotif("No se pudo actualizar el catálogo: "+(e.message||e),"err");return;}
  _bp.mode="quick";_bp.query="";_bp.selectedId=(bNextMissing("")||bSorted()[0]||{}).id||"";
  var quick=document.getElementById("bp-quick"),next=document.getElementById("bp-next"),title=document.getElementById("bp-title"),sub=document.getElementById("bp-subtitle"),search=document.getElementById("bp-search");
  if(quick)quick.style.display="";if(next)next.style.display="";if(title)title.textContent="📷 Cargar códigos de barras";if(sub)sub.textContent="Elegí el producto que tenés en la mano y escanealo.";if(search)search.value="";
  document.getElementById("bp-overlay").classList.add("on");bRenderQuick();bSetStatus("Podés usar la cámara, un lector Bluetooth/USB o escribir el número.","info");bFocusInput();
};

window._prodBarcodeEscanearCampo=function(){
  bInject();_bp.mode="field";_bp.selectedId=String((document.getElementById("mprod-key")||{}).value||"");
  var quick=document.getElementById("bp-quick"),next=document.getElementById("bp-next"),undo=document.getElementById("bp-undo"),title=document.getElementById("bp-title"),sub=document.getElementById("bp-subtitle"),name=(document.getElementById("mprod-nombre")||{}).value||"este producto";
  if(quick)quick.style.display="none";if(next)next.style.display="none";if(undo)undo.style.display="none";if(title)title.textContent="📷 Escanear código";if(sub)sub.textContent="Se copiará al editor de "+name+"; se guarda junto con el producto.";
  document.getElementById("bp-overlay").classList.add("on");bSetStatus("Enfocá el código completo o ingresalo con un lector.","info");bFocusInput();
};

window._prodBarcodeCerrar=function(){bStopCamera();var el=document.getElementById("bp-overlay");if(el)el.classList.remove("on");};
window._prodBarcodeBuscar=function(value){_bp.query=value||"";bRenderQuick();};
window._prodBarcodeSeleccionar=function(id){bStopCamera();_bp.selectedId=String(id||"");_bp.query="";var s=document.getElementById("bp-search");if(s)s.value="";bRenderQuick();bSetStatus("Listo. Escaneá solamente el producto seleccionado.","info");bFocusInput();};
window._prodBarcodeSiguiente=function(){var n=bNextMissing(_bp.selectedId)||bNextMissing("");if(n)window._prodBarcodeSeleccionar(n.id);else bSetStatus("✅ Todos los productos ya tienen código.","ok");};
window._prodBarcodeUsarManual=function(){var el=document.getElementById("bp-code");return bProcess(el&&el.value,"");};

window._prodBarcodeCamara=async function(){
  bInject();if(_bp.stream){bStopCamera();return;}
  if(!(window.BarcodeDetector&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia)){bSetStatus("La cámara automática no está disponible en este equipo. Usá un lector Bluetooth/USB o escribí el código.","warn");return;}
  var btn=document.getElementById("bp-camera");if(btn){btn.disabled=true;btn.textContent="Abriendo cámara…";}
  try{
    _bp.detector=await bDetector();
    _bp.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}},audio:false});
    var video=document.getElementById("bp-video");video.srcObject=_bp.stream;await video.play();video.style.display="block";var guide=document.getElementById("bp-guide");if(guide)guide.style.display="block";
    if(btn){btn.disabled=false;btn.textContent="Detener cámara";}bSetStatus("Alineá el código dentro del recuadro y mantené el teléfono quieto.","info");bLoop();
  }catch(e){bStopCamera();bSetStatus("No se pudo abrir la cámara. Revisá el permiso o usá el ingreso manual.","err");}
};

window._prodBarcodeDeshacer=async function(){
  var u=_bp.undo;if(!u||_bp.saving)return;_bp.saving=true;bStopCamera();bSetStatus("Deshaciendo el último código…","info");
  try{
    await window._sbPatchProducto(u.id,{codigoBarras:u.old||""});
    var x=bCatalog().find(function(p){return p.id===String(u.id);});if(x){x.p.codigoBarras=u.old||"";x.p.codigo_barras=u.old||"";}
    _bp.selectedId=String(u.id);_bp.undo=null;bRenderQuick();bSetStatus("↶ Se restauró "+u.nombre+".","ok");bFocusInput();
  }catch(e){bSetStatus("No se pudo deshacer: "+(e.message||e),"err");}finally{_bp.saving=false;}
};

window.DistribixBarcode={normalizar:bNorm,claves:bKeys,validarGTIN:bGtin,validar:bValidate,conflictos:bConflict};
window.__barcodeProductosTest={normalizar:bNorm,claves:bKeys,validarGTIN:bGtin,validar:bValidate};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bInject);else bInject();
window.addEventListener("beforeunload",bStopCamera);

})();
