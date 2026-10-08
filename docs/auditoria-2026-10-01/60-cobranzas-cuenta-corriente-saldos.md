# Cobranzas, diferencia de cambio, cuenta corriente y saldos en el servidor

PR: #82 (cruce de cobros por id), #84 (diferencia de cambio, cuenta corriente y cobranzas), #86 (saldos en el servidor).

## Saldos: una sola fuente de verdad

El servidor calcula cobrado, acreditado y pendiente de cada comprobante (`Sales.Infrastructure/Persistence/ReceivableBalances.cs`). Esos valores viajan con el listado y el detalle de facturas (`collected`, `credited`, `pending`). Facturas, Cobranzas y "Hoy" los usan. El cálculo del navegador (`lib/receivables.ts`) queda solo como respaldo.

**Reglas**
- **Cobrado:** imputaciones activas de recibos no anulados, **por id de factura**. Antes se buscaba el número formateado dentro del texto del recibo, que comparten la Factura A, la B y las notas: así aparecían facturas "cobradas" sin recibo.
- **Factura en USD cobrada en pesos:** cuentan los USD de la imputación, no los pesos.
- **Recibos viejos sin imputaciones:** cuentan por su `InvoiceId`.
- **Acreditado:** NC autorizadas asociadas, salvo las de diferencia de cambio.
- **Quedan en cero, porque no son saldo a cobrar:** las NC y las notas por diferencia de cambio.

**Cuenta corriente** (`CurrentAccounts.cs`)
- `GET /api/v1/sales/current-accounts`: resumen por cliente y proveedor.
- `GET /api/v1/sales/current-accounts/{id}`: movimientos ordenados por día calendario y hora de carga, saldo acumulado, pendiente por comprobante y diferencias "a documentar".
- Las proformas y los borradores rechazados no suman deuda.

## Diferencia de cambio (factura en USD cobrada en pesos)

- La deuda se mide en USD. Cada imputación guarda los USD que cancela, la cotización de la factura, la de pago y la **diferencia realizada** = USD cancelados × (TC pago − TC factura). La diferencia se calcula en el servidor.
- Siempre la cancela el mismo recibo:
  - **Caso A (paga ajustado):** la ND deja el saldo en 0.
  - **Caso B (paga al TC de la factura):** lo que queda son los USD pendientes, que al cobrarse generan otra ND chica.
- **En la cuenta corriente** la diferencia aparece como "a documentar", sumada al saldo, con el botón **Emitir ND/NC**.
- **La nota**
  - va en pesos, asociada a la factura y vinculada a la imputación (`ExchangeDifferenceImputationId`, con índice único);
  - se reparte por alícuota con el mismo redondeo del servidor (mitad al par), al centavo;
  - el servidor exige tipo, factura e importe exactos.
- Cuando la nota existe, la línea "a documentar" desaparece: la diferencia nunca se cuenta dos veces.

## Pantalla de Cobranzas (rediseño)

- **Tres preguntas:** ¿quién pagó?, ¿cómo pagó?, ¿qué cancela?
- **Resumen fijo:** recibido, aplicado, queda a cuenta y diferencia de cambio. Explica por qué no se puede confirmar todavía.
- **Aplicación automática a lo más viejo** (por vencimiento). Al tocar algo pasa a manual, y "Volver a aplicar automáticamente" deshace.
- **Facturas en USD:** una línea con el TC pactado (BNA del día hábil anterior al cobro). Con "Cambiar" se elige divisa o billete, día anterior, hoy u otro valor. La diferencia se explica en palabras.
- **Cotizaciones BNA:** `GET /api/v1/sales/quotes/bna?type=billete|divisa&date=` lee el histórico del Banco Nación (billetes `idMoneda=22`, divisas `id=monedas&idMoneda=55`). Las cotizaciones en vivo también salen del BNA; antes la "divisa" era el mayorista del BCRA.
- Cartera, vínculo con el extracto bancario, cheque nuevo y certificado de retención quedan en "Detalles".

## Cuenta corriente (pantalla)

- Es una página propia (`?cuenta=id`), que se abre desde la fila o con "Ver cuenta".
- Columnas: Debe, Haber, Saldo de la cuenta y Pendiente del comprobante.
- **Descargar PDF:** estado de cuenta con logo y datos de la empresa, del cliente o proveedor, los movimientos y el saldo. Las diferencias "a documentar" no salen en el PDF.

## Pendiente

- Órdenes de pago en USD: la orden no guarda cotización. La cuenta corriente de proveedores las suma a TC 1, igual que antes. Corregir junto con el módulo de compras.
- Contabilización de diferencias de cambio y notas: no se revisó el módulo contable en estos bloques.
