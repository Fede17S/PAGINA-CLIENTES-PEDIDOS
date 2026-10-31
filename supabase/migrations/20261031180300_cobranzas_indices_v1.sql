-- Índices de respaldo para todas las claves foráneas del módulo de cobranzas.
-- Se separan porque la migración principal ya fue instalada en producción.
create index if not exists cobranza_intereses_cliente_idx
  on public.cobranza_intereses_v1 (cliente_id);

create index if not exists cobranza_intereses_cc_operacion_idx
  on public.cobranza_intereses_v1 (cc_operacion_id);
