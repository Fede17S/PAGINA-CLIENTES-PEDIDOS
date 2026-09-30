begin;

create table if not exists public.ruta_clientes_bajas (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ruta_id uuid not null,
  ruta_cliente_id uuid not null,
  pedido_id uuid,
  fila jsonb not null,
  motivo text not null,
  usuario_id text,
  eliminada_en timestamptz not null default now(),
  restaurada_en timestamptz
);

create index if not exists ruta_clientes_bajas_empresa_fecha_idx
  on public.ruta_clientes_bajas (empresa_id, eliminada_en desc);
create index if not exists ruta_clientes_bajas_pedido_idx
  on public.ruta_clientes_bajas (empresa_id, pedido_id)
  where pedido_id is not null;

alter table public.ruta_clientes_bajas enable row level security;
drop policy if exists ruta_clientes_bajas_empresa on public.ruta_clientes_bajas;
create policy ruta_clientes_bajas_empresa
  on public.ruta_clientes_bajas
  for select
  using (
    empresa_id = public.app_empresa_id()
    or public.app_es_superadmin()
  );

revoke all on public.ruta_clientes_bajas from public, anon, authenticated;
grant select on public.ruta_clientes_bajas to anon, authenticated;

create or replace function public.ruta_clientes_quitar_seguro(
  p_empresa uuid,
  p_ruta uuid,
  p_clientes uuid[],
  p_usuario text,
  p_motivo text,
  p_confirmacion text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruta public.rutas%rowtype;
  v_ids uuid[];
  v_solicitados integer;
  v_encontrados integer;
  v_borrados integer;
begin
  perform set_config('statement_timeout','8s',true);
  if not coalesce(public.app_es_superadmin(),false)
     and public.app_empresa_id() is distinct from p_empresa then
    raise exception 'ACCESO_EMPRESA_DENEGADO';
  end if;

  select array_agg(distinct x) into v_ids
  from unnest(coalesce(p_clientes,array[]::uuid[])) as t(x)
  where x is not null;
  v_solicitados := coalesce(array_length(v_ids,1),0);
  if v_solicitados < 1 or v_solicitados > 100 then
    raise exception 'CANTIDAD_INVALIDA: se permiten entre 1 y 100 paradas';
  end if;

  select * into v_ruta
  from public.rutas
  where id=p_ruta and empresa_id=p_empresa
  for update;
  if not found then raise exception 'RUTA_NO_ENCONTRADA'; end if;

  if trim(coalesce(p_confirmacion,'')) not in (
    p_ruta::text,
    trim(coalesce(v_ruta.hr_num,'')),
    trim(coalesce(v_ruta.nombre,''))
  ) then
    raise exception 'CONFIRMACION_RUTA_INVALIDA';
  end if;

  perform 1
  from public.ruta_clientes
  where empresa_id=p_empresa and ruta_id=p_ruta and id=any(v_ids)
  order by id
  for update;
  select count(*) into v_encontrados
  from public.ruta_clientes
  where empresa_id=p_empresa and ruta_id=p_ruta and id=any(v_ids);
  if v_encontrados <> v_solicitados then
    raise exception 'SELECCION_CAMBIO: esperadas %, encontradas %',v_solicitados,v_encontrados;
  end if;

  insert into public.ruta_clientes_bajas(
    empresa_id,ruta_id,ruta_cliente_id,pedido_id,fila,motivo,usuario_id
  )
  select rc.empresa_id,rc.ruta_id,rc.id,rc.pedido_id,to_jsonb(rc),
         left(coalesce(nullif(trim(p_motivo),''),'Quitar de hoja de ruta'),300),
         left(coalesce(p_usuario,'usuario'),120)
  from public.ruta_clientes rc
  where rc.empresa_id=p_empresa and rc.ruta_id=p_ruta and rc.id=any(v_ids);

  update public.backup_pedidos b
  set ruta_vinculada_id=null
  where b.empresa_id=p_empresa
    and b.ruta_vinculada_id=p_ruta
    and b.id in (
      select rc.pedido_id
      from public.ruta_clientes rc
      where rc.empresa_id=p_empresa and rc.ruta_id=p_ruta
        and rc.id=any(v_ids) and rc.pedido_id is not null
    );

  delete from public.ruta_clientes
  where empresa_id=p_empresa and ruta_id=p_ruta and id=any(v_ids);
  get diagnostics v_borrados = row_count;
  if v_borrados <> v_solicitados then
    raise exception 'BORRADO_INCOMPLETO: esperadas %, borradas %',v_solicitados,v_borrados;
  end if;

  if to_regclass('public.auditoria') is not null then
    insert into public.auditoria(
      empresa_id,usuario_id,usuario_nom,accion,entidad,entidad_id,detalle,datos
    ) values (
      p_empresa,left(coalesce(p_usuario,'usuario'),120),left(coalesce(p_usuario,'usuario'),120),
      'quitar','pedidos_ruta',p_ruta::text,
      'Quitó '||v_borrados||' pedido(s) de '||coalesce(v_ruta.hr_num,v_ruta.nombre,p_ruta::text),
      jsonb_build_object('ruta_id',p_ruta,'clientes',v_ids,'motivo',p_motivo)
    );
  end if;

  return jsonb_build_object('ok',true,'borrados',v_borrados,'ruta_id',p_ruta);
end;
$$;

create or replace function public.ruta_cliente_limpiar_duplicado(
  p_empresa uuid,
  p_cliente uuid,
  p_canonica uuid,
  p_usuario text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_obj public.ruta_clientes%rowtype;
  v_can public.ruta_clientes%rowtype;
begin
  perform set_config('statement_timeout','5s',true);
  if not coalesce(public.app_es_superadmin(),false)
     and public.app_empresa_id() is distinct from p_empresa then
    raise exception 'ACCESO_EMPRESA_DENEGADO';
  end if;
  if p_cliente is null or p_canonica is null or p_cliente=p_canonica then
    raise exception 'DUPLICADO_INVALIDO';
  end if;

  perform 1 from public.ruta_clientes
  where empresa_id=p_empresa and id in (p_cliente,p_canonica)
  order by id for update;
  select * into v_obj from public.ruta_clientes where empresa_id=p_empresa and id=p_cliente;
  select * into v_can from public.ruta_clientes where empresa_id=p_empresa and id=p_canonica;
  if v_obj.id is null or v_can.id is null then raise exception 'PARADA_NO_ENCONTRADA'; end if;
  if v_obj.pedido_id is null or v_can.pedido_id is null or v_obj.pedido_id<>v_can.pedido_id then
    raise exception 'NO_SON_EL_MISMO_PEDIDO';
  end if;

  insert into public.ruta_clientes_bajas(
    empresa_id,ruta_id,ruta_cliente_id,pedido_id,fila,motivo,usuario_id
  ) values (
    v_obj.empresa_id,v_obj.ruta_id,v_obj.id,v_obj.pedido_id,to_jsonb(v_obj),
    'Limpieza verificada de fila duplicada',left(coalesce(p_usuario,'usuario'),120)
  );
  delete from public.ruta_clientes where id=v_obj.id and empresa_id=p_empresa;
  return jsonb_build_object('ok',true,'borrado',v_obj.id,'canonica',v_can.id);
end;
$$;

revoke all on function public.ruta_clientes_quitar_seguro(uuid,uuid,uuid[],text,text,text) from public;
revoke all on function public.ruta_cliente_limpiar_duplicado(uuid,uuid,uuid,text) from public;
grant execute on function public.ruta_clientes_quitar_seguro(uuid,uuid,uuid[],text,text,text) to anon, authenticated;
grant execute on function public.ruta_cliente_limpiar_duplicado(uuid,uuid,uuid,text) to anon, authenticated;

-- El navegador conserva SELECT/INSERT/UPDATE, pero ya no puede ejecutar un
-- DELETE o TRUNCATE directo. Todo borrado pasa por las funciones anteriores.
revoke delete, truncate on public.ruta_clientes from public, anon, authenticated;

comment on table public.ruta_clientes_bajas is
  'Archivo recuperable de paradas quitadas de hojas de ruta.';
comment on function public.ruta_clientes_quitar_seguro(uuid,uuid,uuid[],text,text,text) is
  'Quita hasta 100 paradas de una misma HR, archiva las filas y desvincula sus backups en una transaccion.';

commit;
