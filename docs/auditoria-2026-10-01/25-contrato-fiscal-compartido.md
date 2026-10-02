# Contrato fiscal compartido

El constructor XML y el analizador de FECAESolicitar viven en `Crm.Contracts.Fiscal`. Ambos módulos usan el mismo código puro: Ventas prepara el borrador y calcula la huella; CRM podrá firmar y enviar la solicitud sin entregar certificado, token o firma a Ventas. `IWsfeInvoiceAServiceData` transporta solo datos del comprobante.

Prueba automática: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter "FullyQualifiedName~WsfeCaeRequestBuilderTests|FullyQualifiedName~WsfeCaeResponseParserTests|FullyQualifiedName~WsfeVoucherReconciliationTests"`. La compilación de API y la suite completa deben continuar pasando. Este cambio no conecta el endpoint de autorización ni envía comprobantes.
