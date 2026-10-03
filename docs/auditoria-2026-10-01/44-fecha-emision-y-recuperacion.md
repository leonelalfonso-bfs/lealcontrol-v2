# Ventana de fecha de emisión y recuperación de comprobantes antiguos

El perfil inicial de factura A de servicios valida la fecha de emisión dentro de los diez días anteriores o posteriores a la fecha civil actual de Argentina (UTC-3), incluidos ambos extremos. Rechaza fechas inválidas. La zona horaria del host no determina el día fiscal.

FiscalReservationService verifica la ventana antes de consultar numeración o crear una reserva. FiscalAuthorizationService vuelve a comprobarla antes de persistir Pending e iniciar el envío. Una reserva sin enviar que queda fuera de plazo permanece Reserved y requiere revisión, sin solicitar CAE.

La recuperación de un intento Pending o Unknown no aplica esta ventana: un comprobante enviado anteriormente puede consultarse y confirmarse mediante el cotejo fiscal completo. No se vuelve a enviar para recuperarlo.

Fuente: [Manual oficial WSFEv1 RG 4291](https://www.arca.gob.ar/fe/ayuda/documentos/wsfev1-RG-4291.pdf), definición de CbteFch para conceptos 2 y 3. ARCA conserva la validación final de todas las condiciones del comprobante.

## Pruebas reproducibles

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter 'FullyQualifiedName~FiscalEmissionDateRuleTests|FullyQualifiedName~FiscalReservationServiceTests|FullyQualifiedName~FiscalAuthorizationServiceTests|FullyQualifiedName~FiscalVoucherRecoveryServiceTests|FullyQualifiedName~FiscalAuthorizationApiTests'
```

Las 35 pruebas seleccionadas pasaron con PostgreSQL efímero, gateway simulado y reloj controlado. Cubren extremos de la ventana, fecha inválida, medianoche argentina, rechazo previo a numeración, reserva que vence antes del envío y recuperación de una solicitud antigua. Se ejecutó la solución completa en Release antes del commit; sus resultados figuran en la salida de ejecución. No se usaron certificados ni se emitieron comprobantes reales.

## Pendientes

- Verificar compatibilidad TLS desde el cliente .NET y el entorno de despliegue mediante contrato público, sin reducir validación TLS.
- Completar pruebas de aislamiento del endpoint de autorización y perfiles fiscales no admitidos.
- Revisar migraciones sobre bases existentes, probar la pantalla y realizar homologación con empresa, certificado y punto de venta específicos.
- Actualizar continuidad y reunir evidencia de validación antes de publicar o habilitar emisión. La rama permanece local y la emisión está deshabilitada por defecto.
