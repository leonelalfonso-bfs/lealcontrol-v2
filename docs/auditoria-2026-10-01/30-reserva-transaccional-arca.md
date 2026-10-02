# Reserva fiscal transaccional

`FiscalReservationService` valida un borrador A de servicios, consulta el último número oficial mediante el gateway, calcula la huella y persiste la reserva en PostgreSQL antes de cualquier FECAESolicitar. Dentro de una transacción bloquea la factura, vuelve a validar que no cambió y se niega a continuar si existe una reserva pendiente o incierta en la serie. El índice único protege una carrera entre dos borradores. Un segundo intento sobre la misma factura exige conciliación; no reenvía el comprobante.

Prueba automatizada: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~FiscalReservationServiceTests`. Usa PostgreSQL efímero y gateway falso; confirma una sola reserva y ninguna llamada de emisión. El endpoint de autorización sigue bloqueado.
