/* Revisión de reparto: el servidor confirma nota, stock y estado juntos. */
(function(w){
  'use strict';
  var ocupadas={},cargando=false;
  // El centro de tareas estaba dentro del header: su z-index no podía superar
  // al menú flotante. Se conservan los mismos nodos y manejadores al moverlos.
  ['modal-tareas','dev-modal'].forEach(function(id){var m=document.getElementById(id);if(m&&m.parentNode!==document.body)document.body.appendChild(m);});
  function admin(){return typeof w._ncTieneRol==='function'&&w._ncTieneRol('admin');}
  function error(e){var s=String(e&&e.message||e||'Error de conexión');var mensajes={
    REVISION_SOLO_ADMIN:'Solo un administrador puede resolver este aviso.',
    REVISION_CAMBIO_EN_OTRO_DISPOSITIVO:'Otro administrador ya cambió esta nota. Actualizá antes de decidir.',
    REVISION_NOTA_RESUELTA:'Esta nota ya fue resuelta. No se puede volver a aplicar.',
    REVISION_NOTA_AMBIGUA:'Hay dos notas históricas con la misma identidad. Revisalas antes de modificar importes o stock.',
    REVISION_RECHAZO_YA_RESUELTO:'Este rechazo ya fue resuelto en otro dispositivo.',
    REVISION_CANTIDAD_SUPERA_PEDIDO:'La devolución supera la cantidad disponible del pedido.',
    REVISION_PRODUCTO_NO_PERTENECE_AL_PEDIDO:'Elegí un producto que pertenezca a este pedido.',
    REVISION_PEDIDO_CON_COBROS:'El pedido tiene cobros registrados. Revisalos antes de rechazarlo.',
    REVISION_PRODUCTO_SIN_CODIGO:'Este producto no tiene un código de stock. Corregí el pedido antes de aprobar la devolución.',
    REVISION_RESOLVER_ROTURAS_PRIMERO:'Revisá primero las roturas pendientes: la mercadería rota no puede volver al stock al rechazar el pedido completo.',
    REVISION_PEDIDO_AMBIGUO:'Hay más de un pedido vinculado posible. Revisá el vínculo en Backup antes de confirmar.',
    REVISION_USAR_REPROGRAMACION_SIN_STOCK:'Esto es una reprogramación: usá Reprogramar. No devuelve stock.',
    REVISION_PEDIDO_YA_RECHAZADO:'El pedido completo ya fue rechazado y su stock quedó resuelto.'};
    var k=Object.keys(mensajes).find(function(k){return s.indexOf(k)>=0;});return k?mensajes[k]:s;
  }
  function refrescar(){
    if(typeof w._tpRefrescar==='function')w._tpRefrescar();
    if(typeof w._ncDashRender==='function')w._ncDashRender();
    var hoja=document.getElementById('hoja');
    if(hoja&&hoja.getClientRects().length&&typeof w.renderRutas==='function')w.renderRutas();
  }
  function aplicar(rk,ck,fila){
    if(!fila||String(fila.empresa_id)!==String(w._sbEmpId))throw Error('Respuesta de otra empresa');
    var cambios={devoluciones:fila.devoluciones||[],rechazado:fila.rechazado===true,rechazoConfirmado:fila.rechazo_confirmado===true,
      rechazadoEn:fila.rechazado_en||'',rechazadoPor:fila.rechazado_por||'',motivoRechazo:fila.motivo_rechazo||'',
      entregado:fila.entregado===true,entregadoEn:fila.entregado_en||'',auditLog:fila.audit_log||[],pedidoId:fila.pedido_id||null};
    var cli=w.rutasData&&w.rutasData[rk]&&w.rutasData[rk].clientes&&w.rutasData[rk].clientes[ck];if(cli)Object.assign(cli,cambios);
    if(w._devTarget&&String(w._devTarget.ck)===String(ck))Object.assign(w._devTarget.cli,cambios);
    if(String(w._rutaMapaKey)===String(rk))(w._mapaParadas||[]).forEach(function(p){if(String(p.cliKey)===String(ck))Object.assign(p.cli,cambios);});
    if(typeof w._guardarRutasOffline==='function')w._guardarRutasOffline();
    refrescar();return fila;
  }
  async function solicitar(rk,ck,accion,datos){
    if(!navigator.onLine)throw Error('Necesitás conexión para confirmar una decisión. El aviso sigue pendiente.');
    var empresa=w._sbEmpId;if(!empresa)throw Error('Volvé a iniciar sesión para identificar la empresa.');
    var r=await w.sbFetch('POST','/rest/v1/rpc/reparto_revision_v1',{p_empresa:empresa,p_parada:ck,p_accion:accion,p_datos:datos||{}});
    if(w._sbEmpId!==empresa)throw Error('La sesión cambió durante la operación. Volvé a abrir el aviso.');
    if(!r||r.ok!==true||!r.parada)throw Error('La base no confirmó el cambio. Actualizá antes de reintentar.');
    aplicar(rk,ck,r.parada);
    if(r.stock&&typeof w._stkRefrescar==='function')await w._stkRefrescar().catch(function(){});
    return r.parada;
  }
  async function replayNota(d){
    var n=d.note||{},accion=d.action==='remove'?'retirar_nota':n.estado==='aplicada'?'aplicar_nota':n.estado==='rechazada'?'rechazar_nota':'notificar_nota';
    if(accion!=='notificar_nota')throw Error('Las decisiones de stock no se ejecutan desde una cola vieja. Abrí la nota y resolvela conectado.');
    return solicitar(d.rutaId,d.cliId,accion,{nota:n});
  }
  async function resolverNota(idx,accion){
    var t=w._devTarget,n=t&&t.cli&&t.cli.devoluciones&&t.cli.devoluciones[idx];if(!n)return;
    if(!admin()){w.showNotif('Solo el admin puede aprobar o rechazar devoluciones','err');return;}
    var clave=t.rk+'|'+t.ck;if(ocupadas[clave])return;ocupadas[clave]=true;
    try{
      if(!(await w._confirmar({icono:'↩️',titulo:accion==='aplicar_nota'?'Aprobar devolución':'Rechazar devolución',mensaje:accion==='aplicar_nota'?'Se aplicará la nota y, si corresponde, el movimiento de stock, juntos y una sola vez.':'La nota quedará rechazada y no descontará del importe. Si ya estaba aplicada, se revertirá su devolución de stock.',ok:accion==='aplicar_nota'?'Aprobar':'Rechazar',peligro:accion!=='aplicar_nota',persistente:true})))return;
      await solicitar(t.rk,t.ck,accion,{nota:{id:n.id,ts:n.ts,codigo:n.codigo,producto:n.producto,cantidad:n.cantidad,motivo:n.motivo},esperado:w._devEstado(n)});
      w.showNotif(accion==='aplicar_nota'?'Devolución aprobada y confirmada':'Devolución rechazada y confirmada','ok');
    }catch(e){w.showNotif(error(e),'err');}finally{delete ocupadas[clave];if(typeof w._devRenderList==='function')w._devRenderList();}
  }
  async function resolverRechazo(rk,ck,aprobar,opts){
    if(!admin()){w.showNotif('Solo el admin puede resolver rechazos','err');return false;}
    var c=w.rutasData&&w.rutasData[rk]&&w.rutasData[rk].clientes&&w.rutasData[rk].clientes[ck];if(!c)return false;
    var k=rk+'|'+ck;if(ocupadas[k])return false;ocupadas[k]=true;
    try{
      if(!(opts&&opts.sinPregunta)&&!(await w._confirmar({icono:'📋',titulo:aprobar?'Aprobar rechazo del pedido':'No aprobar el rechazo',mensaje:aprobar?'El stock pendiente vuelve y el pedido se anula en una sola operación. No se duplican devoluciones ya aplicadas.':'El pedido vuelve a quedar pendiente de entrega, sin devolución de stock ni anulación de la venta.',ok:aprobar?'Aprobar rechazo':'No aprobar',persistente:true})))return false;
      await solicitar(rk,ck,aprobar?'confirmar_rechazo':'desestimar_rechazo');
      if(typeof w.cargarBackupFirebase==='function')Promise.resolve(w.cargarBackupFirebase()).catch(function(){});
      w.showNotif(aprobar?'Rechazo aprobado y confirmado':'Rechazo no aprobado. El pedido sigue vigente.','ok');return true;
    }catch(e){w.showNotif(error(e),'err');return false;}finally{delete ocupadas[k];}
  }
  async function notificarRechazo(i){
    var p=(w._mapaParadas||[])[i];if(!p)return;
    var rk=w._rutaMapaKey,ck=p.cliKey,k=rk+'|'+ck;if(ocupadas[k])return;ocupadas[k]=true;
    try{
      if(p.cli.rechazado){w.showNotif('El rechazo ya está registrado para revisión','info');return;}
      var motivo=await w._meMotivoRechazo();if(motivo===null)return;
      if(w._esMotivoReprogramacion(motivo)){w._meReprogramar(i);return;}
      var id='rr_'+Date.now()+'_'+Math.random().toString(36).slice(2,10),datos={id:id,motivo:motivo};
      if(navigator.onLine)await solicitar(rk,ck,'notificar_rechazo',datos);
      else{
        await w._enqueue('REPARTO_REPORTE','empresas/'+w.empresaKey+'/rutas/'+rk+'/clientes/'+ck,{rutaId:rk,cliId:ck,datos:datos},'Avisar rechazo al administrador');
        Object.assign(p.cli,{rechazado:true,rechazoConfirmado:false,motivoRechazo:motivo,rechazadoEn:new Date().toISOString(),entregado:false});
        if(typeof w._guardarRutasOffline==='function')w._guardarRutasOffline();
      }
      w.renderParadas(w._mapaParadas);refrescar();w.showNotif(navigator.onLine?'Rechazo guardado. El admin debe revisarlo.':'Guardado en este dispositivo. El admin lo recibirá al recuperar conexión.','ok');
    }catch(e){w.showNotif(error(e),'err');}finally{delete ocupadas[k];}
  }
  async function actualizar(){
    if(cargando||!admin()||!navigator.onLine||document.visibilityState==='hidden'||Object.keys(ocupadas).length||!w._sbEmpId)return;
    cargando=true;var empresa=w._sbEmpId;
    try{var all=await w._cargarRutasServidorSeguras();if(w._sbEmpId!==empresa)return;w.rutasData=w._filtrarRutasParaUsuario(all);refrescar();}catch(e){/* Conserva los avisos visibles; no declarar resuelto sin respuesta. */}finally{cargando=false;}
  }
  async function persistir(rk,ck,cli,meta){
    meta=meta||{};
    if(meta.action==='remove')throw Error('Retirá la nota desde su acción de retiro; no se borra el historial.');
    if(!meta.note||meta.note.estado!=='notificada')throw Error('Resolvé la nota con Aprobar o Rechazar, conectado.');
    if(navigator.onLine)return solicitar(rk,ck,'notificar_nota',{nota:meta.note});
    var id=await w._enqueue('DEV_NOTE','empresas/'+w.empresaKey+'/rutas/'+rk+'/clientes/'+ck,{rutaId:rk,cliId:ck,action:'upsert',noteKey:w._devClaveNota(meta.note),note:JSON.parse(JSON.stringify(meta.note))},'Devolución pendiente de avisar al admin');
    w._guardarRutasOffline();refrescar();return id;
  }
  w._ncAplicar=function(i){return resolverNota(i,'aplicar_nota');};
  w._ncRechazar=function(i){return resolverNota(i,'rechazar_nota');};
  w._confirmarRechazo=function(rk,ck,opts){return resolverRechazo(rk,ck,true,opts);};
  w._meRechazar=notificarRechazo;
  w._devReplayNota=replayNota;
  w._devPersistir=persistir;
  w._devQuitar=async function(idx){
    var t=w._devTarget,n=t&&t.cli&&t.cli.devoluciones&&t.cli.devoluciones[idx];if(!n)return;
    try{
      if(w._devEstado(n)!=='notificada')throw Error('Una nota resuelta conserva su historial. Solo el admin puede rechazar una devolución aplicada.');
      if(!(await w._confirmar({icono:'↩️',titulo:'Retirar aviso',mensaje:'Se retirará el aviso pendiente sin modificar stock ni importes. El retiro queda en el historial.',ok:'Retirar',persistente:true})))return;
      await solicitar(t.rk,t.ck,'retirar_nota',{nota:{id:n.id,ts:n.ts,codigo:n.codigo,producto:n.producto,cantidad:n.cantidad,motivo:n.motivo},esperado:'notificada'});w._devRenderList();
    }catch(e){w.showNotif(error(e),'err');}
  };
  w.RepartoRevision={solicitar:solicitar,replayNota:replayNota,resolverNota:resolverNota,resolverRechazo:resolverRechazo,notificarRechazo:notificarRechazo,actualizar:actualizar,refrescar:refrescar,error:error};
  setInterval(actualizar,15000);document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible')actualizar();});w.addEventListener('online',actualizar);
})(window);
