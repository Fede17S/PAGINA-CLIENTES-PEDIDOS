begin;

-- private.usuarios_ubicacion_compat() corre BEFORE INSERT sobre public.usuarios
-- y crea en ese instante la fila privada de ubicación. La FK inmediata hacía
-- que cualquier alta (Nuevo pedido o Gestión de clientes) fallara antes de que
-- la fila padre pudiera insertarse. La relación sigue siendo obligatoria y se
-- valida al finalizar la misma transacción, cuando el usuario ya existe.
alter table private.usuario_ubicaciones
  alter constraint usuario_ubicaciones_usuario_id_fkey
  deferrable initially deferred;

commit;
