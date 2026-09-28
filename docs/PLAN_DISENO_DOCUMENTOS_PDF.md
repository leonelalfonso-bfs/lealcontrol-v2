# Identidad visual de documentos PDF

La propuesta comercial es el patrón inicial: marca y número reconocibles, destinatario y metadatos legibles, jerarquía clara entre ítems, totales y condiciones, y un color de acento tomado de la configuración del tenant. El texto comercial va primero; el detalle técnico breve acompaña al ítem y el extenso abre un anexo identificado. El diseño debe funcionar con y sin logotipo.

## Aplicación

- [x] Presupuesto: nueva composición A4, IVA calculado desde el total real, validez coherente con el registro y anexo técnico para contenido extenso. Ensayado con PDF breve de 1 página y técnico de 2 páginas usando datos sintéticos.
- [x] Pedido de venta: vista documental propia con descarga PDF, encabezado, tabla, totales, estado y condiciones. El botón del detalle abre esta vista en lugar de imprimir la pantalla de gestión.
- [x] Remito y orden de compra: misma identidad y jerarquía, con datos de entrega, recepción y proveedor. La orden utiliza la razón social y CUIT reales en las instrucciones predeterminadas de facturación.
- [ ] Factura: aplicar la identidad sin desplazar ni ocultar tipo de comprobante, CAE, QR y demás datos fiscales.
- [ ] Registros de Calidad y Metrología: darles una versión documental más sobria, conservando encabezados de registro, códigos, revisiones y trazabilidad.

Antes de extender cada familia, probar A4 con pocos y muchos renglones, texto largo, tasas de IVA distintas, montos/monedas, página final, logotipo ausente y exportación desde la pantalla real. Las vistas de ejemplo nunca deben llevar datos privados del respaldo BFS al repositorio.

Las tres vistas nuevas se exportaron con datos sintéticos de 3 y 24 renglones mediante el mismo `html2pdf` usado por la aplicación: 1 y 2 páginas A4, respectivamente, sin páginas vacías. Falta validar con datos reales en staging antes de considerar cerrada la revisión visual de cada tenant.
