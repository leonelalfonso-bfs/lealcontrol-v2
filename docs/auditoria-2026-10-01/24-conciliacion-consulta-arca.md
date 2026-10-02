# Conciliación de FECompConsultar

Una respuesta perdida de FECAESolicitar deja el intento `Unknown`. La conciliación coteja la respuesta de consulta oficial con factura, reserva, emisor, receptor, importe, número, huella y, cuando se recibió un CAE provisional, con ese CAE. Solo entonces cambia la reserva a `Confirmed` y asigna número oficial, CAE y QR a la factura. La operación de este componente es local; el futuro orquestador debe guardar ambos objetos en una misma transacción.

Prueba: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~WsfeVoucherReconciliationTests`. Verifica recuperación de respuesta desconocida y rechazo por diferencias de número, receptor, importe, CAE o huella. No habilitar el endpoint de emisión hasta probar las llamadas reales y las transacciones en una base aislada.
