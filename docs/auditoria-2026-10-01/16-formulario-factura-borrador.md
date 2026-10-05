# Formulario de facturas · evitar emisión aparente

La API mantiene deshabilitada la autorización ARCA. El formulario anterior ofrecía «Emitir con ARCA» y, si la API respondía error, lo ocultaba y abría el borrador. Esto podía confundirse con una emisión fiscal exitosa.

El formulario ahora ofrece solo guardar el borrador y explica expresamente que no solicita CAE. El flujo fiscal se habilitará únicamente cuando se implementen numeración oficial, reserva persistente, recuperación por `FECompConsultar`, validación fiscal y pruebas completas.

Prueba manual: en una empresa de prueba, crear una factura desde un pedido o remito. Debe verse «Guardar como Borrador / Proforma», sin botón «Emitir con ARCA». Tras guardar, comprobar estado Borrador, sin CAE ni QR fiscal. El remito y sus saldos mantienen su comportamiento actual.
