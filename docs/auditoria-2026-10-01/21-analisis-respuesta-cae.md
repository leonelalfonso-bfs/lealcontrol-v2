# Análisis conservador de respuesta CAE

Este componente todavía no hace llamadas a ARCA ni autoriza facturas. Analiza respuestas `FECAESolicitar` de un solo comprobante con lector XML que prohíbe DTD. Exige coincidencia de punto de venta, tipo, número, concepto, CUIT y fecha. Distingue rechazo inequívoco de resultado desconocido. Aunque reciba aprobación y CAE, devuelve **aprobación pendiente de consulta**: debe verificarse con `FECompConsultar` el monto y los demás campos antes de grabar `Authorized`.

Pruebas: respuesta aprobada, rechazo general, rechazo de detalle, número o receptor distinto, CAE inválido, múltiples detalles, XML malformado y fallo SOAP. En todo caso incierto conservar la reserva y consultar; jamás pedir otro CAE a ciegas.

Referencias: [operación FECAESolicitar de ARCA](https://wswhomo.afip.gob.ar/wsfev1/service.asmx?op=FECAESolicitar) y [manual WSFEv1](https://arca.gob.ar/ws/WSFEV1/documentos/manual-desarrollador-COMPG-v3-4-2.pdf).
