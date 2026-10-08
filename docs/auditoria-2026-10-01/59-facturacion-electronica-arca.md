# Facturación electrónica ARCA (WSFE y FCE)

PR: #79 (candado de producción), #80 (PDF), #81 (motor A/B), #82 (notas), #83 (dólares), #84 (diferencia de cambio), #85 (FCE y reintento), #86 (punto de venta fijo). Todo fusionado en `main` el 7 y 8 de octubre de 2026.

Validado en **homologación** con la empresa de staging (CUIT 30715342215, certificado de homologación). En producción la emisión está **apagada** hasta el encendido descrito en [61](61-encendido-produccion-arca.md).

## Qué se autoriza

| Comprobante | Código ARCA | Receptor |
|---|---|---|
| Factura A, ND A, NC A | 1, 2, 3 | Responsable Inscripto (1) o Monotributo (6), con CUIT |
| Factura B, ND B, NC B | 6, 7, 8 | Consumidor final (5), Exento (4), No alcanzado (15) |
| FCE A, ND FCE A, NC FCE A | 201, 202, 203 | CUIT obligado a recibir FCE |
| FCE B, ND FCE B, NC FCE B | 206, 207, 208 | CUIT obligado a recibir FCE |

- **Concepto:** productos (1), servicios (2) o mixto (3). Los servicios llevan período y vencimiento de pago.
- **Importes:** IVA 10,5%, 21% y 27%, totalizado por alícuota, más importe exento.
- **Consumidor final:** se identifica por CUIT (80), DNI (96) o sin identificar (99, documento "0"). Desde $10.000.000 (total × cotización) tiene que estar identificado (RG 5866/2026). El cliente "Sin identificar" se carga en Clientes con ese tipo de documento.
- **Condición de IVA del receptor:** se envía siempre (`CondicionIVAReceptorId`). Desde el 1/12/2026 ARCA rechaza las solicitudes sin ella (RG 5616).
- **Fecha de emisión:**
  - productos: ±5 días;
  - servicios: ±10 días;
  - FCE: de N-5 a N+1;
  - notas de FCE: de N-5 a N.

  Se controla antes de enviar. Las fechas por defecto usan el día de Argentina, no el de UTC.

## Dólares (RG 5616)

- Las facturas en USD se envían como `DOL`, con `MonCotiz` y `CanMisMonExt`.
- **"Se cobra en dólares"** (`CanMisMonExt=S`): la cotización tiene que ser exactamente la oficial de ARCA, que es la divisa vendedor BNA del día hábil anterior.
  - Se verifica con `FEParamGetCotizacion` **antes de reservar el número**.
  - El botón "Usar cotización ARCA" la actualiza mientras el borrador no se envió.
- **Se cobra en pesos:** se puede usar la cotización ARCA, divisa, billete o una manual. El dólar pactado (divisa o billete) sale de la opción elegida y queda en la factura; el PDF lo aclara junto con el ajuste por diferencia de cambio.
- La base de **homologación devuelve cotizaciones viejas** (por ejemplo 1167,889). En producción hay que verificar que coincida con el cierre BNA del día hábil anterior.

## Notas de crédito y débito

- Se crean desde la factura con los botones **NC** y **ND**. El receptor, la letra, el punto de venta y el concepto quedan fijos.
- ARCA recibe la factura original como `CbtesAsoc` (tipo, punto de venta, número, CUIT y fecha). Una nota solo se autoriza si su factura tiene CAE.
- Las NC pueden ser parciales y no superan lo facturado más las ND autorizadas.
- Stock: la NC reingresa productos solo si es devolución; la ND nunca mueve stock.
- Las notas de **diferencia de cambio** se emiten en pesos, asociadas a la factura en USD, desde la cuenta corriente (ver [60](60-cobranzas-cuenta-corriente-saldos.md)).

## Factura de Crédito Electrónica MiPyMEs

- **Detección:** `wsfecred` → `consultarMontoObligadoRecepcion(CUIT, fecha)`. **El campo de respuesta se llama `obligado`**: el manual dice `respuesta`, pero vale el WSDL.
- **Bloqueos antes de reservar número:**
  - factura común a un cliente obligado por encima de su monto mínimo;
  - FCE a un cliente no obligado;
  - FCE por debajo del mínimo.

  Pendiente: confirmar con el contador si se puede emitir FCE voluntaria por montos menores.
