# Editor visual de remitos — primera etapa

Configuración → Diseño del Remito / Pedido.

- Estilos clásico, compacto y moderno; color y blanco y negro.
- Logo de la empresa: mostrar/ocultar, posición y ancho proporcional.
- Grupos de datos, productos, fuentes, observaciones, firmas y texto de pie.
- Vista previa del PDF real (canvas con PDF.js local), pedido corto/largo y zoom.
- Opciones/vista previa separadas en móvil. Descarga del PDF de ejemplo y HTML.
- Borrador independiente: deshacer, rehacer, descartar y restaurar clásico.
- Al guardar se conserva una copia del diseño anterior, recuperable como borrador.
- Cero filas mínimas no vuelve a quince. El relleno no fuerza otra hoja.

## Compatibilidad y seguridad

Se conserva el diseño anterior hasta que un administrador guarde el nuevo.
El JSON `pdf_config` de `empresas_config` incorpora `version:2` y los nuevos campos.
No requiere SQL, nuevas tablas ni cambios de permisos. Se conservan las claves desconocidas.
Solo administración/coadministración puede guardar; la base sigue aplicando sus políticas existentes.
Se comprueba si cambió el diseño en el servidor antes de guardar; no es un bloqueo transaccional entre administradores.

Los puntos de integración son `generarPDF`, `generarPDFDesdeBackup` e `imprimirPedidosDeRuta`.
Se comparte el dibujo, no el proceso de venta. Los cálculos existentes de descuentos, promociones,
pendientes, IVA, reservas de número y movimientos de stock no se modificaron.
El ejemplo no crea pedidos ni consume números. El diseño impreso usa la configuración guardada, nunca el borrador.
El visor PDF integrado queda como alternativa si el navegador no carga los módulos de PDF.js (por ejemplo `file://`).

## Verificación

- `node scripts/test_remito_diseno_v2.js`: límites, compatibilidad, permisos, guardado, fallos, conflictos y aislamiento entre empresas.
- `node scripts/test_remito_diseno_v2_browser.js`: editor móvil/escritorio, historial, recuperación, descargas, PDF real y las tres integraciones con datos ficticios.
- `node scripts/test_remito_totals.js` y `node scripts/test_stock_integridad_v3.js`.
- Pruebas de disponibilidad, descuentos, promociones, aprobación en lote y scroll de Backup.
- PDFs cortos y de varias páginas renderizados con Poppler e inspeccionados visualmente.

Dos pruebas antiguas (`test_pedido_remito_atomico.js` y `test_stock_operaciones_v2.js`) tienen
aserciones fijas a versiones de septiembre (v1.67 / stock3) que ya no correspondían a la base v1.78.
Se conservaron sin cambios; no se usaron como evidencia de aprobación completa.

PDF.js 5.6.205 y sus fuentes se distribuyen localmente en `pdfjs/`, con sus licencias.
Service Worker v1.79. Publicar este módulo y la carpeta `pdfjs/` junto con el panel, no en la tienda.

## Segunda etapa — datos compactos y opciones de impresión

- Datos del cliente en dos columnas a lo ancho de A4/A5; una columna en ticket de 80 mm.
  Cada fila toma la altura del dato más largo y puede continuar en otra hoja.
- Columnas configurables con visibilidad y orden mediante flechas. Descripción y cantidad
  siempre presentes. Código y presentación pueden tener columna propia.
- Resumen configurable: subtotal, promociones/descuentos, IVA, ahorro informativo y cantidad
  de renglones. Ocultar un detalle no altera el total; no se mezcla deuda anterior con la venta.
- Datos de pago y contacto por campo (alias, CBU, titular, enlace, WhatsApp).
- QR optativo al enlace de pago, tienda de la empresa o URL personalizada HTTP/HTTPS.
  Se genera localmente y no confirma ni registra pagos. URLs con credenciales o esquemas
  ejecutables se rechazan. Generador QR 1.4.4 local, con licencia MIT.
- Formatos nativos A4, A5 y ticket 80 × 297 mm por página, con encabezados/tabla/pie adaptados.
  A4 sigue como predeterminado. Elegir ticket propone tres columnas legibles; se pueden ajustar.
  La impresora debe configurarse con el papel correspondiente y escala 100%.
- El formato guardado se aplica tanto a Backup como a HR y Nuevo Pedido. Los ejemplos no
  consumen números ni hacen movimientos de inventario.
- Verificado por lectura del QR renderizado y límites de texto en A4/A5/ticket, además de
  las pruebas de guardado, borradores, permisos, empresas y totales. Un pedido corto completo
  no deja las firmas en una hoja separada. Prueba con dirección/nombre extensos y campos ocultos.

Service Worker v1.80; módulo `remito-diseno-v2.js?v=20261118-2` y `qrcode-1.4.4.min.js` local.
