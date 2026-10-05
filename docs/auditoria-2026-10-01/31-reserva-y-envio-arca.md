# Reserva y comienzo de envío fiscal

Una reserva confirmada en PostgreSQL queda `Reserved`: aún no se solicitó CAE. Antes de iniciar una única llamada `FECAESolicitar`, el flujo deberá persistir `Pending` mediante `MarkDispatching` y confirmar esa transacción. Si se interrumpe después de ese cambio, el estado del comprobante es incierto y se debe consultar `FECompConsultar`; no se reenvía automáticamente. `Unknown` conserva el número para la misma consulta. El servicio de reserva bloquea nuevas reservas en la serie mientras exista una en cualquiera de esos estados.

Este cambio **solo agrega la distinción de estados**. No llama a ARCA, no conecta el comando de autorización ni habilita la emisión.
