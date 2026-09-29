-- Stock v3: cambios confirmados, edición indivisible y protección entre dispositivos.
CREATE OR REPLACE FUNCTION public.pedido_editar_atomico(p_empresa uuid, p_pedido_id uuid, p_patch jsonb, p_items_esperados jsonb, p_usuario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token_empresa uuid;
  v_pedido public.backup_pedidos%rowtype;
  v_nuevos jsonb;
  v_control boolean := false;
  v_item record;
  v_actual integer;
  v_despues integer;
  v_diff jsonb := '[]'::jsonb;
  v_salen jsonb := '[]'::jsonb;
  v_vuelven jsonb := '[]'::jsonb;
begin
  v_token_empresa := public.app_empresa_id();
  if not public.app_es_superadmin()
     and (v_token_empresa is null or v_token_empresa <> p_empresa) then
    raise exception 'ACCESO_EMPRESA_DENEGADO';
  end if;
  if p_empresa is null or p_pedido_id is null
     or jsonb_typeof(coalesce(p_patch,'{}'::jsonb)) <> 'object'
     or not (p_patch ? 'items')
     or jsonb_typeof(p_patch->'items') <> 'array' then
    raise exception 'PEDIDO_EDICION_DATOS_INVALIDOS';
  end if;

  select *
    into v_pedido
    from public.backup_pedidos b
   where b.id=p_pedido_id and b.empresa_id=p_empresa
   for update;
  if not found then
    raise exception 'PEDIDO_NO_ENCONTRADO';
  end if;

  -- La actualización masiva de precios solo está permitida mientras el pedido
  -- sigue sin revisión. La comprobación ocurre con la fila bloqueada, por lo que
  -- una aprobación concurrente no puede colarse entre el control y el UPDATE.
  if p_patch->>'solo_si_pendiente' = 'true' and v_pedido.aprobado is not null then
    raise exception 'PEDIDO_NO_PENDIENTE|El pedido ya fue aprobado o rechazado';
  end if;

  if p_items_esperados is not null
     and coalesce(v_pedido.items,'[]'::jsonb) is distinct from p_items_esperados then
    raise exception 'PEDIDO_CAMBIO_CONCURRENTE|El pedido cambió mientras estaba abierto';
  end if;

  -- Orden uniforme: pedido, parada, stock. Evita interbloqueos entre editores.
  perform 1 from public.ruta_clientes where empresa_id=p_empresa and pedido_id=p_pedido_id order by id for update;
  v_nuevos := p_patch->'items';
  if exists(select 1 from jsonb_array_elements(v_nuevos) j where
    coalesce(j->>'c',j->>'cant',j->>'cantidad','') !~ '^[0-9]+([.]0+)?$') then
    raise exception 'STOCK_CANTIDAD_INVALIDA';
  end if;
  select coalesce(e.control_stock,false)
    into v_control
    from public.empresas e
   where e.id=p_empresa;

  with viejos as (
    select * from public._stock_items_cantidades(v_pedido.items)
  ), nuevos as (
    select * from public._stock_items_cantidades(v_nuevos)
  ), cambios as (
    select coalesce(n.codigo,v.codigo) codigo,
           coalesce(v.cant,0) anterior,
           coalesce(n.cant,0) nuevo,
           coalesce(n.cant,0)-coalesce(v.cant,0) delta
      from viejos v full join nuevos n using(codigo)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'codigo',codigo,'anterior',anterior,'nuevo',nuevo,'delta',delta
         ) order by codigo) filter(where delta<>0),'[]'::jsonb)
    into v_diff
    from cambios;

  -- Un pedido rechazado ya devolvió su inventario; editarlo no lo devuelve otra vez.
  if coalesce(v_pedido.stock_devuelto,false) then v_control:=false; end if;
  if v_control and jsonb_array_length(v_diff)>0 then
    -- Impedir movimientos sobre códigos inexistentes o ambiguos.
    for v_item in select d->>'codigo' codigo from jsonb_array_elements(v_diff) d loop
      perform public._stock_lotes_codigo_canonico(p_empresa,v_item.codigo);
    end loop;
    -- Crear faltantes en cero y bloquear siempre en el mismo orden.
    insert into public.stock(empresa_id,codigo,cantidad,reservado,updated_at)
    select p_empresa, d->>'codigo', 0, 0, now()
      from jsonb_array_elements(v_diff) d
    on conflict(empresa_id,codigo) do nothing;

    perform 1
      from public.stock s
      join jsonb_array_elements(v_diff) d on d->>'codigo'=s.codigo
     where s.empresa_id=p_empresa
     order by s.codigo
     for update of s;

    for v_item in
      select d->>'codigo' codigo, (d->>'delta')::integer delta
        from jsonb_array_elements(v_diff) d
       order by d->>'codigo'
    loop
      select coalesce(s.cantidad,0)
        into v_actual
        from public.stock s
       where s.empresa_id=p_empresa and s.codigo=v_item.codigo
       for update;

      -- delta pedido > 0 significa que salen más unidades del depósito.
      if v_item.delta>0 and v_actual<v_item.delta then
        raise exception using
          errcode='P0001',
          message=format(
            'STOCK_INSUFICIENTE|codigo=%s|disponible=%s|solicitado=%s',
            v_item.codigo,greatest(v_actual,0),v_item.delta
          );
      end if;

      v_despues := v_actual-v_item.delta;
      perform set_config('app.stock_actor',coalesce(p_usuario,'sistema'),true);
      perform set_config('app.stock_reason','Edición de pedido confirmada',true);
      update public.stock
         set cantidad=v_despues,updated_at=now()
       where empresa_id=p_empresa and codigo=v_item.codigo;

      insert into public.stock_movimientos
        (empresa_id,codigo,delta,anterior,nuevo,motivo,usuario,fecha,tipo,ref)
      values
        (p_empresa::text,v_item.codigo,-v_item.delta,v_actual,v_despues,
         case when v_item.delta>0 then 'Edición de pedido'
              else 'Edición de pedido — vuelve al stock' end,
         coalesce(nullif(p_usuario,''),'sistema'),now(),
         case when v_item.delta>0 then 'salida' else 'devolucion' end,
         'edit-bk-'||p_pedido_id::text||'-'||gen_random_uuid()::text);
    end loop;
  end if;

  update public.backup_pedidos b
     set items = v_nuevos,
         total = case when p_patch?'total' then (p_patch->>'total')::numeric else b.total end,
         total_con_iva = case when p_patch?'total_con_iva' then (p_patch->>'total_con_iva')::numeric else b.total_con_iva end,
         tipo_comprobante = case when p_patch?'tipo_comprobante' then p_patch->>'tipo_comprobante' else b.tipo_comprobante end,
         cliente_nom = case when p_patch?'cliente_nom' then p_patch->>'cliente_nom' else b.cliente_nom end,
         cliente_id = case when p_patch?'cliente_id' then p_patch->>'cliente_id' else b.cliente_id end,
         lista = case when p_patch?'lista' then p_patch->>'lista' else b.lista end,
         obs = case when p_patch?'obs' then p_patch->>'obs' else b.obs end,
         descuentos = case when p_patch?'descuentos' then nullif(p_patch->'descuentos','null'::jsonb) else b.descuentos end,
         historial = case when p_patch?'historial' then coalesce(nullif(p_patch->'historial','null'::jsonb),'[]'::jsonb) else b.historial end
   where b.id=p_pedido_id and b.empresa_id=p_empresa;

  -- Una sola transacción mantiene la ruta vinculada y evita el espejo atrasado.
  update public.ruta_clientes rc
     set items=coalesce((select jsonb_agg(j order by ord)
                        from jsonb_array_elements(v_nuevos) with ordinality x(j,ord)
                        where coalesce(j->>'pendiente','false')<>'true'),'[]'::jsonb),
         importe=coalesce((p_patch->>'total_con_iva')::numeric,(p_patch->>'total')::numeric,rc.importe),
         tipo_comprobante=coalesce(p_patch->>'tipo_comprobante',rc.tipo_comprobante),
         dsc_general=case when p_patch?'descuentos' then
           case when coalesce((p_patch->'descuentos'->>'montoDscGen')::numeric,0)>0
             then jsonb_build_object('tipo',coalesce(p_patch->'descuentos'->>'dscGenTipo','$'),
                                    'valor',coalesce(nullif((p_patch->'descuentos'->>'dscGenValor')::numeric,0),
                                                     (p_patch->'descuentos'->>'montoDscGen')::numeric))
             else null end else rc.dsc_general end
   where rc.empresa_id=p_empresa and rc.pedido_id=p_pedido_id;

  select coalesce(jsonb_agg(jsonb_build_object('id',d->>'codigo','codigo',d->>'codigo','c',(d->>'delta')::integer)),'[]'::jsonb)
    into v_salen
    from jsonb_array_elements(v_diff) d
   where (d->>'delta')::integer>0;

  select coalesce(jsonb_agg(jsonb_build_object('id',d->>'codigo','codigo',d->>'codigo','c',-(d->>'delta')::integer)),'[]'::jsonb)
    into v_vuelven
    from jsonb_array_elements(v_diff) d
   where (d->>'delta')::integer<0;

  return jsonb_build_object(
    'ok',true,'pedidoId',p_pedido_id,'controlStock',v_control,
    'salen',case when v_control then v_salen else '[]'::jsonb end,
    'vuelven',case when v_control then v_vuelven else '[]'::jsonb end,'rutaSincronizada',true
  );
