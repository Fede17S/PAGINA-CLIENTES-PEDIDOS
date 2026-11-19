# Vitrina externa iClap · empresa 1122

## Uso

- En Catálogo en vivo y en la tienda con `?emp=1122` aparece **iClap · Tecnología → Ver productos**. Empieza plegada para no desplazar el catálogo habitual.
- Muestra fotos, modelo, condición, especificaciones, precio público (desde el menor precio de variante) y disponibilidad. Permite buscar, filtrar por categoría, actualizar y ver más resultados.
- **Ver en iClap** abre la ficha original en otra pestaña. No agrega productos al carrito ni emite pedidos, reservas o movimientos de stock de la distribuidora.
- Lee el origen fijo `https://iclap-catalogo.vercel.app/api/catalog`; ninguna URL ni credencial externa es configurable desde el navegador.
- Al abrir el apartado vuelve a consultar si pasaron más de 30 segundos desde la última lectura; al volver de otra app/pestaña o pulsar Actualizar consulta siempre. No hay actualización en tiempo real ni envío de mensajes automático. La ficha de iClap confirma precio final y variante.

## Administración

Ingresar en la tienda `/admin?emp=1122` con el acceso habitual. El primer bloque permite activar/desactivar el apartado, mostrar todos los productos publicados o elegir manualmente por SKU. Guardar usa el botón existente de la tienda. Vista previa y Descartar mantienen su comportamiento.

Se guarda únicamente `config.iclap = {enabled, mode: "all" | "selected", skus: [...]}` en la fila existente de `tienda_config` de la empresa. El catálogo en vivo lee esa misma fila. No se necesitan nuevas tablas, SQL ni cambios a permisos. Los demás campos de configuración se conservan.

Si no había configuración iClap se muestran todos los productos publicados. Con selección manual vacía no se muestra ningún producto. Los productos despublicados nunca se rescatan de la selección. Los agotados se identifican como **Sin stock** y enlazan a la ficha para consulta, sin ofrecer compra local.

## Aislamiento y privacidad

- La interfaz requiere el código resuelto de empresa exactamente `1122`; no basta el texto de la URL. No lee iClap para las demás empresas.
- El puente `/api/iclap?empresa=1122` es público, sólo acepta GET y sólo expone información que ya es pública en iClap. Rechaza otros códigos, pero no constituye autenticación de usuarios ni vuelve privado el catálogo público de iClap.
- La administración sigue protegida por la validación y el token existentes. No hay endpoint nuevo de escritura.
- Se descartan explícitamente costos, ganancias, configuración interna, credenciales y datos de clientes. El servidor vuelve a seleccionar los campos permitidos.
- No se copia el inventario ni se modifica iClap. Si falla el origen se quitan los precios anteriores; no se usa un catálogo ficticio ni una copia offline.
- El service worker evita cachear `/api/iclap`. Fotos y archivos estáticos pueden guardarse como antes.
- Si no se logra leer la configuración, no se asume que todos los productos están habilitados.

## Publicación y pruebas

Panel: `PANEL-index_15.html` como `index.html`, módulo JS/CSS y `sw.js` en `Fede17S/PAGINA-CLIENTES-PEDIDOS`.
Tienda: `pagina tienda.html` como `index.html`, mismo módulo JS/CSS y `api/iclap.js` en `Fede17S/PAGINA-TIENDA`. El puente requiere la copia JS en la raíz. La tienda usa ruta relativa; el panel/archivo local usa el puente publicado en la tienda madre para no depender de CORS del origen iClap.

No cambia ni requiere desplegar el proyecto VENTA DE IPHONE. No se compila APK en esta etapa.

Pruebas: `node scripts/test_iclap_v1.js`, `node scripts/test_iclap_browser.js`, validadores de scripts de panel/tienda y regresiones de precios, promociones, emojis, stock, rutas y sincronización. Las pruebas de navegador son aisladas: sólo la configuración ficticia se guarda y no hay compras ni operaciones reales.
