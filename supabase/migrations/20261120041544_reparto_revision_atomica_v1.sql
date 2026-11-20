-- Revisión de reparto: una fila bloqueada serializa decisiones y stock.
-- Aditiva: no modifica datos existentes ni desactiva RLS.
create or replace function public.reparto_revision_v1(
  p_empresa uuid, p_parada uuid, p_accion text, p_datos jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  c public.ruta_clientes%rowtype; u public.usuarios%rowtype;
  b public.backup_pedidos%rowtype; n jsonb; notas jsonb; h jsonb;
  token text; v_uid text; admin boolean; ix integer; coincidencias integer; identidad jsonb; cant numeric; maximo numeric;
  precio numeric; codigo text; nombre text; estado text; esperado text;
  ahora timestamptz:=clock_timestamp(); mov jsonb; its jsonb; audit jsonb;
  v_control boolean; v_pedido uuid; v_ids uuid[]; v_total numeric;
begin
  if public.app_empresa_id() is distinct from p_empresa then
    raise exception 'REVISION_EMPRESA_DENEGADA';
  end if;
  -- app_empresa_id validó firma y expiración; recién ahora se lee el uid firmado.
  token:=current_setting('request.headers',true)::jsonb->>'x-empresa-token';
  v_uid:=convert_from(public.app_b64url_decode(split_part(token,'.',2)),'UTF8')::jsonb->>'uid';
  select * into u from public.usuarios where empresa_id=p_empresa and lower(usuarios.uid)=lower(v_uid) limit 1;
  if not found then raise exception 'REVISION_SESION_INVALIDA'; end if;
  admin:=coalesce(u.role='admin',false) or coalesce('admin'=any(u.roles),false);
  if not coalesce(admin or u.role in ('repartidor','vendedor') or coalesce(u.roles&&array['repartidor','vendedor'],false),false) then
    raise exception 'REVISION_ROL_DENEGADO';
  end if;
  select * into c from public.ruta_clientes where id=p_parada and empresa_id=p_empresa for update;
  if not found then raise exception 'REVISION_PARADA_NO_ENCONTRADA'; end if;
  notas:=coalesce(c.devoluciones,'[]'::jsonb);
  audit:=coalesce(c.audit_log,'[]'::jsonb);
  h:=jsonb_build_object('accion',p_accion,'por',u.uid,'rol',u.role,'ts',ahora);
  select coalesce(control_stock,false) into v_control from public.empresas where id=p_empresa;

  if p_accion in ('notificar_nota','aplicar_nota','rechazar_nota','retirar_nota') then
    if c.rechazo_confirmado then raise exception 'REVISION_PEDIDO_YA_RECHAZADO'; end if;
    n:=p_datos->'nota';
    if jsonb_typeof(n) is distinct from 'object' then raise exception 'REVISION_NOTA_INVALIDA'; end if;
    if nullif(n->>'id','') is null and (p_accion='notificar_nota' or nullif(n->>'producto','') is null or nullif(n->>'ts','') is null) then raise exception 'REVISION_NOTA_INVALIDA'; end if;
    identidad:=jsonb_build_array(coalesce(n->>'ts',''),coalesce(n->>'codigo',''),coalesce(n->>'producto',''),coalesce((n->>'cantidad')::numeric,1),coalesce(n->>'motivo',''));
    select count(*) into coincidencias from jsonb_array_elements(notas)x where
      x->>'id'=n->>'id' or (nullif(n->>'id','') is null and jsonb_build_array(coalesce(x->>'ts',''),coalesce(x->>'codigo',''),coalesce(x->>'producto',''),coalesce((x->>'cantidad')::numeric,1),coalesce(x->>'motivo',''))=identidad);
    if coincidencias>1 then raise exception 'REVISION_NOTA_AMBIGUA'; end if;
    select (ordinality-1)::integer,value into ix,n from jsonb_array_elements(notas) with ordinality
      where value->>'id'=p_datos->'nota'->>'id' or
        (nullif(p_datos->'nota'->>'id','') is null and jsonb_build_array(coalesce(value->>'ts',''),coalesce(value->>'codigo',''),coalesce(value->>'producto',''),coalesce((value->>'cantidad')::numeric,1),coalesce(value->>'motivo',''))=identidad) limit 1;
    if p_accion='notificar_nota' then
      -- Reintentar un reporte no puede resucitar una decisión ni duplicar la nota.
      if ix is not null then return jsonb_build_object('ok',true,'repetido',true,'parada',to_jsonb(c)); end if;
      n:=p_datos->'nota'; cant:=(n->>'cantidad')::numeric;
      if cant is null or cant<=0 or cant<>trunc(cant) then raise exception 'REVISION_CANTIDAD_INVALIDA'; end if;
      if coalesce(n->>'motivo','') not in ('devolucion','faltante','rotura') then raise exception 'REVISION_MOTIVO_INVALIDO'; end if;
      codigo:=nullif(n->>'codigo',''); nombre:=n->>'producto';
      select sum(coalesce((it->>'c')::numeric,(it->>'cant')::numeric,(it->>'cantidad')::numeric,(it->>'qty')::numeric,0)),max(coalesce((it->>'p')::numeric,0))
        into maximo,precio from jsonb_array_elements(coalesce(c.items,'[]'::jsonb)) it
        where (codigo is not null and coalesce(it->>'id',it->>'codigo',it->>'cod')=codigo)
           or (codigo is null and coalesce(it->>'n',it->>'nombre',it->>'nom',it->>'name')=nombre);
      if coalesce(maximo,0)<=0 then raise exception 'REVISION_PRODUCTO_NO_PERTENECE_AL_PEDIDO'; end if;
      select maximo-coalesce(sum((d->>'cantidad')::numeric),0) into maximo from jsonb_array_elements(notas) d
        where coalesce(d->>'estado','aplicada') not in ('rechazada','retirada') and
          ((codigo is not null and d->>'codigo'=codigo) or (codigo is null and d->>'producto'=nombre));
      if cant>maximo then raise exception 'REVISION_CANTIDAD_SUPERA_PEDIDO'; end if;
      n:=jsonb_build_object('id',n->>'id','producto',nombre,'codigo',coalesce(codigo,''),'cantidad',cant,
        'motivo',n->>'motivo','nota',left(coalesce(n->>'nota',''),2000),'precioUnit',precio,
        'monto',case when n->>'motivo'='rotura' then 0 else round(precio*cant,2) end,
        'descuenta',(n->>'motivo' in ('devolucion','faltante')),'estado','notificada','stkDev',false,
        'ts',ahora,'actualizadoEn',ahora,'historial',jsonb_build_array(h||jsonb_build_object('accion','notificada')));
      notas:=notas||jsonb_build_array(n);
    else
      if ix is null then raise exception 'REVISION_NOTA_NO_ENCONTRADA'; end if;
      if nullif(n->>'id','') is null then n:=n||jsonb_build_object('id','nc_legacy_'||md5(p_parada::text||identidad::text));end if;
      estado:=coalesce(n->>'estado','aplicada');
      esperado:=p_datos->>'esperado';
      if (p_accion='aplicar_nota' and estado='aplicada') or
         (p_accion='rechazar_nota' and estado='rechazada') or
         (p_accion='retirar_nota' and estado='retirada') then
        return jsonb_build_object('ok',true,'repetido',true,'parada',to_jsonb(c));
      end if;
      if p_accion<>'retirar_nota' and not admin then raise exception 'REVISION_SOLO_ADMIN'; end if;
      if esperado is null or esperado<>estado then raise exception 'REVISION_CAMBIO_EN_OTRO_DISPOSITIVO'; end if;
      if p_accion='aplicar_nota' and estado<>'notificada' then raise exception 'REVISION_NOTA_RESUELTA'; end if;
      if p_accion='rechazar_nota' and estado not in ('notificada','aplicada') then raise exception 'REVISION_NOTA_RESUELTA'; end if;
      if p_accion='retirar_nota' and (estado<>'notificada' or (not admin and n->'historial'->0->>'por'<>u.uid)) then raise exception 'REVISION_NO_PUEDE_RETIRAR'; end if;
      if p_accion='aplicar_nota' and v_control and n->>'motivo' in ('devolucion','faltante') and nullif(n->>'codigo','') is null then raise exception 'REVISION_PRODUCTO_SIN_CODIGO'; end if;
      if p_accion='aplicar_nota' and n->>'motivo' in ('devolucion','faltante') and nullif(n->>'codigo','') is not null then
        mov:=public.stk_devolver(p_empresa,'nc-'||(n->>'id')||'-aplicar-1',jsonb_build_array(jsonb_build_object('codigo',n->>'codigo','cant',(n->>'cantidad')::numeric)),u.uid,'Devolución aprobada por admin');
        n:=n||jsonb_build_object('stkDev',not coalesce((mov->>'omitido')::boolean,false),'stkOmitido',coalesce((mov->>'omitido')::boolean,false));
      elsif p_accion='rechazar_nota' and coalesce((n->>'stkDev')::boolean,false) then
        if not v_control then raise exception 'REVISION_REVERSION_STOCK_REQUIERE_CONTROL_ACTIVO'; end if;
        mov:=public.stk_confirmar_salida(p_empresa,'nc-'||(n->>'id')||'-revertir-rechazada-'||(1+(select count(*) from jsonb_array_elements(coalesce(n->'historial','[]'::jsonb))z where z->>'accion'='rechazada')),jsonb_build_array(jsonb_build_object('codigo',n->>'codigo','cant',(n->>'cantidad')::numeric)),u.uid,'Admin rechaza devolución aplicada');
        n:=n||jsonb_build_object('stkDev',false);
      end if;
      estado:=case p_accion when 'aplicar_nota' then 'aplicada' when 'rechazar_nota' then 'rechazada' else 'retirada' end;
      n:=n||jsonb_build_object('estado',estado,'actualizadoEn',ahora,'historial',coalesce(n->'historial','[]'::jsonb)||jsonb_build_array(h||jsonb_build_object('accion',estado)));
      notas:=jsonb_set(notas,array[ix::text],n);
    end if;
    update public.ruta_clientes set devoluciones=notas where id=c.id returning * into c;

  elsif p_accion='notificar_rechazo' then
    if nullif(p_datos->>'id','') is null then raise exception 'REVISION_FALTA_IDENTIFICADOR'; end if;
    if exists(select 1 from jsonb_array_elements(audit)x where x->>'reporteId'=p_datos->>'id') then return jsonb_build_object('ok',true,'repetido',true,'parada',to_jsonb(c)); end if;
    if c.rechazo_confirmado or c.rechazado then return jsonb_build_object('ok',true,'repetido',true,'parada',to_jsonb(c)); end if;
    if coalesce(c.efectivo,0)+coalesce(c.transferencia,0)+(select coalesce(sum((x->>'monto')::numeric),0) from jsonb_array_elements(coalesce(c.pagos_adicionales,'[]'::jsonb))x)>.01 then raise exception 'REVISION_PEDIDO_CON_COBROS'; end if;
    if nullif(btrim(p_datos->>'motivo'),'') is null then raise exception 'REVISION_FALTA_MOTIVO'; end if;
    if lower(p_datos->>'motivo') like '%otro d%a%' or lower(p_datos->>'motivo') like '%reprogram%' then raise exception 'REVISION_USAR_REPROGRAMACION_SIN_STOCK'; end if;
    h:=h||jsonb_build_object('reporteId',p_datos->>'id','entregadoAntes',coalesce(c.entregado,false),'entregadoEnAntes',c.entregado_en,'motivo',p_datos->>'motivo');
    update public.ruta_clientes set rechazado=true,rechazo_confirmado=false,rechazado_en=ahora,rechazado_por=u.uid,
      motivo_rechazo=p_datos->>'motivo',entregado=false,audit_log=audit||jsonb_build_array(h) where id=c.id returning * into c;
    insert into public.avisos_rechazo(empresa_id,ruta_id,cli_key,cli_nom,motivo,importe,repartidor,confirmado,fecha)
      values(p_empresa,c.ruta_id::text,c.id::text,c.nom,c.motivo_rechazo,c.importe,u.uid,false,ahora);

  elsif p_accion in ('confirmar_rechazo','desestimar_rechazo') then
    if not admin then raise exception 'REVISION_SOLO_ADMIN'; end if;
    if p_accion='confirmar_rechazo' and c.rechazo_confirmado then return jsonb_build_object('ok',true,'repetido',true,'parada',to_jsonb(c)); end if;
    if not coalesce(c.rechazado,false) or coalesce(c.rechazo_confirmado,false) then raise exception 'REVISION_RECHAZO_YA_RESUELTO'; end if;
    if p_accion='desestimar_rechazo' then
      select x into h from jsonb_array_elements(audit) with ordinality z(x,ord) where x->>'accion'='notificar_rechazo' order by ord desc limit 1;
      update public.ruta_clientes set rechazado=false,rechazo_confirmado=false,
        entregado=coalesce((h->>'entregadoAntes')::boolean,false),
        audit_log=audit||jsonb_build_array(jsonb_build_object('accion',p_accion,'por',u.uid,'ts',ahora,'motivoAnterior',c.motivo_rechazo)),motivo_rechazo='',rechazado_por='',rechazado_en=null where id=c.id returning * into c;
    else
      if exists(select 1 from jsonb_array_elements(notas)x where x->>'motivo'='rotura' and x->>'estado'='notificada') then raise exception 'REVISION_RESOLVER_ROTURAS_PRIMERO'; end if;
      if lower(coalesce(c.motivo_rechazo,'')) like '%otro d%a%' or lower(coalesce(c.motivo_rechazo,'')) like '%reprogram%' then raise exception 'REVISION_USAR_REPROGRAMACION_SIN_STOCK'; end if;
      if coalesce(c.efectivo,0)+coalesce(c.transferencia,0)+(select coalesce(sum((x->>'monto')::numeric),0) from jsonb_array_elements(coalesce(c.pagos_adicionales,'[]'::jsonb))x)>.01 then raise exception 'REVISION_PEDIDO_CON_COBROS'; end if;
      v_pedido:=c.pedido_id;
      if v_pedido is null then
        select array_agg(id) into v_ids from public.backup_pedidos where empresa_id=p_empresa and ruta_vinculada_id=c.ruta_id and
          ((nullif(c.cliente_id,'') is not null and cliente_id=c.cliente_id) or lower(btrim(cliente_nom))=lower(btrim(c.nom)));
        if cardinality(v_ids)>1 then raise exception 'REVISION_PEDIDO_AMBIGUO'; end if;
        v_pedido:=v_ids[1];
      end if;
      if v_pedido is not null then
        select * into b from public.backup_pedidos where id=v_pedido and empresa_id=p_empresa for update;
        if not found then raise exception 'REVISION_PEDIDO_NO_ENCONTRADO'; end if;
        if coalesce(b.stock_devuelto,false) then raise exception 'REVISION_STOCK_YA_DEVUELTO_REVISAR'; end if;
      end if;
      select coalesce(jsonb_agg(jsonb_build_object('codigo',q.codigo,'cant',q.cant)),'[]'::jsonb) into its from (
        select i.codigo,greatest(0,i.cant-coalesce(d.cant,0)) cant from
        (select coalesce(x->>'id',x->>'codigo',x->>'cod') codigo,sum(coalesce((x->>'c')::numeric,(x->>'cant')::numeric,(x->>'cantidad')::numeric,(x->>'qty')::numeric,0)) cant from jsonb_array_elements(coalesce(c.items,'[]'::jsonb))x group by 1)i
        left join (select x->>'codigo' codigo,sum((x->>'cantidad')::numeric) cant from jsonb_array_elements(notas)x where (coalesce((x->>'stkDev')::boolean,false) or x->>'motivo'='rotura') and coalesce(x->>'estado','aplicada')='aplicada' group by 1)d using(codigo)
      )q where q.cant>0 and q.codigo is not null;
      if jsonb_array_length(its)>0 then mov:=public.stk_devolver(p_empresa,'rech-'||c.ruta_id||'-'||c.id,its,u.uid,'Rechazo completo aprobado por admin'); end if;
      if v_pedido is null then
        v_total:=case when c.tipo_comprobante='factura_a' then round(c.importe/1.21,2) else c.importe end;
        insert into public.backup_pedidos(empresa_id,fecha,cliente_nom,cliente_id,lista,obs,items,total,total_con_iva,tipo,tipo_comprobante,aprobado,estado,stock_devuelto,rechazado_en,motivo_rechazo,rechazo_ruta_id,rechazo_ruta_cliente_id,historial)
          values(p_empresa,coalesce(c.fecha,ahora),c.nom,c.cliente_id,c.lista,c.obs,c.items,v_total,round(v_total*1.21,2),'pedido',c.tipo_comprobante,false,'rechazado',true,ahora,c.motivo_rechazo,c.ruta_id::text,c.id::text,jsonb_build_array(h)) returning id into v_pedido;
      else
        update public.backup_pedidos set aprobado=false,estado='rechazado',stock_devuelto=true,rechazado_en=ahora,motivo_rechazo=c.motivo_rechazo,rechazo_ruta_id=c.ruta_id::text,rechazo_ruta_cliente_id=c.id::text,ruta_vinculada_id=null,historial=coalesce(historial,'[]'::jsonb)||jsonb_build_array(h) where id=v_pedido;
        update public.ventas set anulada=true,anulada_en=ahora,motivo_anulacion=c.motivo_rechazo where empresa_id=p_empresa and
          (pedido_id=v_pedido or (pedido_id is null and fecha=b.fecha and
            ((nullif(b.cliente_id,'') is not null and cliente_id=b.cliente_id) or lower(btrim(cliente_nom))=lower(btrim(b.cliente_nom)))));
      end if;
      select coalesce(jsonb_agg(x||jsonb_build_object('estado','rechazada','stkDev',false,'stockAbsorbidoPorRechazo',true,'actualizadoEn',ahora,'historial',coalesce(x->'historial','[]'::jsonb)||jsonb_build_array(h||jsonb_build_object('accion','rechazada','nota','Pedido completo rechazado')))),'[]'::jsonb) into notas from jsonb_array_elements(notas)x;
      update public.ruta_clientes set rechazo_confirmado=true,pedido_id=v_pedido,devoluciones=notas,audit_log=audit||jsonb_build_array(h) where id=c.id returning * into c;
    end if;
    update public.avisos_rechazo set confirmado=true,confirmado_en=ahora where empresa_id=p_empresa and ruta_id=c.ruta_id::text and cli_key=c.id::text and not confirmado;
  else raise exception 'REVISION_ACCION_INVALIDA';
  end if;
  return jsonb_build_object('ok',true,'parada',to_jsonb(c),'stock',mov);
end $$;
revoke all on function public.reparto_revision_v1(uuid,uuid,text,jsonb) from public;
grant execute on function public.reparto_revision_v1(uuid,uuid,text,jsonb) to anon,authenticated;
comment on function public.reparto_revision_v1(uuid,uuid,text,jsonb) is 'Revisión atómica por empresa y usuario firmado. Sin cambios de stock al notificar. Decisiones solo admin.';