end
$function$;

create or replace function public.ruta_editar_items_atomico(
  p_empresa uuid,p_ruta uuid,p_cliente uuid,p_items jsonb,p_items_esperados jsonb,
  p_total numeric,p_importe numeric,p_dsc_general jsonb,p_usuario text,p_descuentos jsonb default null
) returns jsonb language plpgsql security definer set search_path=public as $fn$
declare
  rc public.ruta_clientes%rowtype;
  bk public.backup_pedidos%rowtype;
  pedido uuid;
  nuevos jsonb;
  pendientes jsonb;
  dif record;
  v_control boolean;
  v_desc jsonb;
  v_hist jsonb;
  v_ref text:='edicion-ruta-'||gen_random_uuid()::text;
begin
  if not public.app_es_superadmin() and public.app_empresa_id() is distinct from p_empresa then
    raise exception 'ACCESO_EMPRESA_DENEGADO';
  end if;
  if p_empresa is null or p_items is null or jsonb_typeof(p_items)<>'array'
     or p_items_esperados is null or p_total is null or p_importe is null or p_total<0 or p_importe<0 then
    raise exception 'PEDIDO_EDICION_DATOS_INVALIDOS';
  end if;
  select pedido_id into pedido from public.ruta_clientes where id=p_cliente and ruta_id=p_ruta and empresa_id=p_empresa;
  if not found then raise exception 'PARADA_NO_ENCONTRADA'; end if;
  if pedido is not null then
    select * into bk from public.backup_pedidos where id=pedido and empresa_id=p_empresa for update;
    if not found then raise exception 'PEDIDO_NO_ENCONTRADO'; end if;
  end if;
  select * into rc from public.ruta_clientes where id=p_cliente and ruta_id=p_ruta and empresa_id=p_empresa for update;
  if not found or rc.pedido_id is distinct from pedido then raise exception 'PEDIDO_CAMBIO_CONCURRENTE'; end if;
  if rc.rechazo_confirmado or coalesce(bk.stock_devuelto,false) then raise exception 'PEDIDO_RECHAZADO_NO_EDITABLE_EN_RUTA'; end if;
  if coalesce(rc.items,'[]'::jsonb) is distinct from p_items_esperados then raise exception 'PEDIDO_CAMBIO_CONCURRENTE'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) j where
    coalesce(j->>'c','') !~ '^[0-9]+([.]0+)?$' or (j->>'c')::numeric<=0) then
    raise exception 'STOCK_CANTIDAD_INVALIDA';
  end if;
  v_desc:=p_descuentos;
  if pedido is not null then
    -- No pisar el pedido desde una foto antigua de la ruta.
    if exists(
      (select * from public._stock_items_cantidades(rc.items) except select * from public._stock_items_cantidades(bk.items))
      union all
      (select * from public._stock_items_cantidades(bk.items) except select * from public._stock_items_cantidades(rc.items))
    ) then raise exception 'PEDIDO_RUTA_DESACTUALIZADO'; end if;
    select coalesce(jsonb_agg(j order by ord),'[]'::jsonb) into pendientes
      from jsonb_array_elements(coalesce(bk.items,'[]'::jsonb)) with ordinality x(j,ord)
     where j->>'pendiente'='true' and not exists(
       select 1 from jsonb_array_elements(p_items) n where
       coalesce(n->>'id',n->>'codigo',n->>'n')=coalesce(j->>'id',j->>'codigo',j->>'n'));
    nuevos:=p_items||pendientes;
    v_hist:=coalesce(bk.historial,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
      'tipo','edicion','fecha',now(),'usuario',p_usuario,'resumen','Productos editados desde Hoja de Ruta'));
    perform public.pedido_editar_atomico(p_empresa,pedido,jsonb_build_object(
      'items',nuevos,'total',p_total,'total_con_iva',p_importe,'descuentos',v_desc,'historial',v_hist),bk.items,p_usuario);
  else
    select coalesce(control_stock,false) into v_control from public.empresas where id=p_empresa;
    if v_control then
      for dif in
        select coalesce(a.codigo,b.codigo) codigo,coalesce(a.cant,0)-coalesce(b.cant,0) delta
        from public._stock_items_cantidades(rc.items) a full join public._stock_items_cantidades(p_items) b using(codigo)
        where coalesce(a.cant,0)<>coalesce(b.cant,0) order by 1
      loop
        perform public._stock_lotes_codigo_canonico(p_empresa,dif.codigo);
        perform public._stk_mover(p_empresa,dif.codigo,dif.delta,'Edición confirmada en reparto',p_usuario,
          case when dif.delta>0 then 'devolucion' else 'salida' end,v_ref);
      end loop;
    end if;
  end if;
  update public.ruta_clientes set items=p_items,importe=p_importe,dsc_general=p_dsc_general,
    audit_log=coalesce(audit_log,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('ts',now(),'quien',p_usuario,'desc','Edición de productos y stock confirmada'))
    where id=p_cliente and empresa_id=p_empresa returning * into rc;
  return jsonb_build_object('ok',true,'items',rc.items,'importe',rc.importe,'dscGeneral',rc.dsc_general,
    'auditLog',rc.audit_log,'pedidoId',pedido,'pedidoItems',nuevos,'total',p_total,'descuentos',v_desc);