- **La factura FCE** lleva vencimiento de pago y, como opcionales, el CBU (2101) de 22 dígitos, el alias (2102) y la transferencia (27: SCA o ADC). El CBU y el alias salen de Configuración.
- **Las notas FCE** llevan solo el código 22 (anulación S/N). Con "S" ARCA exige que el comprador haya rechazado la FCE (rechazo 10154 si no la rechazó).
- **Homologación devuelve el mínimo viejo** ($3.958.316). El vigente desde abril de 2026 es $5.549.862. Siempre se usa el que informa ARCA.
- Pendiente: consultar si el comprador aceptó o rechazó la FCE.

## Seguridad del envío (sin cambios de diseño)

1. Se reserva el número (consulta del último autorizado) y se guarda en `sales.fiscal_authorization_attempts` antes de enviar.
2. Se envía una sola vez (`FECAESolicitar`).
3. Si la respuesta es incierta, se consulta con `FECompConsultar` sobre el mismo número; nunca se reenvía.
4. Para confirmar, se compara cada campo que devuelve la consulta (alícuotas, exento, documento, condición de IVA, asociados, opcionales) con lo preparado. El hash de la reserva está en la versión v2.

**Rechazos.** El intento queda `Rejected` con los códigos y mensajes de ARCA, que el listado muestra. El número rechazado queda libre: el índice único excluye los rechazados. **"Corregir y reintentar"** precarga el borrador; al guardar se crea uno nuevo y se anula el rechazado, sin volver a mover stock.

**Candados de configuración**
- `Arca:EnableInvoiceAuthorization` (`ARCA_ENABLE_INVOICE_AUTHORIZATION`): habilita la emisión en ese servidor.
- `Arca:AllowProductionAuthorization` (`ARCA_ALLOW_PRODUCTION_AUTHORIZATION`): sin ella, una empresa configurada en producción no puede emitir. Así, staging nunca factura en real.
- **Punto de venta fijo por empresa** (Configuración → "Punto de venta de este sistema"). El formulario lo bloquea y el servidor rechaza cualquier otro antes de pedir número. Sirve para convivir con otro sistema de facturación sin mezclar numeración.

## Evidencia en homologación (7 y 8 de octubre de 2026)

| Comprobante | Resultado |
|---|---|
| A 0001-00000001, servicio 21% | CAE 86400963243861 |
| B 0001-00000001, consumidor final sin identificar | CAE 86400963553755 |
| A 0001-00000002, productos 21%, 10,5%, 27% y exento | CAE 86400963566256 |
| A 0001-00000003 a monotributista, con leyenda Ley 27.618 | CAE 86400963584556 |
| NC A 0001-00000001, parcial sobre A 0002 | CAE 86400963714863 |
| ND B 0001-00000001 sobre B 0001 | CAE 86400963701582 |
| A 0001-00000004 USD, se cobra en dólares (cotización ARCA) | CAE 86400964206046 |
| A 0001-00000005 USD, se cobra en pesos | CAE 86400964246420 |
| FCE A 0001-00000001 ($7.865.000) y 0002 ($12.100) | CAE 86400964544576 / 86400964546332 |
| NC FCE A 0001-00000001 sin anulación | CAE 86400964655690 |
| NC FCE A con anulación sobre FCE no rechazada | Rechazo 10154, el esperado |

## Código

- Contrato y SOAP: `Crm.Contracts/Fiscal/WsfeVoucherData.cs`, `WsfeCaeRequestBuilder.cs`, `WsfeCaeResponseParser.cs`.
- Cliente ARCA: `Crm.Infrastructure/Arca/ArcaFiscalGateway.cs`, `ArcaWsfeClient.cs` (consulta, cotización), `WsfecredClient.cs`.
- Ventas: `Sales.Infrastructure/Fiscal/WsfeVoucherPreparation.cs` (borrador → datos ARCA), `FiscalReservationService.cs` (controles previos y reserva), `FiscalAuthorizationService.cs`, `FiscalVoucherRecoveryService.cs`, `FiscalAssociation.cs`, `FiscalEmissionDateRule.cs`.
- Pruebas: `tests/LealControl.Modules.Crm.IntegrationTests/` (`WsfeVoucherPreparationTests`, `CreditNoteApiTests`, `DollarInvoiceApiTests`, `FceApiTests`, `RejectedRetryApiTests`, etc.). Usan el reloj fijo `FiscalTestClock` (2/10/2026): las fechas de los comprobantes de prueba tienen que ser de ese día.
