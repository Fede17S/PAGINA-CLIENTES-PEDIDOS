/* Lectura y presentación: no modifica pedidos, stock, cobros ni el historial guardado. */
(function(root,factory){var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.HistorialRuta=api;})(typeof window!=='undefined'?window:globalThis,function(w){
  'use strict';
  var estados={notificada:'Pendiente del admin',aplicada:'Aprobada',rechazada:'Rechazada',retirada:'Retirada'};
  var etiquetas={importe:'Total del pedido',efectivo:'Efectivo',transferencia:'Transferencia',modo:'Forma de cobro',entregado:'Entregado',entregado_en:'Fecha de entrega',dsc_general:'Descuento general',rechazado:'Rechazo informado',rechazo_confirmado:'Rechazo aprobado',motivo_rechazo:'Motivo del rechazo',ruta_id:'Hoja de ruta',fecha:'Fecha del pedido',reprogramado_de:'Ruta anterior',reprogramado_en:'Fecha de reprogramación',obs:'Observación',lista:'Lista de precios',tipo_comprobante:'Tipo de comprobante',remito_num:'Nº de remito',nom:'Cliente',cliente_id:'ID del cliente',firma:'Firma',comprobantes:'Cantidad de comprobantes'};
  var titulos={notificar_nota:'Devolución informada',aplicar_nota:'Devolución aprobada',rechazar_nota:'Devolución rechazada',retirar_nota:'Aviso retirado',notificar_rechazo:'Rechazo informado',confirmar_rechazo:'Rechazo aprobado',desestimar_rechazo:'Rechazo no aprobado',entrega_reprogramada_sin_stock:'Entrega reprogramada sin devolver stock',movido_ruta:'Pedido movido de ruta',notificada:'Devolución informada',aplicada:'Devolución aprobada',rechazada:'Devolución rechazada'};
  function fecha(x){if(!x)return 'Fecha no registrada';var d=new Date(x);return isNaN(d.getTime())?'Fecha no registrada':d.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'});}
  function pesos(x){return '$'+new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(+x||0);}
  function numero(x){return new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(+x||0);}
  function rol(x){return {admin:'Administrador',repartidor:'Repartidor',vendedor:'Vendedor','co-admin':'Co-administrador',armador:'Armador',sistema:'Sistema'}[x]||x||'Perfil no registrado';}
  function valor(x,campo){
    if(x==null||x==='')return 'Sin dato';
    if(['importe','efectivo','transferencia','monto','p','precio','sub','precioUnit'].indexOf(campo)>=0)return pesos(x);
    if(typeof x==='boolean')return x?'Sí':'No';
    if(campo==='dsc_general'||campo==='disc')return typeof x==='object'?((x.tipo==='$'?pesos(x.valor):numero(x.valor)+'%')):String(x);
    if(['fecha','entregado_en','reprogramado_en'].indexOf(campo)>=0)return fecha(x);
    if(campo==='estado')return estados[x]||String(x);
    if(typeof x==='object')return JSON.stringify(x);
    return String(x);
  }
  function linea(etiqueta,a,b,campo){return etiqueta+': '+valor(a,campo)+' → '+valor(b,campo);}
  function nombre(i){return i.n||i.nombre||i.nom||i.name||i.producto||i.codigo||i.id||'Producto';}
  function cantidad(i){return i.c!=null?i.c:i.cant!=null?i.cant:i.cantidad!=null?i.cantidad:i.qty;}
  function precio(i){return i.p!=null?i.p:i.precio;}
  function clave(i){return String(i.id||i.codigo||i.cod||nombre(i));}
  function igual(a,b){return JSON.stringify(a)===JSON.stringify(b);}
  function detalleItems(a,b){
    var out=[],grupos=new Map();
    (a||[]).forEach(function(i){var k=clave(i);if(!grupos.has(k))grupos.set(k,{a:[],b:[]});grupos.get(k).a.push(i);});
    (b||[]).forEach(function(i){var k=clave(i);if(!grupos.has(k))grupos.set(k,{a:[],b:[]});grupos.get(k).b.push(i);});
    function resumen(i){return nombre(i)+' · '+numero(cantidad(i))+' × '+pesos(precio(i))+(i.sub!=null?' · subtotal '+pesos(i.sub):'');}
    grupos.forEach(function(g){
      if(igual(g.a,g.b))return;
      if(g.a.length>1||g.b.length>1){g.a.forEach(function(i){out.push('Línea anterior: '+resumen(i));});g.b.forEach(function(i){out.push('Línea nueva: '+resumen(i));});return;}
      var x=g.a[0],y=g.b[0];
      if(!x){out.push('Agregado: '+resumen(y));return;}if(!y){out.push('Quitado: '+resumen(x));return;}
      var n=nombre(y);
      var inicio=out.length;
      if(cantidad(x)!==cantidad(y))out.push(linea(n+' · cantidad',cantidad(x),cantidad(y),'cantidad'));
      if(precio(x)!==precio(y))out.push(linea(n+' · precio unitario',precio(x),precio(y),'p'));
      ['sub','disc','ofAplicada','promoAplicada'].forEach(function(k){if(!igual(x[k],y[k]))out.push(linea(n+' · '+({sub:'subtotal',disc:'descuento',ofAplicada:'oferta aplicada',promoAplicada:'promo por cantidad aplicada'}[k]),x[k],y[k],k));});
      if(nombre(x)!==nombre(y))out.push(linea('Nombre del producto',nombre(x),nombre(y),'nombre'));
      if(out.length===inicio)out.push('Detalle actualizado: '+resumen(y));
    });
    return out.length?out:['Se reorganizaron o actualizaron las líneas del pedido.'];
  }
  function detalleNotas(a,b){
    var out=[];function key(n){return n.id||[n.ts,n.codigo,n.producto,n.cantidad,n.motivo].join('|');}
    var map=new Map((a||[]).map(function(n){return [key(n),n];})),seen=new Set();
    (b||[]).forEach(function(n){var k=key(n),old=map.get(k);if(!old&&n.id){var legados=(a||[]).filter(function(x){return !x.id&&x.ts===n.ts&&x.codigo===n.codigo&&x.producto===n.producto&&x.cantidad===n.cantidad;});if(legados.length===1){old=legados[0];seen.add(key(old));}}seen.add(k);if(igual(old,n))return;
      if(n.stockAbsorbidoPorRechazo){out.push(nombre(n)+': nota cerrada por rechazo completo; el stock se resolvió con el pedido, sin duplicar la devolución.');return;}
      if(!old)out.push('Aviso de '+({rotura:'rotura',faltante:'faltante',devolucion:'devolución'}[n.motivo]||n.motivo||'devolución')+': '+nombre(n)+' · '+numero(n.cantidad)+' u. · '+(estados[n.estado]||n.estado||'Estado anterior no registrado'));
      else ['estado','cantidad','monto','nota','stkDev'].forEach(function(c){if(!igual(old[c],n[c]))out.push(linea(nombre(n)+' · '+({estado:'decisión',cantidad:'cantidad',monto:'importe de la nota',nota:'motivo / comentario',stkDev:'mercadería devuelta al stock'}[c]),old[c],n[c],c));});
      if(!old&&n.monto!=null)out.push('Importe informado de la nota: '+pesos(n.monto)+(n.estado==='notificada'?' (pendiente de aprobación)':''));
      if(n.estado==='aplicada'&&(!old||old.estado!=='aplicada')&&n.motivo==='rotura')out.push('Rotura aprobada: la mercadería rota no vuelve al stock.');
    });
    (a||[]).forEach(function(n){if(!seen.has(key(n)))out.push('Nota quitada: '+nombre(n)+' · '+numero(n.cantidad)+' u.');});return out;
  }
  function detalles(cambios){var out=[];(cambios||[]).forEach(function(c){
    if(c.campo==='items')out=out.concat(detalleItems(c.antes,c.despues));
    else if(c.campo==='devoluciones')out=out.concat(detalleNotas(c.antes,c.despues));
    else if(c.campo==='pagos_adicionales'){
      var old=c.antes||[],nuevo=c.despues||[];
      old.forEach(function(p){if(!nuevo.some(function(q){return igual(p,q);}))out.push('Pago anterior quitado o corregido: '+pesos(p.monto)+' · '+(p.forma||'Sin forma')+(p.nota?' · '+p.nota:''));});
      nuevo.forEach(function(p){if(!old.some(function(q){return igual(p,q);}))out.push('Pago agregado: '+pesos(p.monto)+' · '+(p.forma||'Sin forma')+(p.nota?' · '+p.nota:''));});
    }else out.push(linea(etiquetas[c.campo]||c.campo,c.antes,c.despues,c.campo)+(c.reemplazada?' (reemplazada)':''));
  });return out;}
  function eventos(cli){
    var log=(cli.auditLog||cli.audit_log||[]).filter(function(e){return e&&!e.complementadoPor;});
    var out=log.map(function(e){return {id:e.id||[e.ts||e.fecha,e.quien||e.por,e.desc||e.accion].join('|'),ts:e.ts||e.fecha,quien:e.quien||e.nombre||e.por||e.usuario||'Usuario no registrado',uid:e.uid||e.por||'',rol:rol(e.rol),origen:e.origen||'Sección no registrada',titulo:e.cambios&&e.cambios.length?(e.cambios.some(function(c){return c.campo==='items';})?'Productos del pedido modificados':e.cambios.some(function(c){return c.campo==='devoluciones';})?'Devolución / rotura actualizada':e.cambios.some(function(c){return c.campo==='rechazo_confirmado';})?'Decisión del rechazo registrada':e.cambios.some(function(c){return c.campo==='efectivo'||c.campo==='transferencia'||c.campo==='pagos_adicionales';})?'Cobro actualizado':e.cambios.some(function(c){return c.campo==='ruta_id';})?'Pedido movido o reprogramado':'Pedido actualizado'):(e.desc||titulos[e.accion]||'Modificación registrada'),detalle:detalles(e.cambios),verificado:e.servidor===true&&e.verificado===true};});
    (cli.devoluciones||[]).forEach(function(n){(n.historial||[]).forEach(function(h){
      var cubierto=log.some(function(e){return Math.abs(Date.parse(e.ts||e.fecha||'')-Date.parse(h.ts||''))<2500&&(e.cambios||[]).some(function(c){return c.campo==='devoluciones'&&(c.despues||[]).some(function(x){return n.id?x.id===n.id:x.producto===n.producto&&x.ts===n.ts;});});});
      if(!cubierto)out.push({id:'nota|'+(n.id||n.ts||'')+'|'+h.accion+'|'+h.ts,ts:h.ts,quien:h.por||'Usuario no registrado',uid:h.por||'',rol:rol(h.rol),origen:'Notas de devolución',titulo:(titulos[h.accion]||h.accion||'Evento de devolución')+' · '+nombre(n),detalle:h.nota?[h.nota]:[],verificado:false});
    });});
    var vistos=new Set();return out.filter(function(e){if(vistos.has(e.id))return false;vistos.add(e.id);return true;}).sort(function(a,b){return (Date.parse(b.ts)||0)-(Date.parse(a.ts)||0);});
  }
  function nodo(tag,text,cl){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(cl)e.className=cl;return e;}
  function dibujarCuerpo(body,lista){body.replaceChildren();var hasta=0;
    function mas(){var fin=Math.min(hasta+20,lista.length);for(;hasta<fin;hasta++){var e=lista[hasta],card=nodo('article',null,'rh-evento');card.append(nodo('strong',e.titulo),nodo('div',fecha(e.ts),'rh-meta'),nodo('div',e.quien+(e.uid&&e.uid!==e.quien?' · ID '+e.uid:'')+' · '+e.rol+' · '+e.origen,'rh-meta'));
      if(!e.verificado)card.append(nodo('div','Registro anterior / identidad no verificada por el servidor','rh-legado'));
      if(e.detalle.length){var ul=nodo('ul');e.detalle.forEach(function(x){ul.append(nodo('li',x));});card.append(ul);}else card.append(nodo('div','El registro anterior no guardó valores antes y después.','rh-meta'));body.append(card);
    }if(hasta<lista.length){var btn=nodo('button','Ver más cambios ('+(lista.length-hasta)+')','btn btn-ghost btn-sm');btn.type='button';btn.onclick=function(){btn.remove();mas();};body.append(btn);}}
    if(!lista.length)body.append(nodo('p','Todavía no hay modificaciones registradas.','rh-meta'));else mas();
  }
  async function actualizar(rk,ck){
    if(!w._sbEmpId||!navigator.onLine)return null;var empresa=w._sbEmpId;
    var rows=await w.sbFetch('GET','/rest/v1/ruta_clientes?select=id,empresa_id,audit_log,devoluciones&id=eq.'+encodeURIComponent(ck)+'&empresa_id=eq.'+encodeURIComponent(empresa));
    if(w._sbEmpId!==empresa||!rows||!rows[0]||String(rows[0].empresa_id)!==String(empresa))return null;
    var c=w.rutasData&&w.rutasData[rk]&&w.rutasData[rk].clientes&&w.rutasData[rk].clientes[ck];
    if(c)c.auditLog=rows[0].audit_log||[];return {auditLog:rows[0].audit_log||[],devoluciones:rows[0].devoluciones||[]};
  }
  function pintar(wrap,cli,rk,ck){
    var panel=nodo('details',null,'rh-panel'),summary=nodo('summary','📋 Historial de modificaciones · '+eventos(cli).length),body=nodo('div',null,'rh-cuerpo');
    var estado=nodo('div','Se registran los cambios confirmados. Los pendientes sin conexión aparecen al sincronizar.','rh-meta');
    panel.append(summary,estado,body);wrap.replaceChildren(panel);dibujarCuerpo(body,eventos(cli));var cargado=false;
    panel.addEventListener('toggle',async function(){if(!panel.open||cargado)return;cargado=true;if(!navigator.onLine){estado.textContent='Sin conexión: se muestra el historial guardado en este dispositivo.';return;}
      estado.textContent='Actualizando historial…';try{var actual=await actualizar(rk,ck);if(!actual){estado.textContent='No se pudo confirmar el historial más reciente.';cargado=false;return;}if(!panel.isConnected)return;var ev=eventos(actual);summary.textContent='📋 Historial de modificaciones · '+ev.length;dibujarCuerpo(body,ev);estado.textContent='Historial confirmado · actualizado '+fecha(new Date());}catch(e){estado.textContent='No se pudo actualizar. Se conserva el historial guardado; cerrá y abrí para reintentar.';cargado=false;}
    });return panel;
  }
  if(typeof document!=='undefined'){
    var style=document.createElement('style');style.textContent='.rh-panel{font-size:12px;text-align:left}.rh-panel summary{font-weight:800;cursor:pointer;padding:10px 0;min-height:44px}.rh-cuerpo{max-height:420px;overflow:auto;overscroll-behavior:contain}.rh-evento{padding:12px 0;border-bottom:1px solid var(--border);overflow-wrap:anywhere}.rh-evento strong{display:block;font-size:12px}.rh-evento ul{margin:8px 0;padding-left:18px}.rh-evento li{margin:5px 0;line-height:1.5}.rh-meta{font-size:11px;color:var(--muted);margin-top:4px;line-height:1.5}.rh-legado{font-size:10px;color:var(--muted);margin-top:3px}';document.head.append(style);
  }
  return {eventos:eventos,detalles:detalles,detalleItems:detalleItems,pintar:pintar,actualizar:actualizar,fecha:fecha};
});