end $fn$;
revoke all on function public.ruta_editar_items_atomico(uuid,uuid,uuid,jsonb,jsonb,numeric,numeric,jsonb,text,jsonb) from public;
grant execute on function public.ruta_editar_items_atomico(uuid,uuid,uuid,jsonb,jsonb,numeric,numeric,jsonb,text,jsonb) to anon,authenticated;

create or replace function public.stock_recuperar_claves_atomico(p_empresa uuid,p_items jsonb,p_usuario text)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare x jsonb; v_actual integer; v_viejo integer;
begin
  if not coalesce(public.deposito_actor_puede_editar(p_empresa),false) then raise exception 'SOLO_ADMIN_PUEDE_GESTIONAR_STOCK'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'STOCK_DATOS_INVALIDOS'; end if;
  if exists(select 1 from jsonb_array_elements(p_items) a,jsonb_array_elements(p_items) b
    where a->>'k'=b->>'codigo') then raise exception 'STOCK_CLAVES_AMBIGUAS'; end if;
  perform 1 from public.stock where empresa_id=p_empresa and codigo in
    (select j->>'codigo' from jsonb_array_elements(p_items) j union select j->>'k' from jsonb_array_elements(p_items) j)
    order by codigo for update;
  for x in select j from jsonb_array_elements(p_items) j order by j->>'codigo' loop
    if (x->>'colgadas')::integer<=0 or not exists(select 1 from public.productos
      where empresa_id=p_empresa and id::text=x->>'k' and codigo=x->>'codigo') then raise exception 'STOCK_CLAVE_ANTIGUA_INVALIDA'; end if;
    select cantidad into v_viejo from public.stock where empresa_id=p_empresa and codigo=x->>'k';
    if v_viejo is distinct from (x->>'colgadas')::integer then raise exception 'STOCK_CAMBIO_CONCURRENTE'; end if;
    perform public.stock_ajustar_manual_atomico(p_empresa,x->>'codigo',(x->>'colgadas')::integer,(x->>'actual')::integer,
      p_usuario,'Recuperación confirmada de clave antigua','ajuste');
    update public.stock set cantidad=0,updated_at=now() where empresa_id=p_empresa and codigo=x->>'k';
    insert into public.stock_movimientos(empresa_id,codigo,delta,anterior,nuevo,motivo,usuario,fecha,tipo,ref)
    values(p_empresa::text,x->>'k',-v_viejo,v_viejo,0,'Cierre confirmado de clave antigua',p_usuario,now(),'ajuste','recuperar-'||gen_random_uuid());
  end loop;
  return jsonb_build_object('ok',true);
