begin;

-- La ubicación es un dato sensible. Se guarda fuera del esquema expuesto por
-- PostgREST y solo se entrega mediante RPCs que validan el token firmado de la
-- sesión. El dueño autorizado es el perfil inmutable indicado abajo.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.usuario_ubicaciones (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade deferrable initially deferred,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  uid text not null,
  last_lat double precision,
  last_lng double precision,
  last_loc_at timestamptz,
  loc_modo text not null default 'momentos',
  loc_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now()
);

-- El trigger de compatibilidad es BEFORE INSERT: la fila privada se crea en la
-- misma transacción unos instantes antes que public.usuarios. Diferir sólo esta
-- FK permite validar al COMMIT, cuando el usuario padre ya existe, sin relajar
-- la integridad ni cambiar el resto del flujo.
alter table private.usuario_ubicaciones
  alter constraint usuario_ubicaciones_usuario_id_fkey
  deferrable initially deferred;

revoke all on table private.usuario_ubicaciones from public, anon, authenticated;

-- app_empresa_id() ya valida firma y vencimiento. Recién después de esa
-- validación se decodifica el uid del mismo token.
create or replace function private.app_token_uid()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_parts text[];
  v_payload jsonb;
  v_empresa uuid;
begin
  v_empresa := public.app_empresa_id();
  if v_empresa is null then return null; end if;

  begin
    v_token := current_setting('request.headers', true)::jsonb ->> 'x-empresa-token';
  exception when others then
    return null;
  end;
  if coalesce(v_token, '') = '' then return null; end if;

  v_parts := string_to_array(v_token, '.');
  if array_length(v_parts, 1) <> 3 then return null; end if;

  begin
    v_payload := convert_from(public.app_b64url_decode(v_parts[2]), 'utf8')::jsonb;
  exception when others then
    return null;
  end;

  if nullif(v_payload ->> 'empresa_id', '')::uuid is distinct from v_empresa then
    return null;
  end if;
  return nullif(v_payload ->> 'uid', '');
exception when others then
  return null;
end;
$$;

create or replace function private.app_token_usuario_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
    from public.usuarios u
   where u.empresa_id = public.app_empresa_id()
     and lower(u.uid) = lower(private.app_token_uid())
   limit 1
$$;

create or replace function private.es_dueno_ubicacion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_empresa_id() = '6eabe598-6bdc-4319-96bd-f5eb6bdc6eab'::uuid
     and private.app_token_usuario_id() = 'a1a7f3f4-7b46-4fe9-984b-e57184b9a1a7'::uuid
     and lower(coalesce(private.app_token_uid(), '')) = 'federico'
     and exists (
       select 1
         from public.empresas e
        where e.id = '6eabe598-6bdc-4319-96bd-f5eb6bdc6eab'::uuid
          and lower(e.codigo) = '1122'
     )
$$;

revoke all on function private.app_token_uid() from public, anon, authenticated;
revoke all on function private.app_token_usuario_id() from public, anon, authenticated;
revoke all on function private.es_dueno_ubicacion() from public, anon, authenticated;

-- Copiar el estado actual antes de dejar vacías las columnas antiguas.
insert into private.usuario_ubicaciones
  (usuario_id, empresa_id, uid, last_lat, last_lng, last_loc_at, loc_modo, loc_token, updated_at)
select u.id, u.empresa_id, u.uid, u.last_lat, u.last_lng, u.last_loc_at,
       coalesce(nullif(u.loc_modo, ''), 'momentos'),
       coalesce(nullif(u.loc_token, ''), encode(extensions.gen_random_bytes(24), 'hex')),
       now()
  from public.usuarios u
on conflict (usuario_id) do update
  set empresa_id = excluded.empresa_id,
      uid = excluded.uid,
      last_lat = coalesce(excluded.last_lat, private.usuario_ubicaciones.last_lat),
      last_lng = coalesce(excluded.last_lng, private.usuario_ubicaciones.last_lng),
      last_loc_at = coalesce(excluded.last_loc_at, private.usuario_ubicaciones.last_loc_at),
      loc_modo = coalesce(nullif(excluded.loc_modo, ''), private.usuario_ubicaciones.loc_modo),
      loc_token = coalesce(nullif(excluded.loc_token, ''), private.usuario_ubicaciones.loc_token),
      updated_at = now();

