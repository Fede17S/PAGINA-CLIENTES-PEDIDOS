# Revisión de incidencias de reparto

Versión del panel: `2026.11.20-reparto1`. Módulo: `reparto-revision-v1.js`.

## Flujo

- Reparto registra una devolución, faltante, rotura o rechazo del pedido.
- Las notas nuevas nacen pendientes, incluso para perfiles con rol adicional de vendedor.
- Inicio del admin muestra accesos separados a devoluciones y rechazos pendientes, sin depender del mes elegido en Hoja de Ruta.
- El panel visible del admin consulta las rutas cada 15 segundos y al recuperar conexión/visibilidad. No es una notificación push con el panel cerrado.
- Hoja de Ruta identifica la devolución pendiente, aprobada o revisada en el pedido.
- El admin aprueba o rechaza la nota; para el pedido completo puede aprobar el rechazo o no aprobarlo.

## Persistencia y dinero

`reparto_revision_v1` es una RPC SECURITY INVOKER. Verifica empresa y uid del token firmado, consulta el rol vigente, bloquea la parada con FOR UPDATE y guarda la decisión y su movimiento de stock dentro de la misma transacción. No se modifican las políticas RLS existentes.

Los reintentos conservan el identificador de nota/reporte. Una notificación repetida no resucita una nota resuelta. El servidor recalcula cantidad y monto desde los productos del pedido; no confía en el precio ni estado aportados por el dispositivo.

Un rechazo pendiente no anula facturación, no cuenta como resuelto y no devuelve stock. El rechazo completo aprobado descuenta las devoluciones ya ingresadas y las roturas aprobadas: la mercadería rota no se incorpora al inventario. Las roturas pendientes deben resolverse antes del rechazo total.

Los rechazos completos vinculados anulan Backup y la venta/comisión asociada por pedido_id, incluyendo ventas antiguas con la fecha exacta y el mismo cliente. Si la vinculación es ambigua se detiene la confirmación.

## Sin conexión y versiones anteriores

Los reportes pueden quedar en la cola del dispositivo; el admin los recibe al sincronizar. Las decisiones que alteran stock requieren conexión y no se ejecutan después desde una cola vieja. Un error conserva el aviso para revisar/reintentar.

Hay que recargar o cerrar y abrir el panel en todos los dispositivos. El módulo reemplaza los manejadores anteriores; si no carga, las acciones financieras heredadas quedan bloqueadas con un aviso. La migración es aditiva y no corrige retrospectivamente movimientos efectuados por versiones viejas.

## Verificación

- `node scripts/test_reparto_revision_v1.js`: roles, importes, progreso y conexiones del módulo.
- `node scripts/test_reparto_revision_browser.js`: dos perfiles en navegador aislado a 390/1280 px; API simulada, doble toque, aviso en Inicio, aprobar/no aprobar, marca en Hoja de Ruta y fallo sin conexión.
- `supabase/tests/reparto_revision_v1_rollback.sql`: RPC real como anon con tokens de usuarios ficticios, stock, nota, rechazo total, repetición, rotura, aislamiento de empresa, permisos y rollback ante stock insuficiente. Todo dentro de BEGIN/ROLLBACK; comprobado que no quedaron empresas de prueba.
- Regresiones: integridad de stock, devoluciones sin reaparición, rutas, selección de mes, WhatsApp y catálogo PDF.

La prueba de base verifica decisiones y reintentos secuenciales; no es una prueba de carga con dos conexiones SQL simultáneas. El bloqueo por fila serializa esas decisiones en la RPC. La revisión de seguridad no agregó avisos nuevos; los avisos heredados de la base siguen siendo un trabajo separado.
