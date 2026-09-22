# Plan de evolución del módulo Compras

Fecha de auditoría: 17 de agosto de 2026.

## Objetivo

Construir un circuito de abastecimiento profesional, simple para una pyme y escalable para organizaciones con múltiples depósitos, responsables, monedas y niveles de aprobación. El módulo debe conservar independencia funcional, integrándose mediante contratos con Directorio, Inventario, Producción, Comunicaciones y, en el futuro, Contabilidad/Tesorería.

## Estado actual comprobado

### Disponible y reutilizable

- Maestro de proveedores compartido con Directorio/CRM.
- Solicitudes internas con prioridad, sector, fecha requerida, motivo e ítems.
- Aprobación y rechazo de solicitudes.
- Registro de varias cotizaciones por solicitud, adjunto y selección de oferta.
- Órdenes de compra en varias monedas, descuentos, impuestos, condiciones de pago y fecha prevista.
- Estados de orden: borrador, enviada, parcialmente recibida, recibida y cancelada.
- Recepciones vinculables a órdenes, depósito, remito y números de serie.
- Facturas de proveedor vinculables a orden y recepción, impuestos argentinos, CAE y vencimiento.
- Importación y conciliación inicial de comprobantes ARCA.
- Relación producto-proveedor con precio, moneda, plazo, mínimo y proveedor preferido.
- Generación de solicitud de compra desde necesidades de reposición de Inventario.

### Incompleto o débil

- Los documentos existen, pero la navegación no muestra un circuito unificado ni el estado global de una compra.
- Los cambios de estado de las órdenes son demasiado libres y requieren una máquina de estados validada.
- La recepción parcial no exhibe con claridad pendiente por línea, backorder, rechazo o diferencia.
- Falta conciliación automática de tres documentos: orden, recepción y factura.
- Falta tolerancia configurable para diferencias de cantidad y precio.
- Falta aprobación por monto, sector, categoría, moneda o excepción.
- Falta generación directa de orden desde la cotización elegida.
- Falta trazabilidad histórica y auditoría legible de quién hizo cada acción.
- Falta evaluación de proveedores y tablero operativo.
- Falta tratamiento completo de servicios, anticipos, gastos adicionales, devoluciones y notas de crédito.
- Falta integración formal con cuentas a pagar y registración contable futura.
- Falta ayuda integrada y documentación técnica específica de Compras.

## Circuito objetivo

Necesidad de compra → Solicitud → Aprobación → Pedido de cotización → Comparación → Adjudicación → Orden de compra → Confirmación del proveedor → Recepción / servicio conforme → Control de calidad → Factura → Conciliación de tres vías → Cuenta a pagar → Evaluación del proveedor.

El sistema debe permitir comenzar directamente en una orden o factura cuando el plan y los permisos lo habiliten, sin obligar a una microempresa a recorrer pasos innecesarios.

## Principios tomados de suites líderes

- Odoo utiliza control por cantidades pedidas o recibidas y conciliación de tres vías para decidir si una factura debe pagarse.
- SAP mantiene recepción e ingreso de factura como eventos separados y contempla diferencias de precio mediante el circuito GR/IR.
- Dynamics 365 incorpora colaboración con proveedores para aceptar, rechazar o proponer cambios a una orden.
- Las suites líderes incluyen acuerdos de compra, licitaciones/comparación de ofertas, automatización de reposición y análisis de proveedores.

Referencias oficiales:

- https://www.odoo.com/documentation/master/applications/inventory_and_mrp/purchase/manage_deals/control_bills.html
- https://www.odoo.com/documentation/18.0/applications/finance/accounting/vendor_bills.html
- https://help.sap.com/docs/SAP_S4HANA_ON-PREMI-SE/af9ef57f504840d2b81be8667206d485/be5eb6531de6b64ce10000000a174cb4.html
- https://learn.microsoft.com/en-us/dynamics365/supply-chain/procurement/vendor-collaboration-work-external-vendors

## Plan de implementación

## Avance de esta implementación

