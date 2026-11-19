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
