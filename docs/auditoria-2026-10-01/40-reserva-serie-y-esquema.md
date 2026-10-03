# Exclusión de reservas fiscales por serie y actualización del esquema

La base impide más de un intento Reserved, Pending o Unknown por empresa, punto de venta y tipo de comprobante mediante el índice único parcial UX_fiscal_attempt_unresolved_series. Complementa el bloqueo de cada factura y la unicidad del número oficial, incluso cuando dos transacciones intentan reservar números distintos.

La migración 20261002180000_FiscalReservationSeriesGuard y el bootstrap ejecutan el mismo SQL. Actualizan la restricción de estados anterior para admitir Reserved sin cambiar las filas históricas. La operación admite repetición. Si existen varias reservas sin resolver en una serie, la creación del índice falla y exige revisión; no borra ni resuelve intentos automáticamente. La serie mantiene el criterio conservador existente de empresa, punto y tipo, sin separar ambientes.

## Verificación reproducible

Con .NET 8 y Docker disponibles:

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter 'FullyQualifiedName~FiscalReservationConcurrencyDbTests'
```

Cinco pruebas con PostgreSQL efímero verifican transacciones simultáneas en los tres estados sin resolver, independencia entre puntos de venta, liberación de la serie al resolver un intento y actualización repetida del esquema antiguo conservando Pending. No utilizan certificados ni llaman a ARCA.

## Pendientes

- Concurrencia de autorización comprobada: dos solicitudes sobre la misma factura, con el primer envío en espera, realizan un único SubmitCaeAsync. La segunda consulta conserva Unknown y la confirmación posterior autoriza la factura. Las 16 pruebas fiscales seleccionadas pasaron.
- Revisar el contrato oficial de consulta, límites de numeración y fechas antes de homologación.
- Conectar endpoint y pantalla con permisos fiscales; verificar migraciones y solución completa antes de publicar.
- La autorización real y el despliegue siguen pendientes; estas pruebas no emiten comprobantes.
