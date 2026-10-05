# Fecha de emisión del borrador

El formulario mostraba «Fecha de Emisión» pero omitía ese valor al guardar. El servidor reemplazaba la selección por la hora actual. Ahora envía y conserva la fecha seleccionada. Clientes API anteriores pueden omitir el campo y mantienen la fecha actual.

Prueba: en una empresa de prueba, preparar una factura con una fecha distinta a hoy, guardar el borrador y abrir el detalle/PDF. Debe conservarse la fecha elegida. Repetir con una factura creada mediante un cliente API sin `issueDate`: debe tomar la fecha actual. Esta corrección no autoriza facturas ni envía datos a ARCA.
