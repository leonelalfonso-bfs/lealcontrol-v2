# Cotejo integral de FECompConsultar

La consulta de un comprobante emitido devuelve los campos del pedido más el CAE. El analizador exige el perfil inicial Factura A por servicios, ARS, receptor RI, IVA 21% y sus importes, fechas, moneda y condiciones. La conciliación compara **todos** estos campos con el borrador y la reserva antes de asignar el CAE. Respuestas incompletas o discordantes quedan sin confirmar; no autorizan un nuevo envío automático.

Referencia: https://www.arca.gob.ar/ws/documentacion/manuales/manual-desarrollador-ARCA-COMPG.pdf, sección FECompConsultar.

Este cambio no llama a ARCA ni habilita la emisión.
