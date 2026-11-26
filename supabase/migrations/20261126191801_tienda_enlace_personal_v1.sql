-- Acceso de compra individual. No modifica clientes, pedidos ni precios.
-- Depende del lookup de listas tienda_privada.cliente_por_id ya instalado.
create table tienda_privada.accesos_envio_v1 (
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  enlace_hash bytea unique,
  enlace_vence timestamptz,
  sesion_hash bytea unique,
  sesion_vence timestamptz,
  primary key (empresa_id, usuario_id)
);
alter table tienda_privada.accesos_envio_v1 enable row level security;
revoke all on table tienda_privada.accesos_envio_v1 from public, anon, authenticated;

create function tienda_privada.emitir_enlace_v1(p_empresa uuid,p_usuario uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  emisor text; clave text; codigo_tienda text; valido integer;
  cliente public.usuarios%rowtype;
begin
  -- El panel usa token propio: primero validar empresa, firma y vigencia con el
  -- helper establecido. Después resolver el UID dentro de esa misma empresa.
  if p_empresa is null or public.app_empresa_id() is distinct from p_empresa then
    raise exception 'TIENDA_ACCESO_DENEGADO';
  end if;
  emisor:=convert_from(public.app_b64url_decode(split_part(current_setting('request.headers',true)::jsonb->>'x-empresa-token','.',2)),'UTF8')::jsonb->>'uid';
  select count(*) into valido from public.usuarios u where u.empresa_id=p_empresa and lower(btrim(u.uid))=lower(btrim(emisor));
  if valido<>1 or not exists (
    select 1 from public.usuarios u where u.empresa_id=p_empresa and lower(btrim(u.uid))=lower(btrim(emisor))
    and (u.role in ('admin','co-admin') or u.roles && array['admin','co-admin']::text[])
  ) then raise exception 'TIENDA_ACCESO_DENEGADO'; end if;

  select e.codigo into codigo_tienda from public.empresas e where e.id=p_empresa and e.estado='activa';
  select * into cliente from public.usuarios u where u.empresa_id=p_empresa and u.id=p_usuario and u.role='cliente'
    and coalesce(u.roles,array[]::text[]) <@ array['cliente']::text[];
  if not found or nullif(btrim(codigo_tienda),'') is null or tienda_privada.cliente_por_id(p_empresa,cliente.uid) is null then
    raise exception 'TIENDA_CLIENTE_NO_DISPONIBLE';
  end if;
  clave:=encode(extensions.gen_random_bytes(32),'hex');
  insert into tienda_privada.accesos_envio_v1(empresa_id,usuario_id,enlace_hash,enlace_vence)
  values(p_empresa,p_usuario,extensions.digest(clave,'sha256'),now()+interval '72 hours')
  on conflict (empresa_id,usuario_id) do update set enlace_hash=excluded.enlace_hash,enlace_vence=excluded.enlace_vence,sesion_hash=null,sesion_vence=null;
  return jsonb_build_object('codigo',codigo_tienda,'token',clave,'telefono',coalesce(cliente.telefono,''));
end;
$$;

create function tienda_privada.acceso_envio_v1(p_empresa uuid,p_token text,p_accion text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  llave bytea; ficha uuid; nueva text; perfil jsonb; cliente public.usuarios%rowtype;
begin
  if p_empresa is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' or p_accion is null or p_accion not in ('activar','perfil','salir') then return null; end if;
  llave:=extensions.digest(p_token,'sha256');
  if p_accion='salir' then
    update tienda_privada.accesos_envio_v1 set sesion_hash=null,sesion_vence=null
      where empresa_id=p_empresa and sesion_hash=llave;
    return null;
  end if;
  if p_accion='activar' then
    select a.usuario_id into ficha from tienda_privada.accesos_envio_v1 a
    where a.empresa_id=p_empresa and a.enlace_hash=llave and a.enlace_vence>now() for update;
  else
    select a.usuario_id into ficha from tienda_privada.accesos_envio_v1 a
    where a.empresa_id=p_empresa and a.sesion_hash=llave and a.sesion_vence>now();
  end if;
  if ficha is null then return null; end if;

  -- Se lee la ficha y lista actuales. Un cambio de rol, empresa o lista inválida
  -- no puede convertir el enlace de compra en acceso administrativo.
  select * into cliente from public.usuarios u where u.id=ficha and u.empresa_id=p_empresa and u.role='cliente'
    and coalesce(u.roles,array[]::text[]) <@ array['cliente']::text[];
  if not found then return null; end if;
  perfil:=tienda_privada.cliente_por_id(p_empresa,cliente.uid);
  if perfil is null then return null; end if;
  perfil:=perfil||jsonb_build_object('envio',jsonb_build_object('nombre',cliente.name,'telefono',cliente.telefono,
    'direccion',cliente.direccion,'zona',cliente.zona,'recibe',cliente.recepciona));
  if p_accion='activar' then
    nueva:=encode(extensions.gen_random_bytes(32),'hex');
    update tienda_privada.accesos_envio_v1 set enlace_hash=null,enlace_vence=null,
      sesion_hash=extensions.digest(nueva,'sha256'),sesion_vence=now()+interval '30 days'
      where empresa_id=p_empresa and usuario_id=ficha and enlace_hash=llave;
    if not found then return null; end if;
    perfil:=perfil||jsonb_build_object('sesion_token',nueva);
  end if;
  return perfil;
end;
$$;

revoke all on function tienda_privada.emitir_enlace_v1(uuid,uuid) from public;
revoke all on function tienda_privada.acceso_envio_v1(uuid,text,text) from public;
grant usage on schema tienda_privada to anon,authenticated;
grant execute on function tienda_privada.emitir_enlace_v1(uuid,uuid),tienda_privada.acceso_envio_v1(uuid,text,text) to anon,authenticated;

-- Las funciones expuestas no elevan privilegios. La comprobación de autoridad
-- sucede incluso si se llama directamente a la función privada desde SQL.
create function public.tienda_emitir_enlace_v1(p_empresa uuid,p_usuario uuid)
returns jsonb language sql security invoker set search_path='' as $$
select tienda_privada.emitir_enlace_v1(p_empresa,p_usuario);
$$;
create function public.tienda_acceso_envio_v1(p_empresa uuid,p_token text,p_accion text)
returns jsonb language sql security invoker set search_path='' as $$
select tienda_privada.acceso_envio_v1(p_empresa,p_token,p_accion);
$$;
revoke all on function public.tienda_emitir_enlace_v1(uuid,uuid),public.tienda_acceso_envio_v1(uuid,text,text) from public;
grant execute on function public.tienda_emitir_enlace_v1(uuid,uuid),public.tienda_acceso_envio_v1(uuid,text,text) to anon,authenticated;
