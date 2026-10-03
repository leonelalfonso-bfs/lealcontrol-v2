# Aislamiento del endpoint fiscal y TLS desde .NET

Las 17 pruebas de FiscalAuthorizationApiTests pasaron con PostgreSQL efímero y gateway simulado. Incluyen Admin, Administrador y SuperAdmin; bloqueo por configuración o permisos; acceso anónimo; respuesta incierta; estados persistidos; consulta de reservas filtrada por empresa y repetición sin doble envío.

Los casos de factura ajena, inexistente, tipo B, USD, condición de IVA no admitida, CUIT inválido, período de servicio inválido, estado distinto de Draft y ausencia de ítems se rechazan sin consultar numeración, solicitar CAE ni crear reserva. La factura conserva su estado previo y no recibe CAE.

## Reproducción

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter 'FullyQualifiedName~FiscalAuthorizationApiTests'
```

## Contratos públicos y TLS

La prueba de lectura pública con HttpClient estándar de .NET 8.0.31 en Ubuntu 24.04.4 LTS obtuvo HTTP 200 de los WSDL de homologación y producción. Cada contrato expuso 34 campos heredados de consulta e incluyó condición de IVA del receptor, fechas de servicio y pago, neto, IVA, moneda y cotización. No utilizó certificados, autenticación ni operaciones de comprobantes.

Se mantuvo validación TLS normal. El cliente nombrado arca del repositorio tiene timeout de 30 segundos y no mostró excepciones de validación de certificado en la inspección. El fallo DH_KEY_TOO_SMALL de Python no se reprodujo en este cliente .NET local. Esto no confirma por sí solo WSAA, POST SOAP ni compatibilidad de la imagen del VPS; resta verificarlos en el entorno apropiado.

Contratos: [homologación](https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL) y [producción](https://servicios1.afip.gov.ar/wsfev1/service.asmx?WSDL).

## Estado y pendientes

La última solución completa verificada antes de esta ampliación tuvo 313 pruebas Release aprobadas. En este cambio solo se agregaron pruebas y documentación; las 17 pruebas de API seleccionadas pasaron. No atribuir todavía un total actualizado a la solución completa.

Pendientes: comprobar el procedimiento de migración y preflight de reservas existentes, probar visualmente la pantalla, realizar homologación con empresa/certificado/punto específicos y actualizar continuidad. La rama sigue local y la emisión está deshabilitada por defecto. No se modificó ningún servidor ni se emitieron comprobantes reales.