update public.usuarios
   set last_lat = null,
       last_lng = null,
       last_loc_at = null,
       loc_modo = null,
       loc_token = null
 where last_lat is not null
    or last_lng is not null
    or last_loc_at is not null
    or loc_modo is not null
    or loc_token is not null;

-- Compatibilidad con versiones viejas: si intentan escribir las columnas
-- anteriores, se deriva el dato al almacén privado y la tabla pública queda
-- siempre sin coordenadas. Un perfil solo puede escribir su propia ubicación;
-- Federico también puede controlar los modos de su equipo.
create or replace function private.usuarios_ubicacion_compat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_caller uuid;
  v_dueno boolean;
  v_coords_cambiaron boolean := false;
  v_modo_cambio boolean := false;
  v_identidad_cambio boolean := false;
begin
  v_empresa := public.app_empresa_id();
  v_caller := private.app_token_usuario_id();
  v_dueno := private.es_dueno_ubicacion();

  if tg_op = 'INSERT' then
    if v_empresa is distinct from new.empresa_id then
      raise exception 'Sesión inválida para crear el usuario' using errcode = '42501';
    end if;
    insert into private.usuario_ubicaciones
      (usuario_id, empresa_id, uid, last_lat, last_lng, last_loc_at, loc_modo, loc_token, updated_at)
    values
      (new.id, new.empresa_id, new.uid, new.last_lat, new.last_lng, new.last_loc_at,
       coalesce(nullif(new.loc_modo, ''), 'momentos'),
       coalesce(nullif(new.loc_token, ''), encode(extensions.gen_random_bytes(24), 'hex')), now())
    on conflict (usuario_id) do nothing;
  else
    v_coords_cambiaron := new.last_lat is distinct from old.last_lat
                       or new.last_lng is distinct from old.last_lng
                       or new.last_loc_at is distinct from old.last_loc_at;
    v_modo_cambio := new.loc_modo is distinct from old.loc_modo;
    v_identidad_cambio := new.uid is distinct from old.uid
                       or new.empresa_id is distinct from old.empresa_id;

    if v_coords_cambiaron or v_modo_cambio or new.loc_token is distinct from old.loc_token then
      if v_empresa is distinct from new.empresa_id or (v_caller is distinct from new.id and not v_dueno) then
        raise exception 'No tenés permiso para modificar esta ubicación' using errcode = '42501';
      end if;
    elsif v_identidad_cambio and (v_empresa is distinct from old.empresa_id or new.empresa_id is distinct from old.empresa_id) then
      raise exception 'No tenés permiso para mover el usuario de empresa' using errcode = '42501';
    end if;

    if v_coords_cambiaron or v_modo_cambio or v_identidad_cambio
       or new.loc_token is distinct from old.loc_token then
      insert into private.usuario_ubicaciones
        (usuario_id, empresa_id, uid, last_lat, last_lng, last_loc_at, loc_modo, loc_token, updated_at)
      values
        (new.id, new.empresa_id, new.uid,
         case when v_coords_cambiaron then new.last_lat else null end,
         case when v_coords_cambiaron then new.last_lng else null end,
         case when v_coords_cambiaron then coalesce(new.last_loc_at, now()) else null end,
         case when v_modo_cambio then coalesce(nullif(new.loc_modo, ''), 'momentos') else 'momentos' end,
         coalesce(nullif(new.loc_token, ''), encode(extensions.gen_random_bytes(24), 'hex')), now())
      on conflict (usuario_id) do update
        set empresa_id = excluded.empresa_id,
            uid = excluded.uid,
            last_lat = case when v_coords_cambiaron then excluded.last_lat else private.usuario_ubicaciones.last_lat end,
            last_lng = case when v_coords_cambiaron then excluded.last_lng else private.usuario_ubicaciones.last_lng end,
            last_loc_at = case when v_coords_cambiaron then excluded.last_loc_at else private.usuario_ubicaciones.last_loc_at end,
            loc_modo = case when v_modo_cambio then excluded.loc_modo else private.usuario_ubicaciones.loc_modo end,
            loc_token = case when new.loc_token is distinct from old.loc_token then excluded.loc_token else private.usuario_ubicaciones.loc_token end,
            updated_at = now();
    end if;
  end if;

  new.last_lat := null;
  new.last_lng := null;
  new.last_loc_at := null;
  new.loc_modo := null;
  new.loc_token := null;
  return new;
