# Bootstrap: fallos de esquema visibles

## Problema y corrección

El bootstrap por base propagaba los errores persistentes de esquema, pero
InitializeAllAsync los capturaba y podía terminar correctamente aunque alguna
empresa no hubiera completado su esquema. Ahora conserva cada error, revisa
las demás bases y finalmente arroja AggregateException si hubo fallos.
La cancelación solicitada se propaga inmediatamente.

Program.cs ya detiene la API en producción cuando esa tarea falla. En
Development conserva su tratamiento actual del error. El bootstrap de producción
sigue siendo asíncrono: este cambio no garantiza que la API espere a finalizarlo
antes de aceptar solicitudes.

## Validación reproducible

Ejecutar en esta rama:

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~FiscalReservationConcurrencyDbTests
dotnet test --configuration Release
```

Las seis pruebas de concurrencia y esquema incluyen PostgreSQL efímero con dos
reservas incompatibles, Pending y Unknown, de la misma serie. Tanto el bootstrap
por base como el general deben fallar con el conflicto del índice de reservas
sin resolver. Los estados, números y CAE nulos permanecen intactos.
La suite completa Release se ejecutó satisfactoriamente antes de este commit.

## Alcance y pendientes

No se borraron ni resolvieron reservas para permitir crear el índice. Una base
con conflictos requiere revisión de los comprobantes contra ARCA antes de
modificar datos. No hubo publicación, despliegue ni acceso a datos reales.
Falta validar el flujo con certificado de homologación; el usuario dispone
actualmente solo de certificados de producción.
