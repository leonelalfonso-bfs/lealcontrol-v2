# Recuperar un envío con emisión desactivada

## Cambio

La acción Consultar ARCA usa POST /api/v1/sales/invoices/{id}/recover-arca,
con el servicio de recuperación exclusivamente. No depende de
Arca:EnableInvoiceAuthorization. Autorizar ARCA conserva ese interruptor.
Ambas rutas requieren los permisos de Ventas y rol Admin, Administrador o
SuperAdmin. Las reservas se buscan en la empresa actual.

La recuperación consulta el número persistido y solo confirma la factura si
todos los datos fiscales coinciden. No reserva numeración ni solicita CAE.
Una reserva Reserved, un rechazo o un borrador sin reserva no inicia consultas
ni envíos. Pending y Unknown mantienen disponible Consultar ARCA aunque la
emisión esté desactivada. La consulta puede guardar localmente el resultado
de un comprobante ya autorizado por ARCA.

## Prueba reproducible

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~FiscalRecoveryApiTests
dotnet test --configuration Release
cd frontend
npm run build
```

Los diez casos nuevos usan PostgreSQL efímero y un gateway simulado: recuperan
Pending y Unknown con emisión desactivada, verifican los tres roles admitidos,
bloquean reservas sin enviar, rechazos, ausencia de reserva, usuarios de Ventas,
anónimos y administradores de otra empresa. Todos exigen cero consultas de
numeración y cero envíos CAE. La suite Release y el frontend se validaron antes
de guardar este commit.

## Comprobación de pantalla pendiente

En un entorno de prueba con emisión desactivada, un administrador debe ver
Consultar ARCA para una reserva Pending o Unknown y el aviso de emisión
deshabilitada. Un borrador sin envío no debe ofrecer Autorizar ARCA.
El gateway de los tests no utiliza certificados ni servicios fiscales reales.
La validación autenticada contra homologación sigue pendiente de disponer
de su certificado. No hubo publicación ni despliegue.
