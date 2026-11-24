/* Avisos de sincronización: detalle, ocultar, archivo local y reporte voluntario. */
(function(w){
  'use strict';
  var TELEFONO='5492805065662',open=false,previousFocus=null,previousOverflow='',modalScope='';
  function emp(){return String(w._sbEmpId||w.empresaKey||'sin-empresa');}
  function usr(){var u=w.currentUser||{};return String(u.id||u.uid||u._sbId||'sin-usuario');}
  function scope(){return emp()+'|'+usr();}
  function canArchive(){var u=w.currentUser||{};return [u.role].concat(u.roles||[]).some(function(r){return r==='admin'||r==='co-admin';});}
  function rutaQueue(){return Array.isArray(w._offlineQueue)?w._offlineQueue:[];}
  function queue(){return rutaQueue().concat(typeof w._bkQueueGet==='function'?w._bkQueueGet():[]);}
  function key(kind){return 'distribix:sync:'+kind+':'+emp()+(kind==='oculto'?':'+usr():'');}
  function notify(t,error){if(typeof w.showNotif==='function')w.showNotif(t,error?'err':'ok');}
  function scrub(value,max){
    return String(value==null?'':value)
      .replace(/(?:failing row contains|fila que falla contiene)[\s\S]*/ig,'[contenido de fila omitido]')
      .replace(/\bBearer\s+[^\s,;]+/ig,'Bearer [oculto]')
      .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[token oculto]')
      .replace(/(["']?(?:password|pass|clave|token|authorization|apikey|secret|cookie|cbu|cuit|alias)["']?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;\n}]+)/ig,'$1[oculto]')
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig,'[correo oculto]')
      .replace(/\+54[\d .()-]{9,20}\d/g,'[teléfono oculto]')
      .replace(/\b0?\d{2,4}[\s-]\d{3}[\s-]\d{4}\b/g,'[teléfono oculto]')
      .replace(/\b\d{10,15}\b/g,'[número oculto]')
      .replace(/(Key\s*\(([^)]+)\)\s*=\s*)\(([^)]*)\)/ig,function(all,prefix,columns){return /^(?:id|ruta_id|pedido_id|empresa_id)(?:\s*,\s*(?:id|ruta_id|pedido_id|empresa_id))*$/.test(columns.trim())?all:prefix+'([valor omitido])';})
      .replace(/file:\/\/\/[^\s)]+/ig,'[archivo local]')
      .replace(/(https?:\/\/[^\s?#)]+)\?[^\s)]+/ig,'$1?[parámetros omitidos]')
      .slice(0,max||2400);
  }
  function endpoint(op,error){
    var path=String(error&&error.endpoint||op.path||'').split('?')[0];
    if(/^\/rest\/v1\//.test(path))return scrub(path,180);
    if(op.method==='ROUTE_MOVE')return 'ruta_clientes → rutas / backup_pedidos';
    if(/^[a-z_]+$/i.test(path))return '/rest/v1/'+path;
    var parts=path.split('/').filter(Boolean);
    return parts.includes('clientes')?'ruta_clientes':parts.includes('rutas')?'rutas':scrub(parts[0]||'operación local',100);
  }
  function detail(op,error){
    var old=op.errorDetalle||{},message=scrub(error&&error.message||op.ultimoError||old.mensaje||'Aún no hay un error registrado.');
    return {mensaje:message,codigo:scrub(error&&error.code||old.codigo||'',80),http:Number(error&&error.status||old.http||0)||0,
      detalles:scrub(error&&error.details||old.detalles||''),sugerencia:scrub(error&&error.hint||old.sugerencia||''),
      solicitud:scrub(error&&error.requestId||old.solicitud||'',160),metodo:scrub(error&&error.method||op.method||'',40),
      destino:endpoint(op,error||{endpoint:old.destino}),fecha:error?new Date().toISOString():(old.fecha||op.ultimoIntento||op.ts||''),
      pila:error?scrub(String(error.stack||'').split('\n').slice(1,7).join('\n'),1800):(old.pila||'')};
  }
  function permanent(d){return [400,401,403,404,409,422].includes(d.http)||/^(?:22|23|28|42)\w{3}$/.test(d.codigo)||/violates foreign key|violates unique constraint|permission denied|sesión venció/i.test(d.mensaje);}
  function stock(op){return !!(w.StockSeguro&&w.StockSeguro.esDiferida(op));}
  function registrar(op,error){
    var d=detail(op,error);op.errorDetalle=d;op.ultimoError=d.mensaje.slice(0,280);
    if(permanent(d)&&!stock(op))op.pausaSincronizacion=true;
  }
  function explain(op){
    var d=detail(op);
    if(op.method==='PEDIDO_LOCAL'){
      if(d.codigo==='STOCK_INSUFICIENTE'||d.codigo==='PEDIDO_NO_DISPONIBLE')return 'El servidor no confirmó el stock o la disponibilidad. No se emitió el remito. El pedido sigue guardado; revisá con administración antes de reintentar.';
      if(op.pausaSincronizacion)return 'El pedido sigue guardado en el teléfono. Revisá el detalle y reintentá cuando se resuelva el problema.';
      return 'Pedido guardado en este teléfono. Se enviará con los mismos productos y precios cuando vuelva la conexión.';
    }
    if(stock(op))return 'Movimiento antiguo de productos o stock. Está detenido para revisión manual; no se aplicará automáticamente.';
    if(d.codigo==='23503'||/foreign key/i.test(d.mensaje))return /ruta_clientes_ruta_id_fkey|ruta_id/i.test(d.mensaje+' '+d.detalles)
      ?'La hoja de ruta de destino ya no existe o no está disponible. Actualizá las rutas y revisá el destino antes de reintentar.'
      :'El cambio hace referencia a un registro que no existe o ya no está disponible. Requiere revisar los datos relacionados.';
    if([401,403].includes(d.http)||/sesión venc|permission denied/i.test(d.mensaje))return 'La sesión o los permisos no permiten guardar este cambio. Volvé a ingresar o pedí revisión a administración.';
    if(d.codigo==='23505')return 'Hay un conflicto con un registro existente. No conviene repetir altas sin revisar para evitar duplicados.';
    if(!navigator.onLine||/timeout|fetch|network|conexión|connection/i.test(d.mensaje))return 'Puede haber un problema de conexión. El cambio continúa guardado localmente y todavía debe confirmarse en el servidor.';
    return 'El cambio no pudo confirmarse por completo. Revisá el detalle técnico; puede haber pasos ya guardados. No se marca como realizado solo por cerrar este aviso.';
  }
  function signature(){return JSON.stringify([navigator.onLine,queue().map(function(op){var d=detail(op);return [op.id,d.codigo,d.http,d.mensaje,!!op.pausaSincronizacion,!!op.requiereRevision];})]);}
  function aplicarBanner(){
    var banner=document.getElementById('offline-banner');if(!banner)return;
    try{if(localStorage.getItem(key('oculto'))===signature())banner.style.display='none';}catch(e){}
    var btn=document.getElementById('cuenta-sync-avisos');if(btn)btn.textContent='☁️ Sincronización y errores'+(queue().length?' · '+queue().length+' pendientes':'');
  }
  function hide(){
    try{localStorage.setItem(key('oculto'),signature());}catch(e){notify('No se pudo recordar que ocultaste el aviso.',true);}
    var banner=document.getElementById('offline-banner');if(banner)banner.style.display='none';
  }
  function report(op){
    var d=detail(op),version=(document.getElementById('app-version-tag')||{}).textContent||'sin versión';
    var active=queue().some(function(x){return x.id===op.id;}),archived=archives().some(function(x){return x.op&&x.op.id===op.id;});
    var output=['DISTRIBIX — REPORTE DE SINCRONIZACIÓN','ID: '+scrub(op.id,100),'Fecha: '+d.fecha,
      'Empresa: '+scrub(emp(),100),'Perfil que reporta: '+scrub(usr(),80),'Versión: '+scrub(version,150),
      'Sección: '+scrub(w._tabActual||'no indicada',80),'Conexión: '+(navigator.onLine?'con conexión':'sin conexión'),
      'Método: '+d.metodo,'Destino: '+d.destino,'HTTP: '+(d.http||'no registrado'),'Código: '+(d.codigo||'no registrado'),
      'Mensaje: '+d.mensaje,'Detalle: '+(d.detalles||'no registrado'),'Sugerencia: '+(d.sugerencia||'no registrada'),
      'Solicitud: '+(d.solicitud||'no registrada'),'Intentos: '+Number(op.intentos||0),
      'Pendiente desde: '+String(op.ts||'no registrado'),'Estado: '+(!active?(archived?'archivado localmente; no confirmado por esta acción':'fuera de la cola actual; revisar resultado'):(op.pausaSincronizacion||op.requiereRevision?'detenido para revisión':'pendiente de confirmación')),
      d.pila?'Ubicación técnica:\n'+d.pila:'','Nota: omite contenido del pedido, contraseñas y tokens. Cerrar o archivar el aviso no confirma la operación.'].filter(Boolean).join('\n');
    // Si el servidor incluyó un nombre del pedido en su mensaje, también se omite.
    var privateKeys=/^(?:password|pass|clave|token|apikey|authorization|secret|telefono|tel|cuit|cbu|alias|direccion|clienteNom|cliente_nom|nom|name|n|nombre)$/i,count=0;
    function strip(value,depth){if(!value||typeof value!=='object'||depth>5||count>1500)return;
      Object.keys(value).forEach(function(k){count++;var v=value[k];if(privateKeys.test(k)&&typeof v==='string'&&v.trim().length>=3&&v.length<500)output=output.split(v).join('[dato omitido]');else if(v&&typeof v==='object')strip(v,depth+1);});
    }
    strip(op.data,0);return output;
  }
  function archives(){try{var a=JSON.parse(localStorage.getItem(key('archivo'))||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}}
  async function archive(id){
    if(!canArchive()){notify('Solo administración puede archivar operaciones pendientes.',true);return false;}
    if(w._isSyncing){notify('Esperá a que termine la sincronización antes de archivar.',true);return false;}
    var op=rutaQueue().find(function(x){return x.id===id;});if(!op||!op.ultimoError&&!op.errorDetalle){notify('Solo se archivan operaciones con error registrado.',true);return false;}
    var ctx=scope(),snapshot=JSON.stringify(op),queueSnapshot=JSON.stringify(rutaQueue());
    var message='Se quitará este cambio de los reintentos y quedará una copia recuperable en este dispositivo.\n\nNO se confirma como realizado ni se revierten pasos que ya se hayan guardado. Puede afectar entregas o cobros: revisá el estado del servidor.\n\nLos demás pendientes no se enviarán por esta acción. ¿Archivar la operación fallida?';
    var ok=typeof w._confirmar==='function'?await w._confirmar({icono:'🗃️',titulo:'Archivar operación fallida',mensaje:message,ok:'Archivar y detener reintentos',cancelar:'Conservar pendiente',persistente:true,peligro:true}):w.confirm(message);
    if(!ok||scope()!==ctx||!canArchive()||w._isSyncing)return false;
    op=rutaQueue().find(function(x){return x.id===id;});if(!op||JSON.stringify(op)!==snapshot){notify('La operación cambió. Revisá el detalle nuevamente.',true);return false;}
    try{
      if(JSON.stringify(rutaQueue())!==queueSnapshot)throw Error('La cola cambió mientras confirmabas. Revisá el estado actualizado');
      var queueKey=typeof w._ofKey==='function'?w._ofKey():null;
      if(!queueKey)throw Error('No se encontró la cola activa');
      var persisted=localStorage.getItem(queueKey);
      if(persisted!==null&&JSON.stringify(JSON.parse(persisted))!==queueSnapshot)throw Error('Otra pestaña modificó los pendientes. Recargá antes de archivar');
      var all=archives();
      if(!all.some(function(r){return r.op&&r.op.id===id;}))all.push({fecha:new Date().toISOString(),por:usr(),op:JSON.parse(snapshot)});
      var backup=JSON.stringify(all);localStorage.setItem(key('archivo'),backup);
      if(localStorage.getItem(key('archivo'))!==backup)throw Error('No se pudo comprobar el respaldo local');
      var next=rutaQueue().filter(function(x){return x.id!==id;}),payload=JSON.stringify(next);
      localStorage.setItem(queueKey,payload);
      if(localStorage.getItem(queueKey)!==payload)throw Error('No se pudo guardar la cola actualizada');
      w._offlineQueue=next;w._syncLastError=(next.find(function(x){return x.ultimoError;})||{}).ultimoError||null;
      if(w._syncRetryTimer){clearTimeout(w._syncRetryTimer);w._syncRetryTimer=null;}
      w._updateBanner();render();notify('Archivada en este dispositivo. No se modificó el servidor ni el stock. Revisá el estado confirmado.');return true;
    }catch(e){notify('No se archivó: '+e.message+'. La operación sigue pendiente.',true);return false;}
  }
  async function retry(id){
    if(w._isSyncing){notify('Ya se está sincronizando.');return;}
    if(!navigator.onLine){notify('Necesitás conexión para reintentar.',true);return;}
    var ops=queue(),target=ops.find(function(x){return x.id===id;});if(!target)return;
    if(stock(target)){notify('Este movimiento requiere revisión de stock; no se reintenta desde aquí.',true);return;}
    if(target.method==='PEDIDO_LOCAL'){
      if(typeof w._syncPendingBackups==='function') await w._syncPendingBackups(true,id);
      render();
      var volver=document.querySelector('#sync-avisos-modal.open .sa-head button');
      if(volver)volver.focus();
      return;
    }
    var first=rutaQueue().find(function(x){return !stock(x);});
    if(first&&first.id!==id){notify('Se debe resolver primero la operación anterior para respetar el orden.',true);return;}
    var ctx=scope(),ok=typeof w._confirmar==='function'?await w._confirmar({icono:'🔄',titulo:'Reintentar pendientes en orden',mensaje:'Se intentará este cambio y, si se confirma, continuará la cola en su orden. Revisá antes que no esté aplicado parcialmente. Los movimientos de stock detenidos no se habilitan por este botón.',ok:'Reintentar',persistente:true}):w.confirm('¿Reintentar este cambio y continuar la cola en orden?');
    if(!ok||scope()!==ctx||w._isSyncing||!queue().some(function(x){return x===target;}))return;
    target.pausaSincronizacion=false;w._saveQueue();await w._syncQueue();render();
  }
  function node(tag,text,className){var el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;}
  function button(text,fn){var b=node('button',text);b.type='button';b.onclick=fn;return b;}
  async function copy(text){try{await navigator.clipboard.writeText(text);notify('Reporte técnico copiado.');}catch(e){notify('No se pudo copiar. Podés seleccionarlo o descargarlo.',true);}}
  function download(text,name,type){var url=URL.createObjectURL(new Blob([text],{type:type||'text/plain;charset=utf-8'})),a=node('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},30000);}
  function whatsapp(op){
    if(scope()!==modalScope){close();notify('La sesión cambió. Abrí nuevamente el detalle.',true);return '';}
    var text=report(op);if(text.length>6500)text=text.slice(0,6400)+'\n[Reporte abreviado. Descargá el log para adjuntarlo completo.]';
    var url='https://wa.me/'+TELEFONO+'?text='+encodeURIComponent(text);
    // Llamada directa desde el clic: no queda detrás de una promesa que bloquee la ventana.
    if(typeof w._cc2AbrirWhatsAppSeguro==='function')w._cc2AbrirWhatsAppSeguro(url);
    else w.open(url,'_blank','noopener,noreferrer');
    notify('WhatsApp prepara el mensaje. Confirmá Enviar allí; no se envió automáticamente.');return url;
  }
  function technical(op){
    var details=node('details'),summary=node('summary','Detalle técnico completo');details.append(summary);
    var pre=node('pre',report(op));pre.tabIndex=0;details.append(pre);return details;
  }
  function render(){
    if(!open)return;var body=document.getElementById('sa-body');if(!body)return;body.replaceChildren();
    var ops=queue(),intro=node('p',ops.length?ops.length+' operación(es) en este dispositivo. Ocultar el aviso no las borra.':'No hay operaciones pendientes en este dispositivo.');body.append(intro);
    if(!navigator.onLine)body.append(node('p','Sin conexión. Los reintentos estarán disponibles cuando vuelva la señal.','sa-warning'));
    ops.forEach(function(op){
      var card=node('section',null,'sa-card'),d=detail(op);card.append(node('h3',op.desc||op.method||'Operación pendiente'));
      card.append(node('p',explain(op)),node('p','Intentos: '+Number(op.intentos||0)+' · '+(op.pausaSincronizacion||stock(op)?'Detenido para revisión':'Pendiente')));
      card.append(technical(op));
      var actions=node('div',null,'sa-actions');
      var send=button('Avisar al programador',function(){showReport(op);});actions.append(send);
      if(!stock(op)){var re=button(op.method==='PEDIDO_LOCAL'?'Reintentar pedido':'Reintentar en orden',function(){retry(op.id);});re.disabled=(op.method==='PEDIDO_LOCAL'?!!w._bkSyncBusy:!!w._isSyncing)||!navigator.onLine;actions.append(re);}
      else if(w.StockSeguro&&canArchive()){actions.append(button('Revisar movimientos antiguos',async function(){await w.StockSeguro.revisarPendientes();render();}));}
      if(canArchive()&&op.method!=='PEDIDO_LOCAL'){var ar=button('Archivar operación fallida',function(){archive(op.id);});ar.disabled=!!w._isSyncing||!op.ultimoError&&!op.errorDetalle;actions.append(ar);}
      card.append(actions);body.append(card);
    });
    if(canArchive()){
      var archived=archives(),section=node('details'),summary=node('summary','Archivo local · '+archived.length+' copia(s)');section.append(summary);
      archived.slice().reverse().forEach(function(entry){var op=entry.op;if(!op)return;var card=node('section',null,'sa-card');card.append(node('h3',op.desc||op.method||'Operación archivada'),node('p','Copia local de '+entry.fecha+'. No se reejecuta automáticamente.'),technical(op));
        card.append(button('Reportar error archivado',function(){showReport(op);}),button('Descargar respaldo local (contiene datos)',function(){
          if(w.confirm('El respaldo contiene los datos originales del cambio, que pueden ser privados. Se descargará solo a este dispositivo. No se manda por WhatsApp. ¿Descargar?'))download(JSON.stringify(entry,null,2),'pendiente-archivado.json','application/json');
        }));section.append(card);});body.append(section);
    }
  }
  function showReport(op){
    if(scope()!==modalScope){close();notify('La sesión cambió. Abrí nuevamente el detalle.',true);return;}
    var body=document.getElementById('sa-body');if(!body)return;body.replaceChildren();
    body.append(node('h3','Revisá el reporte antes de enviarlo'),node('p','Destino: +54 9 280 506-5662. WhatsApp pedirá que confirmes el envío. No adjuntamos datos del pedido ni el respaldo local.'));
    var pre=node('pre',report(op));pre.tabIndex=0;body.append(pre);
    var actions=node('div',null,'sa-actions');actions.append(button('Abrir WhatsApp con el reporte',function(){whatsapp(op);}),button('Copiar reporte',function(){copy(report(op));}),button('Descargar log técnico',function(){download(report(op),'reporte-sincronizacion.txt');}),button('Volver a pendientes',render));body.append(actions);
  }
  function mount(){
    if(document.getElementById('sync-avisos-modal'))return;
    var style=node('style');style.textContent='#sync-avisos-modal{display:none;position:fixed;inset:0;z-index:10020;align-items:center;justify-content:center;padding:12px;padding-top:max(12px,env(safe-area-inset-top));background:#0008}#sync-avisos-modal.open{display:flex}.sa-box{background:var(--s1,#fff);color:var(--text,#17233a);width:min(940px,100%);max-height:92vh;max-height:92dvh;border-radius:16px;display:flex;flex-direction:column;box-shadow:0 16px 60px #0005;min-width:0}.sa-head,.sa-foot{padding:14px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;border-bottom:1px solid var(--border,#ddd)}.sa-head h2{margin:0;flex:1;font-size:18px}.sa-body{padding:16px;overflow:auto;overscroll-behavior:contain;min-height:0}.sa-box p{font-size:13px;line-height:1.5;color:var(--muted,#556)}.sa-card{border:1px solid var(--border,#ddd);border-radius:12px;padding:14px;margin-bottom:12px;min-width:0}.sa-card h3{margin:0;font-size:15px;overflow-wrap:anywhere}.sa-box button{padding:10px 12px;min-height:42px;cursor:pointer;border:1px solid var(--border,#ddd);border-radius:9px;background:var(--s2,#f7f8fc);color:var(--text,#17233a);font:inherit;font-size:13px}.sa-box button:disabled{opacity:.45;cursor:default}.sa-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.sa-box pre{font:12px/1.5 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--s3,#f2f4f8);padding:12px;border-radius:8px;max-width:100%;box-sizing:border-box}.sa-box summary{padding:10px 0;font-size:13px;font-weight:700;cursor:pointer}.sa-foot{border-top:1px solid var(--border,#ddd);border-bottom:0}.sa-warning{padding:10px;border:1px solid #d5a52e;border-radius:8px}@media(max-width:600px){.sa-actions>button{flex:1 1 140px}.sa-box{max-height:94dvh}.sa-head{padding:12px}.sa-body{padding:10px}.sa-card{padding:10px}}';document.head.appendChild(style);
    var modal=node('div');modal.id='sync-avisos-modal';modal.className='modal-bg';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','sa-title');
    var box=node('div',null,'sa-box'),head=node('div',null,'sa-head'),title=node('h2','Sincronización y errores');title.id='sa-title';head.append(title,button('Cerrar',close));
    var body=node('div',null,'sa-body');body.id='sa-body';var foot=node('div',null,'sa-foot');foot.append(button('Ocultar aviso',function(){hide();close();}),button('Cerrar detalle',close));box.append(head,body,foot);modal.append(box);document.body.append(modal);
    modal.addEventListener('click',function(e){if(e.target===modal)close();});
    modal.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();close();}if(e.key==='Tab'){var focusable=Array.from(modal.querySelectorAll('button:not(:disabled),summary,pre[tabindex]')).filter(function(el){return el.getClientRects().length;});var first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
    var banner=document.getElementById('offline-banner');if(banner){var dismiss=button('×',function(e){e.stopPropagation();hide();});dismiss.onkeydown=function(e){e.stopPropagation();};dismiss.className='sys-alert-minimize';dismiss.title='Ocultar sin borrar pendientes';dismiss.setAttribute('aria-label','Ocultar aviso de sincronización');banner.append(dismiss);}
  }
  function abrir(){mount();if(!open){previousFocus=document.activeElement;previousOverflow=document.body.style.overflow;}modalScope=scope();document.body.style.overflow='hidden';open=true;render();document.getElementById('sync-avisos-modal').classList.add('open');document.querySelector('#sync-avisos-modal button').focus();}
  function close(){open=false;modalScope='';var m=document.getElementById('sync-avisos-modal');if(m)m.classList.remove('open');document.body.style.overflow=previousOverflow;if(previousFocus&&previousFocus.isConnected)previousFocus.focus();}
  w.SyncAvisos={abrir:abrir,cerrar:close,registrar:registrar,aplicarBanner:aplicarBanner,ocultar:hide,archivar:archive,reintentar:retry,reporte:report,redactar:scrub,permanente:permanent,detalle:detail,telefono:TELEFONO};
  var oldUpdate=w._updateBanner;if(typeof oldUpdate==='function')w._updateBanner=function(){oldUpdate();aplicarBanner();};
  var oldUnstable=w._marcarRedInestable;if(typeof oldUnstable==='function')w._marcarRedInestable=function(){oldUnstable();aplicarBanner();};
  mount();aplicarBanner();
})(window);