end;
$$;

drop trigger if exists trg_usuarios_ubicacion_compat on public.usuarios;
create trigger trg_usuarios_ubicacion_compat
before insert or update of uid, empresa_id, last_lat, last_lng, last_loc_at, loc_modo, loc_token
on public.usuarios
for each row execute function private.usuarios_ubicacion_compat();

create or replace function public.ubicacion_vendedores_leer()
returns table (
  id uuid, uid text, name text, role text,
  last_lat double precision, last_lng double precision,
  last_loc_at timestamptz, loc_modo text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.es_dueno_ubicacion() then
    raise exception 'La ubicación está disponible únicamente para Federico' using errcode = '42501';
  end if;
  return query
    select u.id, u.uid, u.name, u.role,
           p.last_lat, p.last_lng, p.last_loc_at,
           coalesce(p.loc_modo, 'momentos')
      from public.usuarios u
      left join private.usuario_ubicaciones p on p.usuario_id = u.id
     where u.empresa_id = '6eabe598-6bdc-4319-96bd-f5eb6bdc6eab'::uuid
       and u.role in ('vendedor', 'repartidor', 'admin')
     order by u.name asc;
end;
$$;

create or replace function public.ubicacion_mi_estado()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.app_token_usuario_id();
  v_empresa uuid := public.app_empresa_id();
  v_result jsonb;
begin
  if v_id is null or v_empresa is null then
    raise exception 'Sesión inválida' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'loc_modo', coalesce(p.loc_modo, 'momentos'),
           'last_loc_at', p.last_loc_at
         )
    into v_result
    from public.usuarios u
    left join private.usuario_ubicaciones p on p.usuario_id = u.id
   where u.id = v_id and u.empresa_id = v_empresa;
  return coalesce(v_result, jsonb_build_object('loc_modo', 'momentos', 'last_loc_at', null));
end;
$$;

create or replace function public.ubicacion_actualizar_propia(p_lat double precision, p_lng double precision)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.app_token_usuario_id();
  v_empresa uuid := public.app_empresa_id();
  v_uid text := private.app_token_uid();
begin
  if v_id is null or v_empresa is null then
    raise exception 'Sesión inválida' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception 'Coordenadas inválidas' using errcode = '22023';
  end if;
  insert into private.usuario_ubicaciones
    (usuario_id, empresa_id, uid, last_lat, last_lng, last_loc_at, updated_at)
  values (v_id, v_empresa, v_uid, p_lat, p_lng, now(), now())
  on conflict (usuario_id) do update
    set last_lat = excluded.last_lat,
        last_lng = excluded.last_lng,
        last_loc_at = excluded.last_loc_at,
        uid = excluded.uid,
        empresa_id = excluded.empresa_id,
        updated_at = now();
  return true;
end;
$$;

