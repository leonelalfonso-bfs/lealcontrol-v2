# ARCA · consulta de comprobante previo a recuperación

- [x] Cliente WSFE `FECompConsultar` de solo lectura.
- [x] Parser que exige punto de venta, tipo, número, resultado A, CAE y fecha válidos.
- [ ] Vincularlo al flujo de autorización con una reserva persistente y bloqueo por tenant/PV/tipo.
- [ ] Cotejar receptor, importe, moneda y fecha con el borrador antes de guardar el CAE recuperado.
- [ ] Probar autorización en un ambiente autorizado y falla de red posterior a la respuesta.

Una respuesta fallida, vacía o no coincidente es **indeterminada**; jamás prueba que el número esté libre.
No se llama a `FECAESolicitar` en este cambio.

Prueba local: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~WsfeVoucherLookupParserTests`.
Prueba manual futura: autorizar una factura válida; simular pérdida de respuesta; consultar `FECompConsultar`; vincular únicamente si todos los datos coinciden; bloquear reenvío automático si la consulta no confirma.
