# Reserva fiscal previa a WSFE

La tabla `sales.fiscal_authorization_attempts` reserva un número por tenant, punto de venta y tipo antes de solicitar CAE. También limita cada borrador a una solicitud y registra un hash del payload, receptor e importe. Las restricciones únicas existen en la migración y en el bootstrap de esquemas heredados. Una respuesta desconocida queda `Unknown`; ese número no se reenvía sin consultar ARCA.

Esta rama **solo agrega el modelo y el esquema**. No envía facturas ni modifica el comando de autorización; todavía faltan el cálculo fiscal, la solicitud CAE, la conciliación por `FECompConsultar` y el cambio del número del borrador al oficial. No desplegar esta rama aisladamente.

Prueba automatizada: `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~FiscalAuthorizationAttemptTests`. Antes de usarla en staging, verificar con una base efímera que el índice único rechaza dos reservas del mismo punto/tipo/número y que el bootstrap crea la tabla cuando las migraciones EF no pueden avanzar.

Prueba de esquema: `FiscalAuthorizationReservationDbTests` inicia PostgreSQL efímero, crea dos borradores e intenta reservar el mismo número para ambos; debe recibir `23505` en la segunda reserva.
