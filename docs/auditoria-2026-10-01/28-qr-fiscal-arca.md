# QR fiscal de comprobante autorizado

El generador forma `https://www.arca.gob.ar/fe/qr/?p=...` con JSON UTF-8 codificado en Base64. Los campos siguen la [especificación oficial de ARCA](https://arca.gob.ar/fe/qr/documentos/QRespecificaciones.pdf): fecha, CUIT emisor, punto/tipo/número oficial, total, moneda/cotización, documento receptor y CAE (`tipoCodAut: E`). No usa el número provisional del borrador. El futuro orquestador debe invocarlo solo después de confirmar FECompConsultar.

Prueba automática: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~ArcaFiscalQrBuilderTests`. Decodificar el parámetro `p`, comparar todos los campos y rechazar CUIT, punto, número o CAE inválidos. La impresión/PDF todavía no se modifica en esta etapa.