end $fn$;
revoke all on function public.stock_recuperar_claves_atomico(uuid,jsonb,text) from public;
grant execute on function public.stock_recuperar_claves_atomico(uuid,jsonb,text) to anon,authenticated;

create or replace function public.pedido_borrar_stock_atomico(p_empresa uuid,p_pedido_id uuid,p_items_esperados jsonb,p_usuario text)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare b public.backup_pedidos%rowtype; c boolean; its jsonb;
begin
  if not public.app_es_superadmin() and public.app_empresa_id() is distinct from p_empresa then raise exception 'ACCESO_EMPRESA_DENEGADO'; end if;
  select * into b from public.backup_pedidos where id=p_pedido_id and empresa_id=p_empresa for update;
  if not found then return jsonb_build_object('ok',true,'repetido',true); end if;
  if b.items is distinct from p_items_esperados then raise exception 'PEDIDO_CAMBIO_CONCURRENTE'; end if;
  if exists(select 1 from public.ruta_clientes where empresa_id=p_empresa and pedido_id=b.id) then
    raise exception 'Quitá el pedido de su hoja de ruta antes de borrarlo del backup';
  end if;
  select control_stock into c from public.empresas where id=p_empresa;
  if c and not coalesce(b.stock_devuelto,false) then
    select jsonb_agg(jsonb_build_object('codigo',codigo,'cant',cant)) into its from public._stock_items_cantidades(b.items);
    if its is not null then perform public.stk_devolver(p_empresa,'borrado-'||b.id,its,p_usuario,'Pedido borrado confirmado'); end if;
  end if;
  delete from public.backup_pedidos where id=b.id and empresa_id=p_empresa;
  return jsonb_build_object('ok',true,'pedidoId',b.id);
