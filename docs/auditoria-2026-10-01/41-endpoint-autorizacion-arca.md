# Endpoint de autorización fiscal con activación explícita

POST /api/v1/sales/invoices/{id}/authorize-arca utiliza FiscalAuthorizationService y devuelve la factura únicamente si quedó Authorized con CAE confirmado. Conserva el filtro de empresa actual y las políticas de escritura de Ventas, y exige además rol Admin, Administrador o SuperAdmin.

La configuración Arca:EnableInvoiceAuthorization está deshabilitada por defecto. Mientras no se habilite expresamente, el endpoint responde Sales.Invoice.ArcaUnavailable y no crea reservas ni llama al gateway. Su equivalente de entorno es Arca__EnableInvoiceAuthorization. La configuración permite entrar al flujo; no reemplaza certificados, ambiente ni validaciones fiscales de la empresa.

Un resultado incierto responde Sales.Invoice.ArcaNotConfirmed y conserva el número reservado para consulta posterior. Repetir la operación sobre un intento ya enviado no solicita otro CAE. Una aprobación devuelve el DTO recargado desde la base, con número y CAE oficiales.

## Verificación reproducible

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter 'FullyQualifiedName~FiscalAuthorizationApiTests'
```

Seis pruebas con TestServer, PostgreSQL efímero y gateway simulado cubren aprobación por Admin y Administrador, desactivación, rechazo de un rol de ventas, acceso anónimo y resultado incierto. Verifican persistencia y repetición sin doble envío. No usan certificados reales ni llaman a ARCA.

## Pendientes

- Presentar estados fiscales y errores en la pantalla y evitar acciones concurrentes desde la interfaz.
- Validar contrato oficial, fechas y numeración; probar homologación con configuración concreta.
- Verificar aislamiento entre empresas, perfiles no admitidos y migraciones dentro del flujo completo.
- Ejecutar suite completa de solución y frontend antes de publicar. No se habilitó configuración en ningún servidor ni se emitieron comprobantes.
