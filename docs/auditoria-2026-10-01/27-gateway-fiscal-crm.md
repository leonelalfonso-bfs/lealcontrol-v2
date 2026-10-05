# Acceso fiscal desde CRM

`IArcaFiscalGateway` permite a Ventas consultar el último número, solicitar CAE para una reserva y consultar el comprobante. CRM carga el certificado por tenant, obtiene token y firma WSAA internamente y verifica que CUIT emisor y ambiente no hayan cambiado desde la reserva. El contrato devuelve solo datos fiscales necesarios y nunca expone las credenciales.

La solicitud sigue sin estar conectada a `AuthorizeInvoiceArcaCommand`: ninguna factura se emite al compilar o desplegar este componente. Antes de habilitar el flujo faltan la reserva transaccional persistida, recuperación de resultados inciertos, QR oficial, pruebas de permisos y pruebas de extremo a extremo con red simulada. Para verificar este cambio: `dotnet build src/Host/LealControl.Api/LealControl.Api.csproj` y la suite de integración CRM.