end $fn$;
revoke all on function public.pedido_borrar_stock_atomico(uuid,uuid,jsonb,text) from public;
grant execute on function public.pedido_borrar_stock_atomico(uuid,uuid,jsonb,text) to anon,authenticated;

create or replace function public.productos_codigo_no_duplicado()
returns trigger language plpgsql security definer set search_path=public as $fn$
declare codigo_normal text;
begin
  codigo_normal:=upper(btrim(coalesce(new.codigo,'')));
  if codigo_normal='' then return new; end if;
  if tg_op='UPDATE' and old.empresa_id=new.empresa_id and upper(btrim(old.codigo))=codigo_normal then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.empresa_id::text||':producto:'||codigo_normal,0));
  if exists(select 1 from public.productos p where p.empresa_id=new.empresa_id and upper(btrim(p.codigo))=codigo_normal and p.id<>new.id) then
    raise exception 'CODIGO_PRODUCTO_DUPLICADO|Ya existe un producto con el código %',new.codigo;
  end if;
  return new;
end $fn$;
revoke all on function public.productos_codigo_no_duplicado() from public,anon,authenticated;
create index if not exists productos_empresa_codigo_normalizado on public.productos(empresa_id,upper(btrim(codigo)));
drop trigger if exists productos_codigo_no_duplicado on public.productos;
create trigger productos_codigo_no_duplicado before insert or update of codigo,empresa_id on public.productos for each row execute function public.productos_codigo_no_duplicado();