- Fase 1: Centro de control de Compras integrado al menú y compilado.
- Fase 2: transiciones seguras de órdenes y aprobación obligatoria antes de cargar cotizaciones.
- Fase 3: comparación y selección de cotizaciones ya disponibles en el expediente de solicitud; la orden puede iniciarse con el proveedor y referencia seleccionados.
- Fase 4: recepción validada por orden/proveedor, cantidades mayores a cero y actualización de stock conservando remito y depósito.
- Fase 5: validación de líneas de factura, detección de duplicados, coincidencia de proveedor y endpoint de conciliación por línea.
- Fase 6: reportes de gasto y cumplimiento, alertas de demora, evaluación inicial de proveedores, ayuda visible y documentación técnica.

### Fase 1 — Ordenar el circuito existente

- Crear tablero de Compras con pendientes y alertas.
- Crear vista de expediente de compra que reúna solicitud, cotizaciones, orden, recepciones y facturas.
- Generar orden desde cotización seleccionada sin recargar datos.
- Agregar historial, comentarios y adjuntos comunes.
- Incorporar ayuda del módulo.

Resultado: el usuario entiende qué debe hacer y puede seguir una compra de punta a punta.

### Fase 2 — Reglas y aprobaciones

- Máquina de estados y transiciones válidas para cada documento.
- Matriz configurable de aprobaciones por monto, sector, categoría y moneda.
- Roles separados: solicitante, comprador, aprobador, receptor y auditor.
- Bloqueos y excepciones con motivo obligatorio.
- Auditoría inmutable de decisiones.

Resultado: control interno suficiente para clientes exigentes sin endurecer el flujo básico.

### Fase 3 — Abastecimiento y cotizaciones premium

- Solicitudes de cotización a múltiples proveedores por correo.
- Comparativa normalizada por moneda, impuestos, plazo, flete, garantía y forma de pago.
- Adjudicación total o parcial por línea/proveedor.
- Acuerdos marco, listas de precios y vigencias.
- Confirmación del proveedor: aceptada, rechazada o aceptada con cambios.

Resultado: mejor decisión de compra y menos carga administrativa.

### Fase 4 — Recepción, calidad y devoluciones

- Recepciones parciales por línea, lote, serie, vencimiento y depósito.
- Pendiente y backorder automáticos.
- Control de calidad opcional: aceptado, cuarentena o rechazado.
- Devolución a proveedor y reemplazos.
- Costos adicionales: flete, seguro, aduana y prorrateo al costo de inventario.

Resultado: Inventario refleja lo que realmente ingresó y su costo real.

### Fase 5 — Facturas y conciliación

- Conciliación orden–recepción–factura por línea.
- Tolerancias configurables de precio y cantidad.
- Estados: conciliada, con diferencias, bloqueada o aprobada excepcionalmente.
- Facturas parciales, anticipos, notas de crédito/débito y gastos sin stock.
- Importación desde ARCA, correo y PDF; detección de duplicados.
- Preparación del contrato para Contabilidad y Cuentas a pagar.

Resultado: ninguna factura se libera sin justificar qué se pidió, qué llegó y qué se facturó.

### Fase 6 — Inteligencia, evaluación y cierre

- Tablero de gasto por proveedor, categoría, producto y sector.
- Cumplimiento de entrega, calidad, precio y respuesta del proveedor.
- Alertas de demora, sobreprecio, concentración y vencimientos.
- Sugerencias de reposición basadas en stock, producción y plazos.
- Manual de usuario, documentación técnica y pruebas integrales.

Resultado: módulo cerrado, medible y preparado para planes comerciales distintos.

## Alcance recomendado para la primera versión vendible

Implementar completas las fases 1, 2, 4 y 5. De la fase 3 incluir comparación de cotizaciones y envío por correo. De la fase 6 incluir tablero, cumplimiento de entrega y reportes básicos. Portal de proveedores, OCR avanzado y predicción pueden ofrecerse más adelante como funcionalidades premium.

## Criterios de cierre

- Una necesidad puede convertirse en orden sin duplicar información.
- Cada línea muestra pedido, recibido, facturado y pendiente.
- Las transiciones inválidas quedan bloqueadas.
- Una factura duplicada se detecta.
- Las diferencias de precio/cantidad requieren resolución.
- Recepción y devolución impactan correctamente en Inventario.
- Todos los documentos muestran historial y usuario responsable.
- El módulo funciona aunque CRM, Producción o Contabilidad no estén contratados.
- Ayuda, documentación y pruebas acompañan la funcionalidad.
