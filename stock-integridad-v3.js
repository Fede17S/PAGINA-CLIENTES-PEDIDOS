(function(w){
"use strict";
// Una confirmación autoriza una foto concreta del movimiento, no cambios futuros.
var busy=false, revision=0, lecturas=0, ultimaLectura=null, manuales=new Map(), rutaBusy=new Set();
var mutaciones=/^(stk_reservar|stk_salida|stk_liberar|stk_devolver|stk_confirmar_salida|stock_ajustar_manual_atomico|stock_carga_masiva_atomica|stock_lote_registrar_ingreso|stock_lote_cambiar_estado|stock_recuperar_claves_atomico|pedido_confirmar_atomico|pedido_editar_atomico|ruta_editar_items_atomico|pedido_borrar_stock_atomico)$/;
function copia(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function error(c,m){var e=new Error(m);e.code=c;return e;}
function aviso(m,t){if(w.showNotif)w.showNotif(m,t||"err");}
function empresa(){if(!w._sbEmpId)throw error("STOCK_EMPRESA","Volvé a ingresar a tu empresa.");return String(w._sbEmpId);}
function verificarEmpresa(emp){if(empresa()!==emp)throw error("STOCK_EMPRESA_CAMBIO","La empresa cambió durante la operación. Volvé a abrirla.");}
function conectado(){if(!navigator.onLine)throw error("STOCK_REQUIERE_CONEXION","Necesitás conexión para confirmar movimientos de stock.");}
function api(fn,body){return w._sbFetchTransporte("POST","/rest/v1/rpc/"+fn,body);}
async function leer(tabla,query,emp){
  conectado();var out=[],pagina=0,unica=/(?:^|&)limit=/.test(query),r;
  do{
    r=await w._sbFetchTransporte("GET","/rest/v1/"+tabla+"?"+query+"&empresa_id=eq."+encodeURIComponent(emp)+(unica?"":"&limit=500&offset="+pagina*500));
    verificarEmpresa(emp);if(!Array.isArray(r))throw new Error("No se pudo leer "+tabla+" del servidor");out=out.concat(r);pagina++;
  }while(!unica&&r.length===500);
  return out;
}
function cantidades(items){
  var m=Object.create(null);
  (items||[]).forEach(function(it){
    if(!it||it.pendiente)return;
    var cod=String(it.id!=null?it.id:it.codigo!=null?it.codigo:it.cod||"").trim();
    var q=Number(it.c!=null?it.c:it.cant!=null?it.cant:it.cantidad!=null?it.cantidad:it.qty||0);
    if(!cod)return;
    if(!Number.isSafeInteger(q)||q<0)throw error("STOCK_CANTIDAD_INVALIDA","Cantidad inválida para "+cod+". Usá unidades enteras.");
    m[cod]=(m[cod]||0)+q;
  });return m;
}
function diferencia(antes,despues){
  var a=cantidades(antes),b=cantidades(despues),out=[];
  Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort().forEach(function(c){var d=(a[c]||0)-(b[c]||0);if(d)out.push({codigo:c,delta:d});});return out;
}
function nombre(cod){var p=(w.dbStock||[]).find(function(x){return String(x.id)===String(cod);});return p?(p.n||p.nombre||cod):cod;}
function firmaManual(c,a,n){return JSON.stringify([empresa(),String(c),Number(a),Number(n)]);}
function autorizarManual(c,a,n){manuales.set(firmaManual(c,a,n),Date.now()+30000);}
async function describir(fn,b,emp){
  var automatico=/^(stk_|pedido_|ruta_)/.test(fn),movs=[],titulo=b.p_motivo||"Confirmar movimiento de stock";
  if(automatico){
    var es=await w._sbFetchTransporte("GET","/rest/v1/empresas?select=control_stock&id=eq."+encodeURIComponent(emp));
    if(!es||!es[0])throw new Error("No se pudo verificar el control de stock de la empresa");
    if(!es[0].control_stock)return {movs:[],titulo:titulo};
  }
  if(fn==="pedido_editar_atomico"||fn==="pedido_borrar_stock_atomico"){
    var ps=await leer("backup_pedidos","select=items,stock_devuelto&id=eq."+encodeURIComponent(b.p_pedido_id)+"&limit=1",emp);
    if(!ps[0])throw new Error("El pedido ya no existe. Actualizá la pantalla.");
    if(!ps[0].stock_devuelto)movs=diferencia(ps[0].items,fn==="pedido_editar_atomico"?b.p_patch.items:[]);
  }else if(fn==="ruta_editar_items_atomico"){
    movs=diferencia(b.p_items_esperados,b.p_items);
  }else if(fn==="stock_ajustar_manual_atomico"){
    movs=[{codigo:b.p_codigo,delta:b.p_nuevo-b.p_esperado,esperado:b.p_esperado}];
  }else if(fn==="stock_carga_masiva_atomica"){
    movs=(b.p_items||[]).map(function(x){return {codigo:x.codigo,delta:b.p_modo==="ingreso_lotes"?+x.cantidad:x.nuevo-x.esperado,esperado:b.p_modo==="ingreso_lotes"?undefined:x.esperado,lote:x.lote};});
  }else if(fn==="stock_lote_registrar_ingreso"){
    movs=[{codigo:b.p_codigo,delta:+b.p_cantidad,lote:b.p_lote}];
  }else if(fn==="stock_lote_cambiar_estado"){
    var panel=await api("stock_deposito_panel",{p_empresa:emp,p_codigo:null});
    var ls=(panel&&panel.lotes||[]).filter(function(x){return String(x.id)===String(b.p_lote_id);});
    if(!ls[0])throw new Error("El lote ya no existe. Actualizá la pantalla.");
    if(ls[0].estado!==b.p_destino)movs=[{codigo:ls[0].codigo,delta:(b.p_destino==="cuarentena"?-1:1)*b.p_cantidad,lote:ls[0].lote}];
  }else if(fn==="stock_recuperar_claves_atomico"){
    (b.p_items||[]).forEach(function(x){movs.push({codigo:x.codigo,delta:x.colgadas-x.actual,esperado:x.actual});movs.push({codigo:x.k,delta:-x.colgadas,esperado:x.colgadas});});
  }else if(fn==="stk_liberar"){
    // La liberación cambia reservas, no cantidad física; se confirma igualmente.
    return {movs:[],titulo:"Liberar reserva",reserva:true,texto:"Se liberará la reserva del pedido "+b.p_ref+"."};
  }else{
    var cs=cantidades(fn==="pedido_confirmar_atomico"?b.p_items_stock:b.p_items);
    Object.keys(cs).forEach(function(c){movs.push({codigo:c,delta:(fn==="stk_devolver"?1:-1)*cs[c]});});
  }
  var agrupado=new Map();
  movs.forEach(function(x){if(!Number.isSafeInteger(x.delta))throw new Error("Cantidad de stock inválida");var y=agrupado.get(x.codigo);if(y){y.delta+=x.delta;}else agrupado.set(x.codigo,x);});
  movs=Array.from(agrupado.values()).filter(function(x){return x.delta!==0;});
  if(!movs.length)return {movs:[],titulo:titulo};
  var ss=await leer("stock","select=codigo,cantidad&order=codigo.asc",emp),sm=Object.create(null);
  ss.forEach(function(x){sm[x.codigo]=Number(x.cantidad)||0;});
  movs.forEach(function(x){
    x.antes=sm[x.codigo]||0;x.despues=x.antes+x.delta;
    if(x.esperado!==undefined&&x.antes!==x.esperado)throw error("STOCK_CAMBIO_CONCURRENTE","El stock de "+nombre(x.codigo)+" cambió: ahora hay "+x.antes+". Actualizá y revisá el cambio.");
    if(x.delta<0&&x.despues<0)throw error("STOCK_INSUFICIENTE","Stock insuficiente de "+nombre(x.codigo)+": hay "+x.antes+" y querés sacar "+(-x.delta)+".");
  });
  return {movs:movs,titulo:titulo,reserva:fn==="stk_reservar"};
}
async function enviar(method,path,body,transporte){
  var fn=(String(path).match(/\/rpc\/([^?]+)/)||[])[1];
  var esStock=method!=="GET"&&mutaciones.test(fn||"");
  if(method!=="GET"&&/^\/rest\/v1\/stock(?:\?|$)/.test(path)&&body&&[].concat(body).some(function(x){return x&&x.cantidad!==undefined;})){
    throw error("STOCK_ESCRITURA_DIRECTA","Este cambio debe realizarse desde Stock con confirmación.");
  }
  if(!esStock){
    var esCatalogo=method!=="GET"&&/^\/rest\/v1\/productos(?:\?|$)/.test(path);
    var emp=esCatalogo?empresa():null;
    var res=await transporte(method,path,body);
    if(esCatalogo){revision++;await invalidarCatalogo(emp);}
    return res;
  }
  if(busy)throw error("STOCK_OPERACION_EN_CURSO","Hay un movimiento pendiente de confirmación o guardado. Esperá a que termine.");
  busy=true;
  try{
    conectado();var emp=empresa(),b=copia(body);
    if(String(b.p_empresa)!==emp)throw new Error("La operación pertenece a otra empresa");
    var plan=await describir(fn,b,emp),autorizado=false;
    if(fn==="stock_ajustar_manual_atomico"){
      var fm=firmaManual(b.p_codigo,b.p_esperado,b.p_nuevo);autorizado=(manuales.get(fm)||0)>Date.now();manuales.delete(fm);
    }
    // El cierre normal del carrito ya fue confirmado por el vendedor con
    // "Enviar pedido definitivo". Conservamos el chequeo previo, el bloqueo y
    // la segunda validación de concurrencia, pero no mostramos un segundo modal
    // técnico de stock. Los ajustes manuales y las demás operaciones sensibles
    // continúan requiriendo confirmación explícita.
    var cierrePedido=fn==="pedido_confirmar_atomico";
    if((plan.movs.length||plan.reserva)&&!autorizado&&!cierrePedido){
      var lineas=plan.movs.map(function(x){return nombre(x.codigo)+" ["+x.codigo+"]"+(x.lote?" · lote "+x.lote:"")+"\n"+x.antes+" → "+x.despues+" u. ("+(x.delta>0?"+":"")+x.delta+")";});
      var ok=await w._confirmar({icono:"📦",titulo:plan.reserva?"Confirmar reserva":"Confirmar movimiento de stock",mensaje:plan.titulo+"\n\n"+(plan.texto||lineas.join("\n\n"))+"\n\nEl cambio se aplicará al confirmar.",ok:"Confirmar cambio",cancelar:"Cancelar",peligro:plan.movs.some(function(x){return x.delta<0;}),persistente:true});
      if(!ok)throw error("STOCK_CANCELADO","Movimiento cancelado. No se aplicaron cambios.");
    }
    verificarEmpresa(emp);conectado();
    // Validar una segunda vez si el usuario dejó abierta la confirmación.
    if(plan.movs.length){var actual=await describir(fn,b,emp);if(JSON.stringify(actual.movs)!==JSON.stringify(plan.movs))throw error("STOCK_CAMBIO_CONCURRENTE","El stock cambió mientras confirmabas. Revisá los valores nuevos y volvé a confirmar.");}
    var resultado=await transporte(method,path,b);
    if(!resultado||resultado.ok===false)throw new Error("El servidor no confirmó el movimiento");
    revision++;
    try{await invalidarTabla("stock",emp);}catch(e){}
    return resultado;
  }finally{busy=false;}
}
async function invalidarTabla(tabla,emp){
  var mem=w._sbOfflineCache||{};
  Object.keys(mem).forEach(function(k){if(k.includes(emp)&&k.includes(tabla))delete mem[k];});
  Object.keys(localStorage).forEach(function(k){if(k.startsWith("dm_sb")&&k.includes(emp)&&k.includes(tabla))localStorage.removeItem(k);});
}
async function invalidarCatalogo(emp){
  await invalidarTabla("productos",emp);
  if(w._idbSet)await w._idbSet("productos_v4_"+emp,null);
  // También invalidar la antigua foto completa de la empresa.
  var rc=w._readCache||{};Object.keys(rc).forEach(function(k){if(rc[k]&&rc[k].data&&rc[k].data.productos)delete rc[k];});
  if(w._cacheKey)localStorage.setItem(w._cacheKey(),JSON.stringify(rc));
}
async function ajustarLote(data){
  var items=Object.keys(data||{}).map(function(c){var n=Number(data[c]);if(!Number.isSafeInteger(n)||n<0)throw new Error("Cantidad inválida: "+c);return {codigo:c,nuevo:n,esperado:Number((w.stockData||{})[c]||0)};});
  return w.sbFetch("POST","/rest/v1/rpc/stock_carga_masiva_atomica",{p_empresa:empresa(),p_operacion:w._productoUuidNuevo(),p_modo:"ajuste",p_items:items,p_usuario:(w.currentUser||{}).name||"sistema",p_motivo:"Ajuste de inventario confirmado"});
}
function esDiferida(op){
  if(!op)return false;
  var m=String(op.method||""),p=String(op.path||""),d=op.data||{},b=d.body||d;
  if(m==="STOCK_OUT"||m==="STOCK_RETURN"||op.requiereRevision)return true;
  if(m==="RPC"&&mutaciones.test((p.match(/\/rpc\/([^?]+)/)||[])[1]||""))return true;
  if(/(?:^|\/)stock(?:\/|\?|$)/.test(p))return true;
  if((m==="PATCH"||m==="SB_PATCH")&&/rutas|ruta_clientes|backupPedidos|backup_pedidos/.test(p)&&b.items!==undefined)return true;
  return /(?:^|\/)productos(?:\/|\?|$)/.test(p)&&(m==="POST"||m==="SB_POST");
}
async function revisarPendientes(){
  var ops=(w._offlineQueue||[]).filter(esDiferida);if(!ops.length)return;
  var ok=await w._confirmar({icono:"📦",titulo:"Revisar movimientos antiguos",mensaje:ops.map(function(x){return (x.desc||x.method)+" · "+(x.ts||"");}).join("\n")+"\n\nEstos cambios antiguos están detenidos. Revisá el pedido o el inventario actual y hacé el cambio desde su pantalla. Podés archivarlos para que nunca se ejecuten automáticamente.",ok:"Archivar pendientes antiguos",cancelar:"Conservar para revisar",persistente:true});
  if(!ok)return;
  var key="stock_pendientes_archivados_"+empresa(),prev=JSON.parse(localStorage.getItem(key)||"[]");
  localStorage.setItem(key,JSON.stringify(prev.concat(copia(ops))));
  w._offlineQueue=w._offlineQueue.filter(function(x){return !ops.includes(x);});w._saveQueue();w._syncLastError=null;w._updateBanner();
  aviso("Pendientes archivados en este dispositivo. No se modificó el stock.","ok");
}
w.StockSeguro={enviar:enviar,autorizarManual:autorizarManual,ajustarLote:ajustarLote,esDiferida:esDiferida,revisarPendientes:revisarPendientes,revision:function(){return revision;},ocupado:function(){return busy||rutaBusy.size>0;},diferencia:diferencia};

// Las lecturas de stock usadas para decisiones jamás pueden volver al caché.
w._sbGetStockFull=function(){
  var emp=empresa(),inicio=revision,turno=++lecturas;
  var promesa=(async function(){
  var rows=await leer("stock","select=codigo,cantidad,reservado&order=codigo.asc",emp);
  if(turno!==lecturas)return ultimaLectura;
  if(inicio!==revision)return w._sbGetStockFull();
  var fis={},res={};rows.forEach(function(x){fis[x.codigo]=+x.cantidad||0;res[x.codigo]=+x.reservado||0;});
  if(turno===lecturas)w.stockReservado=res;
  if(w._sbCacheSave)w._sbCacheSave("stock","select=*",rows);
  return fis;
  })();
  ultimaLectura=promesa;return promesa;
};
w._sbGetStock=function(){return w._sbGetStockFull();};
w._stkAutoApagarSinStock=function(){}; // La disponibilidad se calcula; nunca se reactivan fichas solas.
w._stkRefrescar=async function(){
  w.stockData=await w._sbGetStockFull();
  if(w.renderStock&&document.getElementById("stk-list"))w.renderStock();
  if(w._pgRender)w._pgRender();
};
var refresh=w._refrescarRutasEntreDispositivos;
w._refrescarRutasEntreDispositivos=function(forzar){if(rutaBusy.size||busy)return Promise.resolve(false);return refresh(forzar);};
var renderEditor=w.renderEditItems;
w.renderEditItems=function(wrap,rk,ck){
  renderEditor(wrap,rk,ck);
  if(rutaBusy.has(rk+"|"+ck))wrap.querySelectorAll("button,input,select").forEach(function(x){x.disabled=true;});
};
w.guardarItemsEditados=async function(rk,ck,items,wrap,opciones){
  var key=rk+"|"+ck;if(rutaBusy.has(key))return false;
  var cli=w.rutasData[rk]&&w.rutasData[rk].clientes&&w.rutasData[rk].clientes[ck];if(!cli)return false;
  var antes=copia(wrap&&wrap._stockItemsOriginales||cli.items||[]),nuevos=copia(items||[]),emp=empresa();
  rutaBusy.add(key);if(wrap)wrap.querySelectorAll("button,input,select").forEach(function(x){x.disabled=true;});
  try{
    conectado();
    if(!opciones&&w._calcularPedidoUnico(cli).generalYaIncluido)nuevos=nuevos.map(function(it){return Object.assign({},it,{sub:+(it.p||0)*+(it.c||0)});});
    var general=opciones?opciones.dscGeneral:(cli.dscGeneral||null);
    var calc=w._calcularPedidoUnico({items:nuevos,dscGeneral:general,tipoComprobante:"remito"});
    var ahorro=calc.ahorroItems+calc.montoDscGen;
    var descuentos=ahorro>0.005?{ahorroItems:calc.ahorroItems,montoDscGen:calc.montoDscGen,ahorroTotal:ahorro,subtotalLista:calc.subtotalLista,dscGenTipo:calc.montoDscGen>0?calc.dscGenTipo:null,dscGenValor:calc.montoDscGen>0?calc.dscGenValor:0}:null;
    var r=await w.sbFetch("POST","/rest/v1/rpc/ruta_editar_items_atomico",{
      p_empresa:emp,p_ruta:rk,p_cliente:ck,p_items:nuevos,p_items_esperados:antes,
      p_total:calc.total,p_importe:w._importeRutaConIVA(rk,ck,calc.total),p_dsc_general:general,p_descuentos:descuentos,
      p_usuario:(w.currentUser||{}).name||(w.currentUser||{}).id||"sistema"
    });
    verificarEmpresa(emp);
    var actual=w.rutasData[rk]&&w.rutasData[rk].clientes&&w.rutasData[rk].clientes[ck];
    if(actual){actual.items=copia(r.items);actual.importe=+r.importe;actual.dscGeneral=r.dscGeneral;actual.auditLog=r.auditLog||actual.auditLog;}
    // Descartar fotos viejas también cuando el próximo refresco quede offline.
    await invalidarTabla("ruta_clientes",emp);await invalidarTabla("backup_pedidos",emp);
    if(w._guardarRutasOffline)w._guardarRutasOffline();
    if(r.pedidoId){var bs=w.getBackups(),bk=bs.find(function(x){return String(x._sbId||x.id)===String(r.pedidoId);});if(bk){bk.items=copia(r.pedidoItems);bk.total=+r.total;bk.totalConIVA=+r.importe;bk.descuentos=r.descuentos;w.saveBackups(bs);}}
    try{await w._stkRefrescar();}catch(e){aviso("Se guardó el cambio. Falta actualizar la vista de stock; tocá Refrescar.","warn");}
    if(w.actualizarVentaDeRuta)try{await w.actualizarVentaDeRuta(rk,ck,+r.importe,r.items);}catch(e){aviso("Pedido guardado; no se pudo actualizar el resumen de ventas.","warn");}
    aviso("Productos y stock guardados juntos.","ok");return true;
  }catch(e){
    aviso(/CAMBIO_CONCURRENTE|DESACTUALIZAD/.test(e.message)?"El pedido cambió en otro dispositivo. Actualizá la ruta y volvé a editarlo.":e.message,e.code==="STOCK_CANCELADO"?"info":"err");return false;
  }finally{
    rutaBusy.delete(key);
    if(wrap)w.renderEditItems(wrap,rk,ck);
    if(w.renderRutas)w.renderRutas();
  }
};
// Cualquier carga antigua de diferencias se deriva al motor atómico.
w.descontarStock=async function(items,motivo){
  if(!w._ctrlStockOn())return;
  var actuales=await w._sbGetStockFull(),patch={};
  (items||[]).forEach(function(it){if(!Number.isSafeInteger(+it.c))throw new Error("Cantidad inválida");var cod=String(it.id);patch[cod]=(patch[cod]===undefined?+(actuales[cod]||0):patch[cod])-Number(it.c);});
  w.stockData=actuales;await ajustarLote(patch);await w._stkRefrescar();
};
w._stkSalidaDirecta=async function(ref,items,motivo){
  if(!w._ctrlStockOn())return {omitido:true,controlStock:false};
  conectado();var arr=w._stkItems(items);if(!arr.length)return null;
  if(!ref)throw new Error("Falta la referencia del movimiento");
  var r=await w.sbFetch("POST","/rest/v1/rpc/stk_confirmar_salida",{p_empresa:empresa(),p_ref:String(ref),p_items:arr,p_usuario:(w.currentUser||{}).name||"sistema",p_motivo:motivo||"Pedido enviado"});
  try{await w._stkRefrescar();}catch(e){aviso("Salida guardada. Actualizá la vista de stock.","warn");}
  return r;
};
w._stkColgAplicar=async function(){
  var lista=w._stkColgadas().filter(function(x){return w._stkColgSel&&w._stkColgSel[x.k];});if(!lista.length)return;
  var btn=document.getElementById("stk-colg-btn");if(btn)btn.disabled=true;
  try{
    await w.sbFetch("POST","/rest/v1/rpc/stock_recuperar_claves_atomico",{p_empresa:empresa(),p_usuario:(w.currentUser||{}).name||"sistema",p_items:lista.map(function(x){return {k:x.k,codigo:x.cod,colgadas:x.colgadas,actual:+((w.stockData||{})[x.cod]||0)};})});
    w._stkColgSel=null;await w._stkRefrescar();w._stkColgRender();aviso("Claves recuperadas en una sola operación.","ok");
  }catch(e){aviso(e.message);}finally{if(btn)btn.disabled=false;}
};
w._stockBorrarPedido=async function(bk){
  var emp=empresa(),id=bk._sbId;if(!id)throw new Error("Sincronizá este pedido antes de borrarlo.");
  await w.sbFetch("POST","/rest/v1/rpc/pedido_borrar_stock_atomico",{p_empresa:emp,p_pedido_id:id,p_items_esperados:copia(bk.items||[]),p_usuario:(w.currentUser||{}).name||"sistema"});
  await invalidarTabla("backup_pedidos",emp);
  w.saveBackups(w.getBackups().filter(function(x){return String(x._sbId||x.id)!==String(id)&&x.id!==bk.id;}));
  if(w.backupAbierto===bk.id)w.backupAbierto=null;
  w.renderBackup();try{await w._stkRefrescar();}catch(e){}
  aviso("Pedido eliminado y stock confirmado.","ok");
};
var style=document.createElement("style");
style.textContent="#confirm-overlay .confirm-card{max-height:90vh;display:flex;flex-direction:column}#confirm-msg{overflow:auto;min-height:0;white-space:pre-line}#confirm-overlay .confirm-btns{flex-shrink:0}";
document.head.appendChild(style);
})(window);
