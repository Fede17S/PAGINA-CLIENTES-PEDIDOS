-- Los enlaces de un uso no vencen por fecha. La sesión de 30 días, la
-- comprobación del administrador y la invalidación al regenerar no cambian.
-- PostgreSQL trata infinity como posterior a cualquier fecha finita, por lo
-- que el canje existente funciona sin cambios; no se reactiva lo ya vencido.
create or replace function tienda_privada.emitir_enlace_v1(p_empresa uuid,p_usuario uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  emisor text; clave text; codigo_tienda text; valido integer;
  cliente public.usuarios%rowtype;
begin
  -- Validar primero la empresa y el token firmado de la sesión del panel.
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
  values(p_empresa,p_usuario,extensions.digest(clave,'sha256'),'infinity'::timestamptz)
  on conflict (empresa_id,usuario_id) do update set enlace_hash=excluded.enlace_hash,enlace_vence=excluded.enlace_vence,sesion_hash=null,sesion_vence=null;
  return jsonb_build_object('codigo',codigo_tienda,'token',clave,'telefono',coalesce(cliente.telefono,''));
end;
$$;

update tienda_privada.accesos_envio_v1
set enlace_vence='infinity'::timestamptz
where enlace_hash is not null and enlace_vence>now() and isfinite(enlace_vence);
