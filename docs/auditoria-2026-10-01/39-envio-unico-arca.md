# Envío único de la reserva fiscal

El servicio FiscalAuthorizationService combina reserva, persistencia del inicio del envío y consulta oficial posterior. Está registrado en dependencias; el endpoint de autorización sigue sin conectarse.

Antes de llamar al gateway, bloquea el borrador, coteja el contenido contra la huella reservada y confirma Reserved → Pending en una transacción. Una respuesta aprobada requiere consulta y coincidencia del CAE y su vencimiento. Un corte de red deriva a consulta; una cancelación conserva Pending. Los nuevos intentos sobre Pending, Unknown o Confirmed consultan o devuelven el estado confirmado, sin volver a enviar.

Un rechazo concluyente conserva la reserva y deja la factura sin CAE. Si otra consulta cambió el estado a Unknown, el rechazo no lo reemplaza automáticamente.

## Verificación reproducible

Desde el repositorio, con .NET 8 y Docker disponibles:

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter 'FullyQualifiedName~FiscalAuthorizationServiceTests|FullyQualifiedName~FiscalVoucherRecoveryServiceTests'
```

Las diez pruebas usan PostgreSQL efímero y un gateway simulado. Una conexión independiente verifica que Pending sea visible antes del envío. Cubren aprobación, rechazo, respuesta incierta, corte de red, cancelación, discordancia de CAE y repetición de la operación. No usan certificados ni red de ARCA.

## Pendientes para habilitar el flujo

- Probar concurrencia entre solicitudes sobre la misma factura y entre facturas de una serie; reforzar la exclusión de reservas si corresponde.
- Validar consulta y fechas contra el contrato oficial y probar homologación con configuración específica.
- Conectar endpoint y pantalla con permisos fiscales y estados claros.
- Verificar migración de bases existentes y ejecutar la suite completa de la solución y frontend.
- Publicación y prueba de emisión real pendientes; esta mejora no habilita el endpoint ni implica emisión.
