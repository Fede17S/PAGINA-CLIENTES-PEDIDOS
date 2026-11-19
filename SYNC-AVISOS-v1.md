# Avisos de sincronización y reportes técnicos

Accesos: aviso de sincronización → Ver estado; Cuenta → Sincronización y errores;
Configuración → Herramientas → Sincronización y errores.

## Acciones diferentes

- **Ocultar aviso** recuerda el estado actual por empresa/perfil en este navegador.
  No borra pendientes ni los marca como realizados. El mismo error no reaparece por
  incrementar el contador de intentos; un pendiente nuevo o un motivo distinto sí avisa.
- **Detalle** muestra mensaje, código SQL/PostgREST, HTTP, detalle, sugerencia,
  identificador de solicitud, intentos, versión y ubicación técnica cuando están disponibles.
  Una operación antigua puede tener solo el mensaje limitado que guardaba esa versión.
- **Reintentar en orden** requiere conexión y confirmación. No saltea operaciones anteriores
  ni habilita movimientos antiguos de stock. Los rechazos HTTP 4xx/SQL permanentes quedan
  pausados hasta revisión; los fallos transitorios conservan el mecanismo de reintentos.
- **Archivar operación fallida**, solo administración/coadministración, detiene futuros
  reintentos. Primero conserva una copia local completa y comprueba el almacenamiento.
  Si falta espacio, cambia la sesión, la cola cambia o hay una sincronización en curso, no
  elimina el pendiente. No revierte pasos que ya pudieron confirmarse en el servidor.
- El **archivo local** permite consultar/reportar el error y descargar un respaldo para
  recuperación asistida. No hay reejecución automática ni botón para aplicar movimientos
  de stock antiguos. No es un respaldo en la nube; borrar los datos del navegador lo elimina.

## Reportar al programador

Destino autorizado: **+54 9 280 506-5662**.
El usuario revisa el reporte y pulsa Abrir WhatsApp; todavía debe confirmar Enviar en WhatsApp.
No se envían mensajes desde el servidor ni se registra que el mensaje fue entregado.
También puede copiar o descargar el log técnico.

El reporte no adjunta el payload de pedidos, productos, cobros, tokens o contraseñas.
Los errores se depuran para omitir filas SQL completas, credenciales, correo, teléfonos
y valores personales identificables presentes en la operación. El respaldo completo es
una descarga local separada, reservada a administración y con advertencia de privacidad.

El caso `ruta_clientes_ruta_id_fkey` se explica como una referencia a una ruta inexistente
o no disponible. No se modifica la base, no se elimina la restricción y no se repara ese
movimiento automáticamente: debe revisarse el destino con el estado del servidor.

## Límites y verificación

- No cambia RLS, permisos de Supabase, tablas ni cantidades de inventario.
- La comprobación de cola local detecta una copia desactualizada de otra pestaña; no
  reemplaza un sistema transaccional distribuido para la cola completa.
- `node scripts/test_sync_avisos_v1.js`: transporte, SQL, privacidad, archivo, almacenamiento,
  permisos, cambios de sesión, orden y pausas.
- `node scripts/test_sync_avisos_browser.js`: móvil/escritorio, sin envíos ni base reales.
- Pruebas de replay de movimientos de ruta, persistencia de reparto e integridad de stock.

Publicar `sync-avisos-v1.js` junto con el panel y Service Worker v1.81.
