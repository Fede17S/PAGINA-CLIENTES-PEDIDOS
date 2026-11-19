/* Compras: sólo lectura y exportación. No crea pedidos ni movimientos de stock. */
(function(root,factory){var api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;else root.PedidosProveedorV2=api;})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  function num(v){return v==null||v===''||typeof v==='boolean'?null:(Number.isFinite(Number(v))?Number(v):null);}
  function money(n){return Math.round((n+Number.EPSILON)*100)/100;}
  function fmt(n){return new Intl.NumberFormat('es-AR',{maximumFractionDigits:3}).format(n);}
  function pesos(n){return '$'+new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function telefono(v){
    var s=String(v||'').trim();if(!s||/[a-z]/i.test(s))return '';
    var n=s.replace(/\D/g,'');if(s.indexOf('00')===0)n=n.slice(2);
    if(s[0]==='+'||s.indexOf('00')===0)return /^[1-9]\d{7,14}$/.test(n)?n:'';
    if(/^54\d{10,11}$/.test(n))return n;
    n=n.replace(/^0/,'').replace(/^15/,'');return /^\d{10}$/.test(n)?'549'+n:'';
  }
  function indice(catalogo){
    var map=new Map();Object.keys(catalogo||{}).forEach(function(k){var p=catalogo[k];if(!p||typeof p!=='object')return;
      [k,p.id,p.codigo].forEach(function(a){if(a==null||a==='')return;a=String(a);if(map.has(a)&&map.get(a)!==p)map.set(a,null);else if(!map.has(a))map.set(a,p);});
    });return map;
  }
  function preparar(productos,catalogo,proveedores){
    var idx=indice(catalogo),prov=new Map();(proveedores||[]).forEach(function(p){if(p&&p.id!=null)prov.set(String(p.id),p);});
    var rows=(productos||[]).map(function(raw){
      var p=raw.id==null?null:idx.get(String(raw.id)),pid=p&&(p.proveedorId||p.proveedor_id),id=pid==null?'':String(pid),supplier=prov.get(id)||null;
      var cant=num(raw.cant),venta=num(raw.total),modo=p&&(p.vendePor||p.vende_por),medidaGuardada=typeof raw.esPeso==='boolean';
      var esPeso=raw.esPeso===true||(!medidaGuardada&&modo==='peso');
      var conflictoMedida=!!(p&&modo&&medidaGuardada&&esPeso!==(modo==='peso'));
      var costo=p?num(p.precioBase!==undefined?p.precioBase:p.precio_base):null;
      if(!(costo>0)||conflictoMedida)costo=null; // 0/vacío no es "gratis" ni precio de venta.
      var ub=p?num(p.unidadesBulto!==undefined?p.unidadesBulto:p.unidades_bulto):num(raw._ub);
      if(!Number.isInteger(ub)||ub<=1||esPeso||conflictoMedida)ub=null;
      var tipo=p&&(p.unidadBulto||p.unidad_bulto)||'bulto',equiv='';
      if(esPeso)equiv=fmt(cant||0)+' kg';
      else if(ub){var packs=Math.floor((cant||0)/ub),resto=Math.round(((cant||0)-packs*ub)*1e6)/1e6;
        equiv=fmt(packs)+' '+tipo+(packs!==1?'s':'')+' x'+ub+(resto?' + '+fmt(resto)+' u sueltas':'');
        if(!p)equiv+=' · referencia del pedido, revisar';
      }else equiv='Sin equivalencia de bulto';
      return {id:raw.id==null?'':String(raw.id),n:String(raw.n||p&&p.nombre||'?'),cant:cant==null?0:cant,total:venta==null?0:venta,
        esPeso:esPeso,provId:id,provNombre:supplier?String(supplier.nombre||'Proveedor'):id?'Proveedor sin ficha':'Sin proveedor asignado',
        telefono:supplier?(telefono(supplier.whatsapp)||telefono(supplier.telefono)):'',costoUnitario:costo,
        costoCompra:costo==null||cant==null||cant<0?null:money(costo*cant),unidadesBulto:ub,unidadBulto:String(tipo),equivalencia:equiv,
        sinProducto:!p,advertencia:cant==null||cant<0?'Cantidad inválida; revisar pedido':conflictoMedida?'La medida del pedido no coincide con el catálogo; revisar costo':!p?'Producto sin coincidencia única en el catálogo':costo==null?'Falta precio base de compra':''};
    });
    var grupos=new Map();rows.forEach(function(r){var key=r.provId||'__sin__';if(!grupos.has(key))grupos.set(key,{key:key,id:r.provId,nombre:r.provNombre,telefono:r.telefono,rows:[]});grupos.get(key).rows.push(r);});
    return {rows:rows,grupos:Array.from(grupos.values()).sort(function(a,b){return a.key==='__sin__'?1:b.key==='__sin__'?-1:a.nombre.localeCompare(b.nombre,'es');})};
  }
  function resumen(rows){return (rows||[]).reduce(function(s,r){s.venta+=r.total;s.faltantes+=r.costoCompra==null?1:0;if(r.costoCompra!=null){s.compra+=r.costoCompra;s.conCosto++;}if(r.esPeso)s.kg+=r.cant;else s.unidades+=r.cant;return s;},{venta:0,compra:0,faltantes:0,conCosto:0,unidades:0,kg:0});}
  function cantidades(rows){var s=resumen(rows),parts=[];if(s.unidades)parts.push(fmt(s.unidades)+' unidades');if(s.kg)parts.push(fmt(s.kg)+' kg');return parts.join(' · ')||'0 unidades';}
  function texto(grupo,empresa,fecha){
    var lines=['🛒 *Pedido al proveedor*','De: '+(empresa||'Distribuidora'),'Para: '+grupo.nombre,'Fecha: '+(fecha||new Date().toLocaleDateString('es-AR')),''];
    grupo.rows.forEach(function(r){lines.push('• '+r.n+(r.id?' ('+r.id+')':'')+' — *'+fmt(r.cant)+(r.esPeso?' kg':'u')+'*'+(r.unidadesBulto?' · '+r.equivalencia:''));});
    lines.push('','Total: '+grupo.rows.length+' productos · '+cantidades(grupo.rows));
    return lines.join('\n'); // Ni ventas, ni costos, ni notas/datos privados de clientes.
  }
  function csv(rows){
    var lines=[['Proveedor','Codigo','Producto','Cantidad solicitada','Medida','Unidades por bulto','Equivalencia','Costo compra por unidad o kg','Subtotal compra referencia','Importe venta lineas','Aviso']];
    rows.forEach(function(r){lines.push([r.provNombre,r.id,r.n,r.cant,r.esPeso?'kg':'unidad',r.unidadesBulto||'',r.equivalencia,r.costoUnitario==null?'':r.costoUnitario,r.costoCompra==null?'':r.costoCompra,r.total,r.advertencia]);});
    return '\uFEFF'+lines.map(function(row){return row.map(function(v){var s=String(v==null?'':v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}).join(';');}).join('\r\n');
  }
  function estilos(){if(!root.document||root.document.getElementById('pp-v2-style'))return;var s=root.document.querySelector('script[src*="pedidos-proveedor-v2.js"]'),link=root.document.createElement('link');link.id='pp-v2-style';link.rel='stylesheet';link.href=new URL('pedidos-proveedor-v2.css?v=20261119-1',s?s.src:root.location.href).href;root.document.head.appendChild(link);}
  function identidad(){return [String(root._sbEmpId||''),String(root.empresaKey||''),String(root.currentUser&&(root.currentUser.uid||root.currentUser.id)||'')].join('|');}
  function valida(s){if(s&&s.identidad===identidad()&&states[s.scope]===s)return true;root.showNotif('La sesión, empresa o selección cambió. Volvé a abrir el consolidado.','warn');return false;}
  var states={modal:null,periodo:null};
  function crear(modelo,scope,observaciones){return {modelo:modelo,scope:scope,observaciones:observaciones||[],identidad:identidad()};}
  function costoHTML(rows){var s=resumen(rows);return '<div class="pp-totales"><div class="pp-compra"><span>Costo de compra de referencia</span><strong>'+(s.conCosto?pesos(money(s.compra)):'A completar')+'</strong><small>'+(s.faltantes?'Parcial · '+s.faltantes+' producto(s) sin costo':'Precio base × cantidad solicitada')+'</small></div><div><span>Importe de venta de las líneas</span><strong>'+pesos(money(s.venta))+'</strong><small>No es el costo al proveedor</small></div></div>';}
  function grupoHTML(g,i){var s=resumen(g.rows);return '<section class="pp-grupo" data-pp-grupo="'+i+'"><div class="pp-grupo-head"><div><h3>'+esc(g.nombre)+'</h3><p>'+g.rows.length+' productos · '+esc(cantidades(g.rows))+'</p><small>'+(g.telefono?'WhatsApp +'+esc(g.telefono):'Sin WhatsApp válido: podrás elegir el contacto')+'</small></div><div class="pp-actions"><button type="button" data-pp-wa="'+i+'">💬 WhatsApp</button><button type="button" data-pp-copy="'+i+'">📋 Copiar</button><button type="button" data-pp-csv="'+i+'">📄 CSV</button></div></div>'+costoHTML(g.rows)+
      '<div class="pp-productos">'+g.rows.map(function(r){return '<article class="pp-fila"><div class="pp-producto"><small>'+esc(r.id||'Sin código')+'</small><b>'+esc(r.n)+'</b></div><div class="pp-cantidad"><b>'+esc(fmt(r.cant)+(r.esPeso?' kg':' u'))+'</b><small>'+esc(r.equivalencia)+'</small></div><div class="pp-costo"><span>Compra '+(r.costoUnitario==null?'sin costo':pesos(r.costoUnitario)+(r.esPeso?'/kg':'/u'))+'</span><b>'+(r.costoCompra==null?'A completar':pesos(r.costoCompra))+'</b><small>Venta: '+pesos(r.total)+'</small></div>'+(r.advertencia?'<p class="pp-aviso">⚠ '+esc(r.advertencia)+'</p>':'')+'</article>';}).join('')+'</div></section>';}
  function pintar(host,s,filtro){
    if(!host)return false;estilos();var model=s.modelo;
    if(filtro&&!model.grupos.some(function(g){return g.key===filtro;})){filtro='';if(s.scope==='modal')root._paConsolFiltro='';else root._paPeriodoProvV2='';}
    var grupos=model.grupos.filter(function(g){return !filtro||g.key===filtro;}),rows=grupos.reduce(function(a,g){return a.concat(g.rows);},[]);
    s.grupos=grupos;s.rows=rows;s.host=host;
    host.classList.add('pp-v2');
    host.innerHTML='<div class="pp-toolbar"><label>Proveedor<select id="'+(s.scope==='modal'?'consol-prov-filtro':'pp-periodo-proveedor')+'" aria-label="Filtrar proveedor"><option value="">Todos los proveedores · pedidos separados</option>'+model.grupos.map(function(g){return '<option value="'+esc(g.key)+'"'+(filtro===g.key?' selected':'')+'>'+esc(g.nombre)+'</option>';}).join('')+'</select></label><button type="button" data-pp-refresh>↻ Actualizar costos y contactos</button></div>'+costoHTML(rows)+
      '<p class="pp-nota">Referencia del catálogo cargado (precio base). Sin IVA adicional, flete ni descuentos del proveedor. Las cantidades no se redondean ni modifican el stock.</p>'+
      (grupos.length?grupos.map(grupoHTML).join(''):'<p class="pp-nota">No hay productos para este filtro.</p>')+
      (s.observaciones.length?'<details class="pp-notas"><summary>Observaciones internas de clientes ('+s.observaciones.length+')</summary><p>No se incluyen automáticamente en los mensajes a proveedores.</p>'+s.observaciones.map(function(o){return '<p><b>'+esc(o.cliente||'Cliente')+':</b> '+esc(o.obs)+'</p>';}).join('')+'</details>':'');
    if(s.scope==='modal')root._paSelProds=rows;
    host.querySelector('select').addEventListener('change',function(e){if(!valida(s))return;if(s.scope==='modal'){root._paConsolFiltro=e.target.value;pintarModal();}else{root._paPeriodoProvV2=e.target.value;pintarPeriodo(root._paConsolidar());}});
    host.querySelectorAll('[data-pp-wa]').forEach(function(b){b.onclick=function(){enviar(s,grupos[+b.dataset.ppWa]);};});
    host.querySelectorAll('[data-pp-copy]').forEach(function(b){b.onclick=function(){copiar(s,grupos[+b.dataset.ppCopy]);};});
    host.querySelectorAll('[data-pp-csv]').forEach(function(b){b.onclick=function(){if(valida(s))descargar(grupos[+b.dataset.ppCsv].rows);};});
    host.querySelector('[data-pp-refresh]').onclick=async function(){
      if(!valida(s))return;var b=this;b.disabled=true;b.textContent='Actualizando…';
      try{var leerProv=typeof root._sbGetRaw==='function'?root._sbGetRaw('proveedores','select=*&empresa_id=eq.'+encodeURIComponent(root._sbEmpId)+'&order=nombre.asc'):root._sbGetProveedores();
        var data=await Promise.all([root._sbGetProductos(true,{soloRed:true}),leerProv]);
        if(!valida(s))return;if(!data[0]||!Array.isArray(data[1]))throw Error('Datos no disponibles');
        root._prodData=data[0];root._provData=data[1];
        if(s.scope==='modal')pintarModal();else pintarPeriodo(root._paConsolidar());root.showNotif('Costos y contactos actualizados','ok');
      }catch(e){if(s.identidad===identidad())root.showNotif('No se pudo actualizar. Se conserva la referencia anterior.','warn');}
      finally{b.disabled=false;b.textContent='↻ Actualizar costos y contactos';}
    };
    return true;
  }
  function pintarModal(){var s=crear(preparar(root._paConsolTodos,root._prodData,root._provData),'modal',root._paSelObs);states.modal=s;return pintar(root.document.getElementById('consol-sel-body'),s,root._paConsolFiltro||'');}
  function pintarPeriodo(prods){var s=crear(preparar(prods,root._prodData,root._provData),'periodo',[]);states.periodo=s;return pintar(root.document.getElementById('pedidos-consol-list'),s,root._paPeriodoProvV2||'');}
  function lanzar(url){
    var native=!!(root.Capacitor&&typeof root.Capacitor.isNativePlatform==='function'&&root.Capacitor.isNativePlatform());
    if(native||/Android|iPhone|iPad|iPod/i.test(root.navigator.userAgent||'')){root._cc2AbrirWhatsAppSeguro(url);return;}
    var a=root.document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';root.document.body.appendChild(a);a.click();a.remove();
    root.showNotif('WhatsApp preparado. Revisá el pedido antes de enviarlo.','ok');
  }
  function enviar(s,g){if(!valida(s)||!g)return;var msg=texto(g,root.empresaData&&root.empresaData.nombre);lanzar('https://wa.me/'+g.telefono+'?text='+encodeURIComponent(msg));}
  function copiar(s,g){if(!valida(s))return;var grupos=g?[g]:s.grupos;if(!grupos.length){root.showNotif('No hay productos para copiar','warn');return;}
    var txt=grupos.map(function(x){return texto(x,root.empresaData&&root.empresaData.nombre);}).join('\n\n──────────\n\n');
    function fallback(){var prev=root.document.activeElement,t=root.document.createElement('textarea'),ok=false;t.value=txt;t.style.cssText='position:fixed;top:0;opacity:0;font-size:16px';root.document.body.appendChild(t);
      try{t.focus();t.select();t.setSelectionRange(0,txt.length);ok=!!root.document.execCommand('copy');}catch(e){}finally{t.remove();if(prev&&prev.focus)prev.focus({preventScroll:true});}
      root.showNotif(ok?'Pedido copiado':'No se pudo copiar. Usá WhatsApp o CSV.',ok?'ok':'warn');}
    try{if(root.navigator.clipboard&&root.navigator.clipboard.writeText)return root.navigator.clipboard.writeText(txt).then(function(){root.showNotif('Pedido copiado','ok');}).catch(fallback);}catch(e){}fallback();
  }
  function descargar(rows){if(!rows.length){root.showNotif('No hay productos para exportar','warn');return;}var blob=new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=root.document.createElement('a');
    var nombre=rows.every(function(r){return r.provId===rows[0].provId;})?rows[0].provNombre:'todos-los-proveedores';
    nombre=String(nombre).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,50);
    a.href=url;a.download='pedido-'+nombre+'-'+new Date().toISOString().slice(0,10)+'.csv';root.document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  var pickerOverflow=null;
  function cerrarSelector(){var m=root.document.getElementById('pp-wa-selector');if(m)m.remove();if(pickerOverflow!==null){root.document.body.style.overflow=pickerOverflow;pickerOverflow=null;}}
  function compartirSeleccion(){var s=states.modal;if(!s||!valida(s))return;if(!s.grupos.length){root.showNotif('No hay productos para compartir','warn');return;}if(s.grupos.length===1){enviar(s,s.grupos[0]);return;}
    cerrarSelector();var m=root.document.createElement('div');m.id='pp-wa-selector';m.className='modal-bg open pp-v2';m.style.zIndex='100100';m.setAttribute('role','dialog');m.setAttribute('aria-modal','true');m.setAttribute('aria-label','Elegir proveedor para WhatsApp');
    var previo=root.document.activeElement;pickerOverflow=root.document.body.style.overflow;root.document.body.style.overflow='hidden';m.innerHTML='<div class="modal-box pp-picker"><div class="modal-head"><b>Elegí el proveedor</b><button type="button" class="modal-cls" aria-label="Cerrar selector">✕</button></div><p>Se abre un pedido por vez, sólo con los productos de ese proveedor. El envío lo confirmás en WhatsApp.</p><div class="pp-picker-list">'+s.grupos.map(function(g,i){return '<button type="button" data-pp-send="'+i+'"><b>'+esc(g.nombre)+'</b><span>'+g.rows.length+' productos · '+esc(cantidades(g.rows))+'</span></button>';}).join('')+'</div></div>';
    function close(){cerrarSelector();if(previo&&previo.isConnected)previo.focus({preventScroll:true});}
    m.querySelector('.modal-cls').onclick=close;m.onclick=function(e){if(e.target===m)close();};m.onkeydown=function(e){if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){var buttons=Array.from(m.querySelectorAll('button')),first=buttons[0],last=buttons[buttons.length-1];if(e.shiftKey&&root.document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&root.document.activeElement===last){e.preventDefault();first.focus();}}};
    m.querySelectorAll('[data-pp-send]').forEach(function(b){b.onclick=function(){enviar(s,s.grupos[+b.dataset.ppSend]);close();};});root.document.body.appendChild(m);m.querySelector('button').focus();
  }
  function copiarSeleccion(){if(states.modal)return copiar(states.modal);}
  function csvSeleccion(){if(states.modal&&valida(states.modal))descargar(states.modal.rows);}
  return {preparar:preparar,resumen:resumen,texto:texto,csv:csv,telefono:telefono,pintarModal:pintarModal,pintarPeriodo:pintarPeriodo,compartirSeleccion:compartirSeleccion,copiarSeleccion:copiarSeleccion,csvSeleccion:csvSeleccion};
});
