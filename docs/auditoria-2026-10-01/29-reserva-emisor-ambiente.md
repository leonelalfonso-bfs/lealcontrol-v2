# Emisor y ambiente de la reserva

La reserva fiscal conserva el CUIT emisor y si corresponde a producción. Una recuperación por FECompConsultar debe usar exactamente esos datos; si la configuración de la empresa cambió, el gateway bloquea la consulta hasta que se restablezca, sin enviar otra solicitud. La huella sola no codificaba el ambiente.

Pruebas: ejecutar `FiscalAuthorizationAttemptTests`, `FiscalAuthorizationReservationDbTests` y `WsfeVoucherReconciliationTests` en PostgreSQL efímero; comprobar que la tabla tiene `IssuerCuit` y `Production`, y que un emisor distinto no confirma la factura. Esta rama no se desplegó; las columnas heredadas sin emisor quedan con cadena vacía y exigen revisión manual.