CREATE OR REPLACE FUNCTION public._stk_mover(p_empresa uuid, p_codigo text, p_delta numeric, p_motivo text, p_usuario text, p_tipo text, p_ref text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ant integer;
  v_nvo integer;
  v_delta integer;
  v_control boolean := false;
begin
  if p_empresa is null or nullif(btrim(p_codigo),'') is null then
    raise exception 'STOCK_DATOS_INVALIDOS';
  end if;
  if p_delta is null or p_delta <> trunc(p_delta) then
    raise exception 'STOCK_CANTIDAD_INVALIDA|codigo=%', p_codigo;
  end if;
  perform public._stock_lotes_codigo_canonico(p_empresa,p_codigo);
  v_delta := p_delta::integer;
  perform set_config('app.stock_actor',coalesce(p_usuario,'sistema'),true);
  perform set_config('app.stock_reason',coalesce(p_motivo,'Movimiento confirmado'),true);

  select coalesce(e.control_stock,false)
    into v_control
    from public.empresas e
   where e.id = p_empresa;

  insert into public.stock (empresa_id, codigo, cantidad, reservado, updated_at)
  values (p_empresa, p_codigo, 0, 0, now())
  on conflict (empresa_id, codigo) do nothing;

  select coalesce(s.cantidad,0)
    into v_ant
    from public.stock s
   where s.empresa_id = p_empresa
     and s.codigo = p_codigo
   for update;

  v_nvo := coalesce(v_ant,0) + v_delta;
  if v_control and v_delta < 0 and v_nvo < 0 then
    raise exception using
      errcode = 'P0001',
      message = format(
        'STOCK_INSUFICIENTE|codigo=%s|disponible=%s|solicitado=%s',
        p_codigo, greatest(v_ant,0), abs(v_delta)
      );
  end if;

  update public.stock
     set cantidad = v_nvo,
         updated_at = now()
   where empresa_id = p_empresa
     and codigo = p_codigo;

  insert into public.stock_movimientos
    (empresa_id, codigo, delta, anterior, nuevo, motivo, usuario, fecha, tipo, ref)
  values
    (p_empresa::text, p_codigo, v_delta, v_ant, v_nvo,
     coalesce(nullif(p_motivo,''),'Movimiento de stock'),
     coalesce(nullif(p_usuario,''),'sistema'), now(), p_tipo, p_ref);
end
$function$
;
CREATE OR REPLACE FUNCTION public.stk_confirmar_salida(p_empresa uuid, p_ref text, p_items jsonb, p_usuario text, p_motivo text DEFAULT 'Pedido enviado'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_insertadas integer;
  v_item record;
  v_disponible numeric;
  v_control_stock boolean;
begin
  if p_empresa is null or nullif(trim(p_ref), '') is null then
    raise exception 'STOCK_DATOS_INVALIDOS';
  end if;

  if not coalesce(app_es_superadmin(),false) and app_empresa_id() is distinct from p_empresa then
    raise exception 'empresa no coincide';
  end if;

  -- Defensa central: una versión vieja del panel o una cola offline tampoco
  -- puede descontar inventario cuando la distribuidora trabaja en preventa.
  select coalesce(e.control_stock, false)
    into v_control_stock
  from public.empresas e
  where e.id = p_empresa;

  if not found then
    raise exception 'EMPRESA_NO_ENCONTRADA';
  end if;

  if not v_control_stock then
    return jsonb_build_object(
      'ok', true,
      'omitido', true,
      'control_stock', false,
      'referencia', p_ref
    );
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'STOCK_ITEMS_INVALIDOS';
  end if;

  if exists(select 1 from jsonb_to_recordset(p_items) x(codigo text,cant numeric)
    where nullif(btrim(codigo),'') is null or cant is null or cant<=0 or cant<>trunc(cant)) then
    raise exception 'STOCK_ITEMS_INVALIDOS';
  end if;
  -- La misma referencia solamente puede descontarse una vez.
  insert into public.stock_operaciones(
    empresa_id,
    referencia,
    tipo,
    items,
    usuario,
    motivo
  )
  values (
    p_empresa,
    p_ref,
    'salida_pedido',
    p_items,
    p_usuario,
    p_motivo
  )
  on conflict (empresa_id, referencia, tipo) do nothing;

  get diagnostics v_insertadas = row_count;

  if v_insertadas = 0 then
    return jsonb_build_object(
      'ok', true,
      'repetido', true,
      'referencia', p_ref
    );
  end if;

  -- Bloqueo determinístico para ventas simultáneas.
  perform 1
  from public.stock s
  where s.empresa_id = p_empresa
    and s.codigo::text in (
      select x.codigo
      from jsonb_to_recordset(p_items) as x(codigo text, cant numeric)
      where x.codigo is not null and x.cant > 0
    )
  order by s.codigo
  for update;

  -- Primero se valida el pedido entero; si un producto no alcanza, se revierte
  -- toda la transacción y no queda ningún descuento parcial.
  for v_item in
    select x.codigo, sum(x.cant)::numeric as cant
    from jsonb_to_recordset(p_items) as x(codigo text, cant numeric)
    where x.codigo is not null and x.cant > 0
    group by x.codigo
    order by x.codigo
  loop
    select coalesce(s.cantidad, 0)::numeric
      into v_disponible
    from public.stock s
    where s.empresa_id = p_empresa
      and s.codigo::text = v_item.codigo;

    if not found then
      raise exception 'STOCK_INSUFICIENTE|%|pedido=%|disponible=0',
        v_item.codigo, v_item.cant;
    end if;

    if v_disponible < v_item.cant then
      raise exception 'STOCK_INSUFICIENTE|%|pedido=%|disponible=%',
        v_item.codigo, v_item.cant, v_disponible;
    end if;
  end loop;

  for v_item in
    select x.codigo, sum(x.cant)::numeric as cant
    from jsonb_to_recordset(p_items) as x(codigo text, cant numeric)
    where x.codigo is not null and x.cant > 0
    group by x.codigo
    order by x.codigo
  loop
    perform public._stk_mover(p_empresa,v_item.codigo,-v_item.cant,p_motivo,p_usuario,'salida',p_ref);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'repetido', false,
    'control_stock', true,
    'referencia', p_ref
  );
end;
$function$
;
create or replace function public.stk_devolver(p_empresa uuid,p_ref text,p_items jsonb,p_usuario text default 'sistema',p_motivo text default null)
returns jsonb language plpgsql security definer set search_path=public as $fn$
declare it record; n integer; c boolean;
begin
  if p_empresa is null or nullif(btrim(p_ref),'') is null then raise exception 'STOCK_DATOS_INVALIDOS'; end if;
  if not coalesce(public.app_es_superadmin(),false) and public.app_empresa_id() is distinct from p_empresa then raise exception 'ACCESO_EMPRESA_DENEGADO'; end if;
  select control_stock into c from public.empresas where id=p_empresa;
  if not found then raise exception 'EMPRESA_NO_ENCONTRADA'; end if;
  if not c then return jsonb_build_object('ok',true,'omitido',true,'control_stock',false); end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'STOCK_ITEMS_INVALIDOS'; end if;
  if exists(select 1 from jsonb_to_recordset(p_items) x(codigo text,cant numeric)
    where nullif(btrim(codigo),'') is null or cant is null or cant<=0 or cant<>trunc(cant)) then raise exception 'STOCK_ITEMS_INVALIDOS'; end if;
  insert into public.stock_refs(empresa_id,ref,estado,items) values(p_empresa,p_ref,'devuelto',p_items)
    on conflict(empresa_id,ref) do nothing;
  get diagnostics n=row_count;
  if n=0 then return jsonb_build_object('ok',true,'repetido',true); end if;
  for it in select codigo,sum(cant) cant from jsonb_to_recordset(p_items) x(codigo text,cant numeric) group by codigo order by codigo loop
    perform public._stk_mover(p_empresa,it.codigo,it.cant,coalesce(nullif(p_motivo,''),'Vuelve al stock'),p_usuario,'devolucion',p_ref);
  end loop;
  return jsonb_build_object('ok',true,'repetido',false);
end $fn$;
revoke all on function public._stk_mover(uuid,text,numeric,text,text,text,text) from public,anon,authenticated;
