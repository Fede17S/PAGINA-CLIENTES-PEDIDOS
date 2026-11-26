-- Historial aditivo. No recalcula importes ni toca productos/stock/cobros.
create or replace function public.ruta_audit_lista_v1(p_lista jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
 select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(k,v),'{}'::jsonb)
   from jsonb_each(x) e(k,v) where k=any(array[
    'id','codigo','cod','n','nombre','nom','name','c','cant','cantidad','qty','p','precio','sub','total',
    'disc','dsc','descuento','ofAplicada','promoAplicada','ofPrecio','promoPrecio','ofNormal','promoNormal',
    'producto','motivo','nota','monto','precioUnit','estado','descuenta','stkDev','stockAbsorbidoPorRechazo',
    'ts','fecha','forma','usuario','retirada'
   ])) order by ord),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(p_lista)='array' then p_lista else '[]'::jsonb end) with ordinality a(x,ord)
 where jsonb_typeof(x)='object'
$$;
revoke all on function public.ruta_audit_lista_v1(jsonb) from public;
grant execute on function public.ruta_audit_lista_v1(jsonb) to anon,authenticated;

create or replace function public.ruta_audit_detallado_v1()
returns trigger language plpgsql security invoker set search_path='' as $$
declare
  antes jsonb; despues jsonb; cambios jsonb:='[]'::jsonb;
  viejo jsonb; entrante jsonb; agregado jsonb; log jsonb; evento jsonb; clave text;
  encabezados jsonb; token text; v_uid text; nombre text; rol text; roles text[];
  seccion text; origen text; verificado boolean:=false; evento_id text:=gen_random_uuid()::text;
  momento timestamptz:=clock_timestamp();
