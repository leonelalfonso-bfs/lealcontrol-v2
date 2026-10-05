# Confirmación del número fiscal

El número mostrado en un borrador es provisional. `ConfirmFiscalAuthorization` solo cambia número, CAE, vencimiento, QR y estado cuando recibe una reserva `Confirmed` de la misma empresa, factura, punto de venta, tipo, receptor, importe y huella de la solicitud original. El QR debe usar HTTPS y el dominio fiscal oficial. La reserva debe haberse confirmado mediante FECompConsultar; el método no contacta ARCA.

Prueba automática: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~FiscalInvoiceConfirmationTests`. Debe rechazar reservas pendientes, ajenas y una segunda confirmación.

Prueba funcional futura: tras autorizar un borrador de prueba en ambiente controlado, comprobar que el número oficial reemplaza al provisional en factura, listado y PDF. No habilitar autorización ni usar producción hasta conectar y verificar toda la secuencia reserva → solicitud → consulta → confirmación.
