-- DISTRIBIX - Avisos de cobro e intereses por mora v1
--
-- Principios de seguridad:
--   * Todo queda desactivado por defecto.
--   * Los intereses son simples: no se calculan intereses sobre intereses.
--   * La fecha de activacion evita cargos retroactivos involuntarios.
--   * El proceso diario es idempotente por empresa, documento y fecha.
--   * No toca productos, stock, pedidos ni el estado de entrega.

begin;

create table if not exists public.cobranza_config_v1 (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  avisos_activos boolean not null default false,
  plazo_pago_dias integer not null default 0 check (plazo_pago_dias between 0 and 365),
  dias_avisos integer[] not null default array[0,3,7,15,30],
  interes_activo boolean not null default false,
  dias_gracia_interes integer not null default 0 check (dias_gracia_interes between 0 and 365),
  tasa_mensual_pct numeric(9,4) not null default 0 check (tasa_mensual_pct between 0 and 100),
  tope_interes_pct numeric(9,4) not null default 100 check (tope_interes_pct between 0 and 500),
  aplicar_desde date not null default current_date,
  alias_pago text not null default '',
  cbu_pago text not null default '',
  banco_pago text not null default '',
  titular_pago text not null default '',
  cuit_pago text not null default '',
  mensaje_plantilla text not null default
    'Hola {cliente}. Te recordamos que se encuentra pendiente el pago de {monto_total}, correspondiente a la entrega del {fecha_entrega}. {datos_pago}',
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create table if not exists public.cobranza_intereses_v1 (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.usuarios(id) on delete restrict,
  ruta_cliente_id uuid not null references public.ruta_clientes(id) on delete restrict,
  fecha date not null,
  capital_snapshot numeric(16,2) not null check (capital_snapshot > 0),
  tasa_mensual_pct numeric(9,4) not null check (tasa_mensual_pct >= 0),
  monto numeric(16,2) not null check (monto > 0),
  cc_operacion_id uuid references public.cc_operaciones_v2(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (empresa_id, ruta_cliente_id, fecha)
);

create table if not exists public.cobranza_avisos_v1 (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  cliente_id uuid not null references public.usuarios(id) on delete restrict,
  ruta_cliente_id uuid not null references public.ruta_clientes(id) on delete restrict,
  etapa_dias integer not null check (etapa_dias between 0 and 3650),
  programado_para date not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','abierto','enviado','omitido','cancelado','error')),
  capital_snapshot numeric(16,2) not null default 0 check (capital_snapshot >= 0),
  interes_snapshot numeric(16,2) not null default 0 check (interes_snapshot >= 0),
  total_snapshot numeric(16,2) not null default 0 check (total_snapshot >= 0),
  detalle jsonb not null default '{}'::jsonb,
  abierto_en timestamptz,
  enviado_en timestamptz,
  procesado_por text not null default '',
  error text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, ruta_cliente_id, etapa_dias)
);

create index if not exists cobranza_intereses_empresa_cliente_fecha_idx
  on public.cobranza_intereses_v1 (empresa_id, cliente_id, fecha desc);
create index if not exists cobranza_intereses_cliente_idx
  on public.cobranza_intereses_v1 (cliente_id);
create index if not exists cobranza_intereses_ruta_idx
  on public.cobranza_intereses_v1 (ruta_cliente_id);
create index if not exists cobranza_intereses_cc_operacion_idx
  on public.cobranza_intereses_v1 (cc_operacion_id);
create index if not exists cobranza_avisos_empresa_estado_fecha_idx
  on public.cobranza_avisos_v1 (empresa_id, estado, programado_para);
create index if not exists cobranza_avisos_cliente_idx
  on public.cobranza_avisos_v1 (cliente_id);
create index if not exists cobranza_avisos_ruta_idx
  on public.cobranza_avisos_v1 (ruta_cliente_id);

alter table public.cobranza_config_v1 enable row level security;
alter table public.cobranza_intereses_v1 enable row level security;
alter table public.cobranza_avisos_v1 enable row level security;

drop policy if exists cobranza_config_v1_empresa_select on public.cobranza_config_v1;
create policy cobranza_config_v1_empresa_select on public.cobranza_config_v1
  for select to anon, authenticated
  using (empresa_id = public.app_empresa_id()
    and public.cc_actor_permitido(empresa_id,array['admin','co-admin']));

drop policy if exists cobranza_intereses_v1_empresa_select on public.cobranza_intereses_v1;
create policy cobranza_intereses_v1_empresa_select on public.cobranza_intereses_v1
  for select to anon, authenticated
  using (empresa_id = public.app_empresa_id()
    and public.cc_actor_permitido(empresa_id,array['admin','co-admin','vendedor']));

drop policy if exists cobranza_avisos_v1_empresa_select on public.cobranza_avisos_v1;
create policy cobranza_avisos_v1_empresa_select on public.cobranza_avisos_v1
  for select to anon, authenticated
  using (empresa_id = public.app_empresa_id()
    and public.cc_actor_permitido(empresa_id,array['admin','co-admin','vendedor']));

revoke all on public.cobranza_config_v1 from public, anon, authenticated;
revoke all on public.cobranza_intereses_v1 from public, anon, authenticated;
revoke all on public.cobranza_avisos_v1 from public, anon, authenticated;
grant select on public.cobranza_config_v1 to anon, authenticated;
grant select on public.cobranza_intereses_v1 to anon, authenticated;
grant select on public.cobranza_avisos_v1 to anon, authenticated;

create or replace function public.cobranza_obtener_config_v1(p_empresa_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'public'
as $function$
declare v_cfg public.cobranza_config_v1%rowtype;
begin
  if not public.cc_actor_permitido(p_empresa_id,array['admin','co-admin']) then
    raise exception 'Solo un administrador puede ver esta configuracion';
  end if;
  select * into v_cfg from public.cobranza_config_v1 where empresa_id=p_empresa_id;
  if found then return to_jsonb(v_cfg); end if;
  return jsonb_build_object(
    'empresa_id',p_empresa_id,
    'avisos_activos',false,
    'plazo_pago_dias',0,
    'dias_avisos',jsonb_build_array(0,3,7,15,30),
    'interes_activo',false,
    'dias_gracia_interes',0,
    'tasa_mensual_pct',0,
    'tope_interes_pct',100,
    'aplicar_desde',current_date,
    'alias_pago','',
    'cbu_pago','',
    'banco_pago','',
    'titular_pago','',
    'cuit_pago','',
    'mensaje_plantilla','Hola {cliente}. Te recordamos que se encuentra pendiente el pago de {monto_total}, correspondiente a la entrega del {fecha_entrega}. {datos_pago}'
  );
end;
$function$;

create or replace function public.cobranza_guardar_config_v1(
  p_empresa_id uuid,
  p_avisos_activos boolean,
  p_plazo_pago_dias integer,
  p_dias_avisos integer[],
  p_interes_activo boolean,
  p_dias_gracia_interes integer,
  p_tasa_mensual_pct numeric,
  p_tope_interes_pct numeric,
  p_aplicar_desde date,
  p_alias_pago text,
  p_cbu_pago text,
  p_banco_pago text,
  p_titular_pago text,
  p_cuit_pago text,
  p_mensaje_plantilla text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_dias integer[];
  v_row public.cobranza_config_v1%rowtype;
begin
  if not public.cc_actor_permitido(p_empresa_id,array['admin','co-admin']) then
    raise exception 'Solo un administrador puede configurar cobranzas';
  end if;
  if coalesce(p_plazo_pago_dias,-1) not between 0 and 365 then
    raise exception 'El plazo de pago debe estar entre 0 y 365 dias';
  end if;
  if coalesce(p_dias_gracia_interes,-1) not between 0 and 365 then
    raise exception 'Los dias de gracia deben estar entre 0 y 365';
  end if;
  if coalesce(p_tasa_mensual_pct,-1) not between 0 and 100 then
    raise exception 'La tasa mensual debe estar entre 0 y 100';
  end if;
  if coalesce(p_tope_interes_pct,-1) not between 0 and 500 then
    raise exception 'El tope de interes debe estar entre 0 y 500';
  end if;
  select coalesce(array_agg(x order by x),array[0]) into v_dias
  from (select distinct x from unnest(coalesce(p_dias_avisos,array[0])) x where x between 0 and 3650) s;
  if cardinality(v_dias)=0 then v_dias:=array[0]; end if;

  insert into public.cobranza_config_v1(
    empresa_id,avisos_activos,plazo_pago_dias,dias_avisos,interes_activo,
    dias_gracia_interes,tasa_mensual_pct,tope_interes_pct,aplicar_desde,
    alias_pago,cbu_pago,banco_pago,titular_pago,cuit_pago,mensaje_plantilla,
    updated_at,updated_by
  ) values (
    p_empresa_id,coalesce(p_avisos_activos,false),p_plazo_pago_dias,v_dias,
    coalesce(p_interes_activo,false),p_dias_gracia_interes,round(p_tasa_mensual_pct,4),
    round(p_tope_interes_pct,4),coalesce(p_aplicar_desde,current_date),
    left(btrim(coalesce(p_alias_pago,'')),120),left(btrim(coalesce(p_cbu_pago,'')),120),
    left(btrim(coalesce(p_banco_pago,'')),120),left(btrim(coalesce(p_titular_pago,'')),160),
    left(btrim(coalesce(p_cuit_pago,'')),40),left(coalesce(nullif(btrim(p_mensaje_plantilla),''),
      'Hola {cliente}. Te recordamos que se encuentra pendiente el pago de {monto_total}, correspondiente a la entrega del {fecha_entrega}. {datos_pago}'),1200),
    now(),coalesce(public.cc_uid_actual(),'')
  )
  on conflict(empresa_id) do update set
    avisos_activos=excluded.avisos_activos,
    plazo_pago_dias=excluded.plazo_pago_dias,
    dias_avisos=excluded.dias_avisos,
    interes_activo=excluded.interes_activo,
    dias_gracia_interes=excluded.dias_gracia_interes,
    tasa_mensual_pct=excluded.tasa_mensual_pct,
    tope_interes_pct=excluded.tope_interes_pct,
    aplicar_desde=excluded.aplicar_desde,
    alias_pago=excluded.alias_pago,
    cbu_pago=excluded.cbu_pago,
    banco_pago=excluded.banco_pago,
    titular_pago=excluded.titular_pago,
    cuit_pago=excluded.cuit_pago,
    mensaje_plantilla=excluded.mensaje_plantilla,
    updated_at=excluded.updated_at,
    updated_by=excluded.updated_by
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

-- Devuelve el saldo de capital actual de una entrega. Los pagos negativos de una
-- anulacion vuelven a aumentar el saldo, como ya hace Cuentas corrientes v2.
create or replace function public.cobranza_capital_pendiente_v1(p_rc public.ruta_clientes)
returns numeric
language sql
stable
security invoker
set search_path = 'public'
as $function$
  select greatest(round(
    coalesce(p_rc.importe,0)-coalesce(p_rc.efectivo,0)-coalesce(p_rc.transferencia,0)-
    coalesce((select sum(coalesce((x->>'monto')::numeric,0))
              from jsonb_array_elements(case when jsonb_typeof(p_rc.pagos_adicionales)='array'
                then p_rc.pagos_adicionales else '[]'::jsonb end) x),0)
  ,2),0);
$function$;

create or replace function public.cobranza_aplicar_intereses_v1(
  p_fecha date default current_date,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v record;
  v_inicio date;
  v_acumulado numeric(16,2);
  v_tope numeric(16,2);
  v_monto numeric(16,2);
  v_interes_id uuid;
  v_op_id text;
  v_cc_id uuid;
  v_cantidad integer:=0;
  v_total numeric(16,2):=0;
begin
  for v in
    select cfg.*,rc.id ruta_cliente_id,rc.remito_num,rc.importe,
      coalesce(rc.entregado_en,rc.fecha,rc.created_at) entrega_fecha,
      public.cobranza_capital_pendiente_v1(rc) capital_pendiente,
      u.id cliente_uuid,coalesce(u.name,u.uid) cliente_nom
    from public.cobranza_config_v1 cfg
    join public.ruta_clientes rc on rc.empresa_id=cfg.empresa_id
    join lateral (
      select ux.id,ux.uid,ux.name
      from public.usuarios ux
      where ux.empresa_id=cfg.empresa_id and lower(coalesce(ux.role,''))='cliente'
        and (
          ux.uid=rc.cliente_id
          or (nullif(rc.cliente_id,'') is null and lower(btrim(ux.name))=lower(btrim(rc.nom))
            and 1=(select count(*) from public.usuarios uy where uy.empresa_id=cfg.empresa_id
              and lower(coalesce(uy.role,''))='cliente' and lower(btrim(uy.name))=lower(btrim(rc.nom))))
        )
      order by case when ux.uid=rc.cliente_id then 0 else 1 end
      limit 1
    ) u on true
    where cfg.interes_activo is true
      and cfg.tasa_mensual_pct>0
      and (p_empresa_id is null or cfg.empresa_id=p_empresa_id)
      and rc.entregado is true
      and coalesce(rc.rechazado,false) is false
      and public.cobranza_capital_pendiente_v1(rc)>0.009
  loop
    v_inicio:=greatest(v.aplicar_desde,
      v.entrega_fecha::date+v.plazo_pago_dias+v.dias_gracia_interes+1);
    if p_fecha<v_inicio then continue; end if;

    select coalesce(sum(i.monto),0) into v_acumulado
    from public.cobranza_intereses_v1 i
    where i.empresa_id=v.empresa_id and i.ruta_cliente_id=v.ruta_cliente_id;
    v_tope:=round(coalesce(v.importe,0)*v.tope_interes_pct/100,2);
    if v_tope<=v_acumulado then continue; end if;
    v_monto:=least(round(v.capital_pendiente*v.tasa_mensual_pct/100/30,2),v_tope-v_acumulado);
    if v_monto<=0 then continue; end if;

    insert into public.cobranza_intereses_v1(
      empresa_id,cliente_id,ruta_cliente_id,fecha,capital_snapshot,tasa_mensual_pct,monto
    ) values (
      v.empresa_id,v.cliente_uuid,v.ruta_cliente_id,p_fecha,v.capital_pendiente,v.tasa_mensual_pct,v_monto
    ) on conflict(empresa_id,ruta_cliente_id,fecha) do nothing
    returning id into v_interes_id;
    if v_interes_id is null then continue; end if;

    v_op_id:='mora:'||p_fecha::text||':'||v.ruta_cliente_id::text;
    insert into public.cc_operaciones_v2(
      empresa_id,op_id,cliente_id,cliente_nom,tipo,monto,aplicado,forma,nota,usuario_uid,fecha
    ) values (
      v.empresa_id,v_op_id,v.cliente_uuid,v.cliente_nom,'ajuste_debito',v_monto,0,
      'interes_mora','Interes simple por mora'||case when nullif(v.remito_num,'') is not null then ' · Remito '||v.remito_num else '' end,
      'sistema-cobranzas',p_fecha::timestamptz+interval '12 hours'
    ) on conflict(empresa_id,op_id) do nothing
    returning id into v_cc_id;
    if v_cc_id is null then
      select id into v_cc_id from public.cc_operaciones_v2
      where empresa_id=v.empresa_id and op_id=v_op_id;
    end if;
    update public.cobranza_intereses_v1 set cc_operacion_id=v_cc_id where id=v_interes_id;
    v_cantidad:=v_cantidad+1;
    v_total:=v_total+v_monto;
  end loop;
  return jsonb_build_object('fecha',p_fecha,'documentos',v_cantidad,'interes_aplicado',round(v_total,2));
end;
$function$;

create or replace function public.cobranza_generar_avisos_v1(
  p_fecha date default current_date,
  p_empresa_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v record;
  v_vencimiento date;
  v_atraso integer;
  v_etapa integer;
  v_interes numeric(16,2);
  v_cantidad integer:=0;
begin
  for v in
    select cfg.*,rc.id ruta_cliente_id,rc.remito_num,rc.importe,
      coalesce(rc.entregado_en,rc.fecha,rc.created_at) entrega_fecha,
      public.cobranza_capital_pendiente_v1(rc) capital_pendiente,
      u.id cliente_uuid,coalesce(u.name,u.uid) cliente_nom
    from public.cobranza_config_v1 cfg
    join public.ruta_clientes rc on rc.empresa_id=cfg.empresa_id
    join lateral (
      select ux.id,ux.uid,ux.name
      from public.usuarios ux
      where ux.empresa_id=cfg.empresa_id and lower(coalesce(ux.role,''))='cliente'
        and (
          ux.uid=rc.cliente_id
          or (nullif(rc.cliente_id,'') is null and lower(btrim(ux.name))=lower(btrim(rc.nom))
            and 1=(select count(*) from public.usuarios uy where uy.empresa_id=cfg.empresa_id
              and lower(coalesce(uy.role,''))='cliente' and lower(btrim(uy.name))=lower(btrim(rc.nom))))
        )
      order by case when ux.uid=rc.cliente_id then 0 else 1 end
      limit 1
    ) u on true
    where cfg.avisos_activos is true
      and (p_empresa_id is null or cfg.empresa_id=p_empresa_id)
      and rc.entregado is true
      and coalesce(rc.rechazado,false) is false
      and public.cobranza_capital_pendiente_v1(rc)>0.009
  loop
    v_vencimiento:=v.entrega_fecha::date+v.plazo_pago_dias;
    v_atraso:=p_fecha-v_vencimiento;
    if v_atraso<0 then continue; end if;
    select max(x) into v_etapa from unnest(v.dias_avisos) x where x<=v_atraso;
    if v_etapa is null then continue; end if;
    select coalesce(sum(i.monto),0) into v_interes
    from public.cobranza_intereses_v1 i
    where i.empresa_id=v.empresa_id and i.ruta_cliente_id=v.ruta_cliente_id;

    insert into public.cobranza_avisos_v1(
      empresa_id,cliente_id,ruta_cliente_id,etapa_dias,programado_para,
      capital_snapshot,interes_snapshot,total_snapshot,detalle
    ) values (
      v.empresa_id,v.cliente_uuid,v.ruta_cliente_id,v_etapa,p_fecha,
      v.capital_pendiente,v_interes,round(v.capital_pendiente+v_interes,2),
      jsonb_build_object('cliente',v.cliente_nom,'remito',coalesce(v.remito_num,''),
        'fecha_entrega',v.entrega_fecha,'fecha_vencimiento',v_vencimiento,'dias_atraso',v_atraso)
    ) on conflict(empresa_id,ruta_cliente_id,etapa_dias) do nothing;
    if found then v_cantidad:=v_cantidad+1; end if;
  end loop;
  return jsonb_build_object('fecha',p_fecha,'avisos_nuevos',v_cantidad);
end;
$function$;

create or replace function public.cobranza_generar_avisos_hoy_v1(p_empresa_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if not public.cc_actor_permitido(p_empresa_id,array['admin','co-admin','vendedor']) then
    raise exception 'No autorizado para gestionar avisos';
  end if;
  return public.cobranza_generar_avisos_v1((now() at time zone 'America/Argentina/Buenos_Aires')::date,p_empresa_id);
end;
$function$;

create or replace function public.cobranza_avisos_pendientes_v1(p_empresa_id uuid)
returns table(
  aviso_id uuid,cliente_id uuid,cliente_uid text,cliente_nom text,telefono text,
  ruta_cliente_id uuid,remito_num text,fecha_entrega timestamptz,fecha_vencimiento date,
  dias_atraso integer,etapa_dias integer,estado text,capital numeric,interes numeric,
  saldo_cliente numeric,alias_pago text,cbu_pago text,banco_pago text,titular_pago text,
  cuit_pago text,mensaje_plantilla text
)
language sql
stable
security definer
set search_path = 'public'
as $function$
  with saldos as (
    select * from public.cc_resumen_v2(p_empresa_id)
  )
  select a.id,u.id,u.uid,coalesce(u.name,u.uid),coalesce(u.telefono,''),rc.id,
    coalesce(rc.remito_num,''),coalesce(rc.entregado_en,rc.fecha,rc.created_at),
    (coalesce(rc.entregado_en,rc.fecha,rc.created_at)::date+cfg.plazo_pago_dias),
    greatest(0,(now() at time zone 'America/Argentina/Buenos_Aires')::date-
      (coalesce(rc.entregado_en,rc.fecha,rc.created_at)::date+cfg.plazo_pago_dias)),
    a.etapa_dias,a.estado,public.cobranza_capital_pendiente_v1(rc),
    coalesce((select sum(i.monto) from public.cobranza_intereses_v1 i
      where i.empresa_id=p_empresa_id and i.ruta_cliente_id=rc.id),0),
    coalesce(s.saldo,public.cobranza_capital_pendiente_v1(rc)),
    cfg.alias_pago,cfg.cbu_pago,cfg.banco_pago,cfg.titular_pago,cfg.cuit_pago,cfg.mensaje_plantilla
  from public.cobranza_avisos_v1 a
  join public.cobranza_config_v1 cfg on cfg.empresa_id=a.empresa_id
  join public.usuarios u on u.id=a.cliente_id and u.empresa_id=a.empresa_id
  join public.ruta_clientes rc on rc.id=a.ruta_cliente_id and rc.empresa_id=a.empresa_id
  left join saldos s on s.cliente_id=u.id
  where a.empresa_id=p_empresa_id
    and public.app_empresa_id()=p_empresa_id
    and public.cc_actor_permitido(p_empresa_id,array['admin','co-admin','vendedor'])
    and a.estado in ('pendiente','abierto')
    and rc.entregado is true
    and coalesce(rc.rechazado,false) is false
    and public.cobranza_capital_pendiente_v1(rc)>0.009
    and coalesce(s.saldo,public.cobranza_capital_pendiente_v1(rc))>0.009
  order by greatest(0,(now() at time zone 'America/Argentina/Buenos_Aires')::date-
      (coalesce(rc.entregado_en,rc.fecha,rc.created_at)::date+cfg.plazo_pago_dias)) desc,
    coalesce(u.name,u.uid),coalesce(rc.entregado_en,rc.fecha,rc.created_at);
$function$;

create or replace function public.cobranza_marcar_avisos_v1(
  p_empresa_id uuid,
  p_ids uuid[],
  p_estado text
)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $function$
declare v_n integer;
begin
  if not public.cc_actor_permitido(p_empresa_id,array['admin','co-admin','vendedor']) then
    raise exception 'No autorizado para gestionar avisos';
  end if;
  if p_estado not in ('abierto','enviado','omitido') then raise exception 'Estado invalido'; end if;
  update public.cobranza_avisos_v1 set
    estado=p_estado,
    abierto_en=case when p_estado='abierto' then coalesce(abierto_en,now()) else abierto_en end,
    enviado_en=case when p_estado='enviado' then coalesce(enviado_en,now()) else enviado_en end,
    procesado_por=coalesce(public.cc_uid_actual(),''),updated_at=now()
  where empresa_id=p_empresa_id and id=any(coalesce(p_ids,'{}'::uuid[]))
    and estado in ('pendiente','abierto');
  get diagnostics v_n=row_count;
  return jsonb_build_object('actualizados',v_n,'estado',p_estado);
end;
$function$;

create or replace function public.cobranza_ejecutar_diario_v1(p_fecha date default current_date)
returns jsonb
language sql
security definer
set search_path = 'public'
as $function$
  select jsonb_build_object(
    'intereses',public.cobranza_aplicar_intereses_v1(p_fecha,null),
    'avisos',public.cobranza_generar_avisos_v1(p_fecha,null)
  );
$function$;

revoke all on function public.cobranza_obtener_config_v1(uuid) from public,anon,authenticated;
revoke all on function public.cobranza_guardar_config_v1(uuid,boolean,integer,integer[],boolean,integer,numeric,numeric,date,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.cobranza_capital_pendiente_v1(public.ruta_clientes) from public,anon,authenticated;
revoke all on function public.cobranza_aplicar_intereses_v1(date,uuid) from public,anon,authenticated;
revoke all on function public.cobranza_generar_avisos_v1(date,uuid) from public,anon,authenticated;
revoke all on function public.cobranza_generar_avisos_hoy_v1(uuid) from public,anon,authenticated;
revoke all on function public.cobranza_avisos_pendientes_v1(uuid) from public,anon,authenticated;
revoke all on function public.cobranza_marcar_avisos_v1(uuid,uuid[],text) from public,anon,authenticated;
revoke all on function public.cobranza_ejecutar_diario_v1(date) from public,anon,authenticated;

grant execute on function public.cobranza_obtener_config_v1(uuid) to anon,authenticated;
grant execute on function public.cobranza_guardar_config_v1(uuid,boolean,integer,integer[],boolean,integer,numeric,numeric,date,text,text,text,text,text,text) to anon,authenticated;
grant execute on function public.cobranza_generar_avisos_hoy_v1(uuid) to anon,authenticated;
grant execute on function public.cobranza_avisos_pendientes_v1(uuid) to anon,authenticated;
grant execute on function public.cobranza_marcar_avisos_v1(uuid,uuid[],text) to anon,authenticated;

comment on table public.cobranza_config_v1 is 'Configuracion de avisos y mora por distribuidora; desactivada por defecto.';
comment on table public.cobranza_intereses_v1 is 'Devengamiento diario idempotente de interes simple por documento.';
comment on table public.cobranza_avisos_v1 is 'Cola auditable de recordatorios de cobro; abrir WhatsApp no equivale a mensaje enviado.';

-- 09:05 de Argentina (UTC-3). El mismo nombre actualiza el job si ya existia.
select cron.schedule(
  'distribix-cobranzas-diario-v1',
  '5 12 * * *',
  $cron$select public.cobranza_ejecutar_diario_v1((now() at time zone 'America/Argentina/Buenos_Aires')::date);$cron$
);

commit;
notify pgrst,'reload schema';