create or replace function public.ubicacion_mi_modo_guardar(p_modo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := private.app_token_usuario_id();
  v_empresa uuid := public.app_empresa_id();
  v_uid text := private.app_token_uid();
begin
  if v_id is null or v_empresa is null then
    raise exception 'Sesión inválida' using errcode = '42501';
  end if;
  if p_modo not in ('off', 'momentos', 'vivo') then
    raise exception 'Modo inválido' using errcode = '22023';
  end if;
  insert into private.usuario_ubicaciones (usuario_id, empresa_id, uid, loc_modo, updated_at)
  values (v_id, v_empresa, v_uid, p_modo, now())
  on conflict (usuario_id) do update
    set loc_modo = excluded.loc_modo, uid = excluded.uid,
        empresa_id = excluded.empresa_id, updated_at = now();
  return true;
end;
$$;

create or replace function public.ubicacion_vendedor_modo_guardar(p_usuario_id uuid, p_modo text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios%rowtype;
begin
  if not private.es_dueno_ubicacion() then
    raise exception 'La ubicación está disponible únicamente para Federico' using errcode = '42501';
  end if;
  if p_modo not in ('off', 'momentos', 'vivo')
     and p_modo !~ '^sesion\\|[0-9]{10,16}\\|(off|momentos|vivo)$' then
    raise exception 'Modo inválido' using errcode = '22023';
  end if;
  select * into v_usuario
    from public.usuarios
   where id = p_usuario_id
     and empresa_id = '6eabe598-6bdc-4319-96bd-f5eb6bdc6eab'::uuid;
  if not found then raise exception 'Usuario no encontrado' using errcode = 'P0002'; end if;

  insert into private.usuario_ubicaciones (usuario_id, empresa_id, uid, loc_modo, updated_at)
  values (v_usuario.id, v_usuario.empresa_id, v_usuario.uid, p_modo, now())
  on conflict (usuario_id) do update
    set loc_modo = excluded.loc_modo, uid = excluded.uid,
        empresa_id = excluded.empresa_id, updated_at = now();
  return true;
end;
$$;

create or replace function public.ubicacion_horario_guardar(p_inicio text, p_fin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.es_dueno_ubicacion() then
    raise exception 'La ubicación está disponible únicamente para Federico' using errcode = '42501';
  end if;
  if (p_inicio is not null and p_inicio !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
     or (p_fin is not null and p_fin !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') then
    raise exception 'Horario inválido' using errcode = '22023';
  end if;
  update public.empresas
     set loc_hora_ini = p_inicio, loc_hora_fin = p_fin
   where id = '6eabe598-6bdc-4319-96bd-f5eb6bdc6eab'::uuid
     and lower(codigo) = '1122';
  return found;
end;
$$;

-- Funciones utilizadas por el servicio Android existente. Conservan las
-- firmas para que la actualización no rompa aplicaciones ya instaladas.
create or replace function public.loc_get_token(p_empresa_id uuid, p_uid text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios%rowtype;
  v_token text;
  v_caller uuid := private.app_token_usuario_id();
begin
  if public.app_empresa_id() is distinct from p_empresa_id then return null; end if;
  select * into v_usuario from public.usuarios
   where empresa_id = p_empresa_id and lower(uid) = lower(p_uid) limit 1;
  if not found then return null; end if;
  if v_caller is distinct from v_usuario.id and not private.es_dueno_ubicacion() then return null; end if;

  insert into private.usuario_ubicaciones (usuario_id, empresa_id, uid, updated_at)
  values (v_usuario.id, v_usuario.empresa_id, v_usuario.uid, now())
  on conflict (usuario_id) do update set uid = excluded.uid, empresa_id = excluded.empresa_id
  returning loc_token into v_token;
  return v_token;
end;
$$;

create or replace function public.loc_leer_modo(p_empresa_id text, p_uid text, p_sb_id text, p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_modo text;
begin
  if coalesce(trim(p_token), '') = '' then return null; end if;
  select p.loc_modo into v_modo
    from private.usuario_ubicaciones p
   where p.empresa_id::text = p_empresa_id
     and ((coalesce(p_sb_id, '') <> '' and p.usuario_id::text = p_sb_id)
       or (coalesce(p_uid, '') <> '' and lower(p.uid) = lower(p_uid)))
     and p.loc_token = p_token
   limit 1;
  if not found then return null; end if;
  return coalesce(v_modo, 'momentos');
end;
$$;

create or replace function public.actualizar_ubicacion_nativa(
  p_empresa_id uuid, p_uid text, p_token text,
  p_lat double precision, p_lng double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lat is null or p_lng is null or p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    return false;
  end if;
  update private.usuario_ubicaciones
     set last_lat = p_lat, last_lng = p_lng, last_loc_at = now(), updated_at = now()
   where empresa_id = p_empresa_id
     and lower(uid) = lower(p_uid)
     and loc_token = p_token;
  return found;
end;
$$;

-- El RPC de login obtiene el modo desde el almacén privado; las coordenadas
-- nunca forman parte de la respuesta.
create or replace function public.verificar_login(p_emp_codigo text, p_uid text, p_pass text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user record;
  v_token text;
begin
  select u.id, u.uid, u.name, u.role, u.roles, u.lista, u.catalogo,
         u.direccion, u.telefono, u.zona, u.recepciona, u.nota,
         u.empresa_id, coalesce(p.loc_modo, 'momentos') as loc_modo,
         u.foto, u.comision, u.meta
    into v_user
    from public.usuarios u
    join public.empresas e on e.id = u.empresa_id
    left join private.usuario_ubicaciones p on p.usuario_id = u.id
   where pg_catalog.lower(e.codigo) = pg_catalog.lower(p_emp_codigo)
     and pg_catalog.lower(u.uid) = pg_catalog.lower(p_uid)
     and u.pass_hash is not null
     and u.pass_hash = extensions.crypt(p_pass, u.pass_hash)
   limit 1;

  if v_user.id is null then return null; end if;
  v_token := public.app_firmar_token(v_user.empresa_id, v_user.uid, 30);
  return pg_catalog.json_build_object(
    'id', v_user.id, 'uid', v_user.uid, 'name', v_user.name,
    'role', v_user.role, 'roles', v_user.roles, 'lista', v_user.lista,
    'catalogo', v_user.catalogo, 'direccion', v_user.direccion,
    'telefono', v_user.telefono, 'zona', v_user.zona,
    'recepciona', v_user.recepciona, 'nota', v_user.nota,
    'empresa_id', v_user.empresa_id, 'loc_modo', v_user.loc_modo,
    'foto', v_user.foto, 'comision', v_user.comision, 'meta', v_user.meta,
    'token', v_token
  );
end;
$$;

-- Nadie debe poder fabricar tokens de empresa desde la API. El RPC de login
-- (security definer) conserva acceso interno como propietario de la función.
revoke execute on function public.app_firmar_token(uuid, text, integer) from public, anon, authenticated;

revoke all on function public.ubicacion_vendedores_leer() from public;
revoke all on function public.ubicacion_mi_estado() from public;
revoke all on function public.ubicacion_actualizar_propia(double precision, double precision) from public;
revoke all on function public.ubicacion_mi_modo_guardar(text) from public;
revoke all on function public.ubicacion_vendedor_modo_guardar(uuid, text) from public;
revoke all on function public.ubicacion_horario_guardar(text, text) from public;
revoke all on function public.loc_get_token(uuid, text) from public;
revoke all on function public.loc_leer_modo(text, text, text, text) from public;
revoke all on function public.actualizar_ubicacion_nativa(uuid, text, text, double precision, double precision) from public;

grant execute on function public.ubicacion_vendedores_leer() to anon, authenticated;
grant execute on function public.ubicacion_mi_estado() to anon, authenticated;
grant execute on function public.ubicacion_actualizar_propia(double precision, double precision) to anon, authenticated;
grant execute on function public.ubicacion_mi_modo_guardar(text) to anon, authenticated;
grant execute on function public.ubicacion_vendedor_modo_guardar(uuid, text) to anon, authenticated;
grant execute on function public.ubicacion_horario_guardar(text, text) to anon, authenticated;
grant execute on function public.loc_get_token(uuid, text) to anon, authenticated;
grant execute on function public.loc_leer_modo(text, text, text, text) to anon, authenticated;
grant execute on function public.actualizar_ubicacion_nativa(uuid, text, text, double precision, double precision) to anon, authenticated;

commit;