begin
  -- Elegir sólo campos de negocio: jamás duplicar imágenes, firmas, claves o tokens.
  antes:=jsonb_build_object('importe',old.importe,'efectivo',old.efectivo,'transferencia',old.transferencia,
    'modo',old.modo,'entregado',old.entregado,'entregado_en',old.entregado_en,
    'items',public.ruta_audit_lista_v1(old.items),'dsc_general',old.dsc_general,
    'pagos_adicionales',public.ruta_audit_lista_v1(old.pagos_adicionales),
    'devoluciones',public.ruta_audit_lista_v1(old.devoluciones),'rechazado',old.rechazado,
    'rechazo_confirmado',old.rechazo_confirmado,'motivo_rechazo',old.motivo_rechazo,
    'ruta_id',old.ruta_id,'fecha',old.fecha,'reprogramado_de',old.reprogramado_de,'reprogramado_en',old.reprogramado_en,
    'obs',old.obs,'lista',old.lista,'tipo_comprobante',old.tipo_comprobante,'remito_num',old.remito_num,
    'nom',old.nom,'cliente_id',old.cliente_id);
  despues:=jsonb_build_object('importe',new.importe,'efectivo',new.efectivo,'transferencia',new.transferencia,
    'modo',new.modo,'entregado',new.entregado,'entregado_en',new.entregado_en,
    'items',public.ruta_audit_lista_v1(new.items),'dsc_general',new.dsc_general,
    'pagos_adicionales',public.ruta_audit_lista_v1(new.pagos_adicionales),
    'devoluciones',public.ruta_audit_lista_v1(new.devoluciones),'rechazado',new.rechazado,
    'rechazo_confirmado',new.rechazo_confirmado,'motivo_rechazo',new.motivo_rechazo,
    'ruta_id',new.ruta_id,'fecha',new.fecha,'reprogramado_de',new.reprogramado_de,'reprogramado_en',new.reprogramado_en,
    'obs',new.obs,'lista',new.lista,'tipo_comprobante',new.tipo_comprobante,'remito_num',new.remito_num,
    'nom',new.nom,'cliente_id',new.cliente_id);
  for clave in select jsonb_object_keys(despues) loop
    if antes->clave is distinct from despues->clave then
      cambios:=cambios||jsonb_build_array(jsonb_build_object('campo',clave,'antes',antes->clave,'despues',despues->clave));
    end if;
  end loop;
  if old.firma is distinct from new.firma then cambios:=cambios||jsonb_build_array(jsonb_build_object('campo','firma','antes',coalesce(length(old.firma)>0,false),'despues',coalesce(length(new.firma)>0,false),'reemplazada',coalesce(length(old.firma)>0,false) and coalesce(length(new.firma)>0,false)));end if;
  if old.comprobantes is distinct from new.comprobantes then cambios:=cambios||jsonb_build_array(jsonb_build_object('campo','comprobantes','antes',case when jsonb_typeof(old.comprobantes)='array' then jsonb_array_length(old.comprobantes) else 0 end,'despues',case when jsonb_typeof(new.comprobantes)='array' then jsonb_array_length(new.comprobantes) else 0 end));end if;

  viejo:=case when jsonb_typeof(old.audit_log)='array' then old.audit_log else '[]'::jsonb end;
  entrante:=case when jsonb_typeof(new.audit_log)='array' then new.audit_log else '[]'::jsonb end;
  log:=viejo;
  for agregado in select value from jsonb_array_elements(entrante) loop
    if not exists(select 1 from jsonb_array_elements(log)x where x=agregado or
       (nullif(agregado->>'id','') is not null and x->>'id'=agregado->>'id')) then
      -- Los datos confirmados del servidor son inmutables; las entradas enviadas
      -- por el cliente se conservan como legado, nunca como identidad verificada.
      agregado:=agregado-'servidor'-'verificado'-'version';
      if jsonb_array_length(cambios)>0 then agregado:=agregado||jsonb_build_object('complementadoPor',evento_id);end if;
      log:=log||jsonb_build_array(agregado);
    end if;
  end loop;
  if jsonb_array_length(cambios)=0 then new.audit_log:=log;return new;end if;
  begin
    encabezados:=current_setting('request.headers',true)::jsonb;
    if public.app_empresa_id()=new.empresa_id then
      token:=encabezados->>'x-empresa-token';
      v_uid:=convert_from(public.app_b64url_decode(split_part(token,'.',2)),'UTF8')::jsonb->>'uid';
      select u.name,u.role,u.roles into nombre,rol,roles from public.usuarios u where u.empresa_id=new.empresa_id and lower(u.uid)=lower(v_uid) limit 1;
      verificado:=found;
    end if;
  exception when invalid_text_representation or invalid_parameter_value then verificado:=false;end;
  if not verificado then v_uid:=null;nombre:='Sistema / usuario no identificado';rol:='sistema';end if;
  seccion:=case when encabezados->>'x-panel-seccion' in ('hoja','mapa-entregas','reparto','backup','dash','inicio','armado') then encabezados->>'x-panel-seccion' else null end;
  origen:=case when seccion in ('mapa-entregas','reparto') then 'Reparto' when seccion='hoja' then 'Hoja de Ruta' when seccion='backup' then 'Backup de Pedidos' when seccion='armado' then 'Armado' when seccion in ('dash','inicio') then 'Inicio' when rol='repartidor' then 'Reparto' when rol='admin' or 'admin'=any(roles) then 'Administración' else 'Sistema' end;
  evento:=jsonb_build_object('id',evento_id,'ts',momento,'uid',v_uid,'quien',coalesce(nullif(nombre,''),v_uid,'Sistema'),
    'rol',rol,'roles',roles,'origen',origen,'seccion',seccion,'servidor',true,'verificado',verificado,'version',1,
    'desc','Modificación del pedido','cambios',cambios);
  new.audit_log:=log||jsonb_build_array(evento);
  return new;
end $$;
revoke all on function public.ruta_audit_detallado_v1() from public;
drop trigger if exists trg_ruta_historial_detallado_v1 on public.ruta_clientes;
create trigger trg_ruta_historial_detallado_v1 before update on public.ruta_clientes
for each row execute function public.ruta_audit_detallado_v1();
