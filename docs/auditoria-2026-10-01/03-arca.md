# Hallazgo crítico: autorización ARCA simulada

Base revisada: `main` en `5acf972` (1 de octubre de 2026). Auditoría de código; no se consultaron comprobantes ni bases productivas.

## Evidencia

- `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Persistence/InvoiceQueryHandlers.cs`, método `Handle(AuthorizeInvoiceArcaCommand)`: arma un CAE con fecha y `Random.Next`, fija un vencimiento a 10 días, construye el QR localmente y llama a `invoice.Authorize(...)`. No hay llamada a WSFE en ese recorrido.
- `src/Modules/Sales/LealControl.Modules.Sales.Infrastructure/Http/InvoiceEndpoints.cs`: `POST /api/v1/sales/invoices/{id}/authorize-arca` invoca ese handler.
- `frontend/src/pages/InvoiceFormPage.tsx`: «Emitir con ARCA (CAE Directo)» llama a `api.authorizeInvoiceArca` y afirma que enviará al Web Service.
- `frontend/src/pages/InvoicesPage.tsx`: el botón «CAE ARCA» usa la misma llamada y etiqueta el resultado «CAE Autorizado».

## Consecuencia

El sistema puede presentar como autorizado un comprobante que no fue autorizado externamente. Prioridad P0. El código también usa CUIT de reemplazo si falta configuración fiscal; eso puede contaminar el QR resultante. La auditoría no prueba qué comprobantes reales han seguido esta ruta.

## Corrección propuesta

1. Bloquear el endpoint de autorización simulada y el botón de emisión directa hasta conectarlos con un cliente real de ARCA o identificar un camino oficial ya implementado.
2. Mantener los borradores consultables, sin inventar CAE ni cambiar estados fiscales.
3. Implementar autorización real con manejo de errores y persistencia de la respuesta oficial, y verificar en homologación con un comprobante de prueba.
4. Auditar en modo solo lectura los comprobantes marcados `Authorized` por esta ruta antes de cualquier corrección de datos. No cambiar estados históricos automáticamente.

## Instructivo de prueba para la futura corrección

- En homologación, con credenciales de prueba, emitir un comprobante válido y cotejar número, CAE, vencimiento y QR con la respuesta del servicio.
- Desconectar el servicio y confirmar que el comprobante permanece sin autorización; no debe generarse CAE local.
- Reintentar una solicitud con la misma factura y verificar que no se emita un segundo comprobante.
- Probar configuración fiscal faltante: debe informar el problema y no usar CUIT sustitutos.

Estado: hallazgo documentado; sin cambios de código ni datos.
