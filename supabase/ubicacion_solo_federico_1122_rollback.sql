begin;

drop trigger if exists trg_usuarios_ubicacion_compat on public.usuarios;

-- Devolver al esquema anterior el último estado conocido de cada celular.
update public.usuarios u
   set last_lat = p.last_lat,
       last_lng = p.last_lng,
       last_loc_at = p.last_loc_at,
       loc_modo = p.loc_modo,
       loc_token = p.loc_token
  from private.usuario_ubicaciones p
 where p.usuario_id = u.id;

create or replace function public.loc_get_token(p_empresa_id uuid, p_uid text)
returns text
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare v_tok text;
begin
  if app_empresa_id() is distinct from p_empresa_id then return null; end if;
  select loc_token into v_tok from usuarios
   where empresa_id = p_empresa_id and uid = p_uid;
  if v_tok is null then
    v_tok := encode(gen_random_bytes(24), 'hex');
    update usuarios set loc_token = v_tok
     where empresa_id = p_empresa_id and uid = p_uid;
  end if;
  return v_tok;
end;
$$;

create or replace function public.loc_leer_modo(p_empresa_id text, p_uid text, p_sb_id text, p_token text)
returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare v_modo text;
begin
  if coalesce(trim(p_token), '') = '' then return null; end if;
  select u.loc_modo into v_modo
    from public.usuarios u
   where u.empresa_id::text = p_empresa_id
     and ((coalesce(p_sb_id, '') <> '' and u.id::text = p_sb_id)
       or (coalesce(p_uid, '') <> '' and lower(u.uid) = lower(p_uid)))
     and u.loc_token = p_token
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
set search_path = 'public', 'extensions'
as $$
begin
  update usuarios
     set last_lat = p_lat, last_lng = p_lng, last_loc_at = now()
   where empresa_id = p_empresa_id and uid = p_uid and loc_token = p_token;
  return found;
end;
$$;

create or replace function public.verificar_login(p_emp_codigo text, p_uid text, p_pass text)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare v_user record; v_token text;
begin
  select u.id, u.uid, u.name, u.role, u.roles, u.lista, u.catalogo,
         u.direccion, u.telefono, u.zona, u.recepciona, u.nota,
         u.empresa_id, u.loc_modo, u.foto, u.comision, u.meta
    into v_user
    from public.usuarios u
    join public.empresas e on e.id = u.empresa_id
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

drop function if exists public.ubicacion_vendedores_leer();
drop function if exists public.ubicacion_mi_estado();
drop function if exists public.ubicacion_actualizar_propia(double precision, double precision);
drop function if exists public.ubicacion_mi_modo_guardar(text);
drop function if exists public.ubicacion_vendedor_modo_guardar(uuid, text);
drop function if exists public.ubicacion_horario_guardar(text, text);
drop function if exists private.usuarios_ubicacion_compat();
drop function if exists private.es_dueno_ubicacion();
drop function if exists private.app_token_usuario_id();
drop function if exists private.app_token_uid();
drop table if exists private.usuario_ubicaciones;

grant execute on function public.app_firmar_token(uuid, text, integer) to public;
grant execute on function public.loc_get_token(uuid, text) to public;
grant execute on function public.loc_leer_modo(text, text, text, text) to public;
grant execute on function public.actualizar_ubicacion_nativa(uuid, text, text, double precision, double precision) to public;

commit;

