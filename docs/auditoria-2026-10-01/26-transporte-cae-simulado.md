# Transporte de solicitud CAE

`WsfeCaeTransport` envía un único FECAESolicitar al ambiente configurado. Construye el XML con el contrato fiscal compartido y clasifica el resultado con el parser probado. Un HTTP fallido, timeout o excepción queda `Unknown`, sin reintento automático ni registro de credenciales o XML. Una aprobación sigue pendiente de FECompConsultar. Este componente aún no está conectado al endpoint de autorización; la aplicación no emite facturas.

Prueba automática: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~WsfeCaeTransportTests`. Usa `HttpMessageHandler` simulado y credenciales ficticias: respuesta aprobada, HTTP 503 y corte de red; cada caso debe hacer una sola llamada.
