# Stock confirmado — 29/09/2026

Versión del panel: `v2026.09.29-stock3`. Caché web: `distribix-v1.67`.

## Cambios

- Confirmación persistente antes de enviar movimientos de inventario, con saldo anterior, diferencia y saldo final por producto. Cancelar no envía la operación.
- Se congela el contenido mostrado y se vuelve a consultar el servidor antes de aplicar. Doble toque bloqueado; ajustes manuales y ediciones verifican también el estado esperado dentro de la transacción.
- Hoja de Ruta guarda productos, pedido vinculado, stock e historial en una operación atómica. Un editor obsoleto no pisa cambios nuevos.
- Borrar un backup ya no lo oculta antes de la respuesta ni ignora una devolución fallida. Los pedidos vinculados a una ruta deben desvincularse primero. No se ofrece una restauración local que vuelva a insertar el pedido sin confirmar su stock.
- Lecturas online de catálogo e inventario sin fallback silencioso a fotos viejas. Un inventario o catálogo vacío verificado es válido. Invalidación de caché tras cambios y protección contra respuestas anteriores al cambio.
- No se reactivan productos desde marcas antiguas guardadas en el dispositivo. Se rechazan códigos duplicados al crear productos, sin borrar duplicados históricos.
- Los movimientos antiguos en cola quedan pendientes de revisión; no se reproducen automáticamente. Archivar conserva una copia local recuperable.
- Las salidas y devoluciones respetan `control_stock=false`. Los ajustes de inventario explícitos siguen disponibles para administradores.
- Historial de salidas registrado en la misma transacción. El motor interno no es invocable directamente por clientes de la API.

## Verificación

- `node scripts/validate_panel_scripts.js`.
- Suites `scripts/test_*.js`, incluidas 20 pruebas nuevas de integridad.
- `scripts/test_stock_integridad_v3.sql`: fixtures dentro de un subbloque con rollback; verifica salida/reintento, historial, producto inexistente, decimales, edición vinculada, conflicto, reversión completa, borrado, conteo, preventa, código duplicado y aislamiento por empresa.
- Navegador local aislado, vistas escritorio y 390×844: esperar/Escape no confirma; cancelar conserva 10 unidades con cero escrituras; confirmar aplica 12 con una escritura.
- Migración: `supabase/migrations/20260929034956_stock_integridad_v3.sql`.

## Alcance y seguridad

No se normalizan saldos ni se borran productos/pedidos históricos automáticamente. Cualquier diferencia histórica debe revisarse con movimientos y conteo físico.

Las RPC usan el token firmado de empresa existente. Las funciones públicas accesibles al rol `anon` son deliberadas en esta arquitectura y validan empresa; recuperación de claves exige administrador. El asesor de Supabase las enumera por ser `SECURITY DEFINER`. Referencia: https://supabase.com/docs/guides/database/database-linter

Recargar las pestañas para recibir el módulo nuevo. Un APK que incluya HTML/JS empaquetados necesita una compilación nueva para incorporar la confirmación central; la actualización web no sustituye los archivos de un APK antiguo.
