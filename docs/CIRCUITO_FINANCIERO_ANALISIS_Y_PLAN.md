# Leal Control ERP 2.0 — Circuito financiero: análisis y plan concreto

**Fecha:** 02/09/2026 · **Base:** código de `staging/metrology-2307` @ `78e64d3`
**Alcance:** bancos, extracto, conceptos, reglas, cheques y eCheqs, recibos, órdenes de pago, conciliación, cash flow, y la contabilización desde asientos modelo.
**Regla rectora (acordada):** ningún módulo depende de otro. Finanzas funciona completa sin Contabilidad; al activar Contabilidad, ésta consume lo que Finanzas ya produce.

El checklist ejecutable está en `PLAN_MAESTRO_MEJORAS.md`, bloques 3 y 4. Este documento explica el **qué** y el **por qué**.

---

## 1. Inventario honesto de lo que hay en código

| Área | Qué existe | Archivo | Madurez |
|------|-----------|---------|---------|
| Cuentas financieras | Banco / Caja / Billetera / Inversión, saldo = apertura + Σ movimientos | `FinanceModule.cs` | Sólido |
| Extracto | Import CSV (Galicia y genérico) con preview/confirm, saldo reportado por línea, diferencia vs saldo sistema | `FinanceImport.cs` | Funciona, frágil |
| Conceptos | 18 seeds, dirección, `RequiresCounterparty`, `RequiresInstrument`, categoría de cash flow | `FinanceConcepts.cs` | Sólido |
| Reglas | Contains / StartsWith / EndsWith / Exact sobre la descripción, opcional cuenta y tipo | `FinanceConcepts.cs` | Básico |
| Bandeja de clasificación | Lista 300 movimientos, clasificar manual con confirmar | `FinanceConceptsPage.tsx` | Funciona |
| Recibos | Líneas (medio, importe, cuenta, movimiento, cheque, concepto, retención) + imputaciones a facturas; validación sum líneas > 0 e imputado ≤ cobrado | `FinanceReceipts.cs` | Bueno (Fase A+B hecha) |
| Órdenes de pago | Simétrico a recibos, sin validar suma de líneas | `FinancePayments.cs` | Aceptable |
| Validador de vínculo | Confirmado + cartera correcta + no conciliado + dirección | `FinanceMovementLinkValidator.cs` | Sólido |
| Cheques | Entidad única para recibidos y emitidos; import CSV de ambos; `link-movement`; `use-for-payment` | `FinanceEcheqs.cs` | Incompleto |
| Cartera de cheques (UI) | Lista + importar. Sin acciones | `ChequePortfolioPage.tsx` (1 línea minificada) | Stub |
| Transferencias internas | Dos movimientos con `TransferId`, sin concepto ni clasificación | `FinanceModule.cs` | Básico |
| Cash flow | Facturas por vencimiento + cheques disponibles | `CashFlowPage.tsx` | Básico |
| Conciliación bancaria | **No existe en Finanzas.** Existe en Contabilidad con su propio importador | `AccountingEndpoints.cs:1235-1383` | Duplicado |
| Asientos modelo | CRUD completo, 4+ seeds, `AmountSource`/`Condition` por línea, UI de edición | `AccountingEndpoints.cs:1524-1779` | Decorativo: nada los ejecuta |
| Auto-post | Factura, compra, recibo, sueldos con **códigos fijos** de `AccountingMapping` | `AccountingEndpoints.cs:585-928` | Funciona, ignora plantillas |
| Batch-post | Preview y execute con **importes inventados** | `AccountingEndpoints.cs:1784-2212` | Peligroso (bloque 0.1) |

---

## 2. Fallas concretas encontradas (con ubicación)

1. **Dedup del extracto colapsa movimientos idénticos.** `FinanceImport.cs:46-51` busca `FirstOrDefault` por fecha + importe + tipo. Dos transferencias de $ 50.000 el mismo día se importan como una. Además, si la línea trae "Titular:" se **sobrescribe la descripción** del movimiento existente sin control.
2. **No hay lote de importación.** No se guarda qué archivo, qué período ni qué saldo inicial/final trajo. No se puede saber si el extracto "cuadra" ni evitar subir dos veces el mismo archivo.
3. **Movimientos del sistema y del banco no se distinguen.** Un recibo por transferencia sin movimiento seleccionado crea un `FinancialMovement` ya `Reconciled` (`FinanceReceipts.cs:269-287`). Cuando se importa el extracto, ese movimiento "real" del banco cae en el dedup del punto 1 y se fusiona por casualidad. Si el importe difiere en un centavo, quedan dos.
4. **Cheque recibido no cambia de estado al entrar por recibo.** `FinanceReceipts.cs:291-301` sólo graba `CollectionReceiptId`. Sigue `Available`; en la cartera no se ve que ya fue recibido de un cliente concreto.
5. **`link-movement` marca "Presentado/Acreditado" sin distinguir dirección.** `FinanceEcheqs.cs:58`. Para un cheque emitido el estado correcto es "Debitado".
6. **No existe rechazo de cheque.** El enum tiene `Rejected` pero ningún endpoint lo produce, y no hay reapertura de la deuda del cliente.
7. **Recibos y OP no se pueden anular.** `Status` siempre `"Confirmed"`. Tampoco hay desconciliar. Un error obliga a tocar la base.
8. **OP no valida `Amount == Σ líneas`.** `FinancePayments.cs:129` sólo chequea `> 0`. El recibo sí lo hace bien.
9. **Numeración por timestamp.** `RC-20260902171055`. No es correlativa ni auditable.
10. **`POST /movements/{id}/reconcile` genérico** (`FinanceImport.cs:195-207`) permite conciliar cualquier cosa saltando el validador.
11. **Transferencias internas nacen sin concepto.** `FinanceModule.cs:56`. Cuando llega el extracto, el débito y el crédito aparecen como `PendingIdentification`.
12. **Importación hardcodea `Currency = "ARS"`.** `FinanceImport.cs:74`. Una cuenta USD importa mal.
13. **Contabilidad importa su propio extracto** (`bank-statements/upload`) y contabiliza gastos bancarios desde ahí (`quick-post`). Viola la regla de un solo extracto y crea dos verdades.
14. **Los asientos modelo no se usan.** `auto-post/*` usa `mapping.AccountsReceivableAccountCode` y compañía; la plantilla `AM-VTA-01` que el usuario edita en pantalla no cambia nada.
15. **Contabilidad lee `sales."Invoices"` por SQL** (tabla que no existe; la real es `sales.invoices`) para contar pendientes. Acoplamiento cruzado y además roto.

---

## 3. Modelo objetivo

### 3.1 Principios

1. **Una sola fuente de verdad del banco:** el extracto importado en Finanzas. Nada más crea "movimientos bancarios reales".
2. **Todo lo que el ERP genera antes de ver el extracto es una expectativa**, no un hecho. Se marca `Origin = System` y espera al banco.
3. **Conciliado** significa: el movimiento del extracto tiene concepto confirmado **y**, si ese concepto exige documento, está vinculado a un recibo, OP, cheque o transferencia. Un extracto está conciliado cuando todas sus líneas lo están y el saldo final coincide.
4. **El concepto es la cartera**: define dirección, en qué documentos se puede usar, qué contraparte exige y (si hay Contabilidad) qué asiento modelo lo contabiliza.
5. **Nada se borra, todo se anula** con motivo y efecto inverso.
6. **Contabilidad escucha, no lee.** Recibe documentos ya cerrados a través de un contrato; nunca consulta tablas de otros módulos.

### 3.2 Estados del movimiento financiero

```
Origin = Imported (viene del extracto)
  ClassificationStatus: Imported → Suggested → Confirmed
                                 → PendingIdentification → Identified → Confirmed
                                 → Excluded
  ReconciliationStatus: Available → Reconciled (vinculado a documento/instrumento)
                                  → Excluded (no requiere documento, ej. comisión confirmada)

Origin = System (lo generó un recibo, OP, transferencia o depósito de cheque)
  ReconciliationStatus: PendingBank → MatchedToImport (fusionado con su línea del extracto)
                                    → Voided (el documento fue anulado)
```

Regla: los movimientos `System` **no suman al saldo bancario** mientras están `PendingBank`; suman al "saldo proyectado". Cuando se matchean, el saldo real ya los incluye vía el importado. Así el saldo de la cuenta siempre coincide con el banco. Para cuentas `Cash` (sin extracto) los movimientos `System` nacen `Reconciled` y sí suman.

### 3.3 Concepto ampliado

| Atributo | Tipo | Ejemplo |
|----------|------|---------|
| `Direction` | Income / Expense / Internal / Both | ya existe |
| `UsableIn` | Receipt / PaymentOrder / MovementOnly / Transfer | nuevo. `COMISION` = MovementOnly |
| `CounterpartyType` | Customer / Supplier / None | nuevo. `COBRO_CLIENTE` = Customer |
| `RequiresInstrument` | bool | ya existe (cheques) |
| `JournalTemplateCode` | string? | nuevo. Texto libre que Contabilidad interpreta si está activa. Finanzas no lo valida |
| `CashFlowCategory` | string | ya existe |

Seeds actualizados:

| Código | UsableIn | Contraparte | Plantilla sugerida |
|--------|----------|-------------|--------------------|
| COBRO_CLIENTE | Receipt | Customer | AM-FIN-01 Cobranza banco |
| CHEQUE_RECIBIDO | Receipt | Customer | AM-FIN-02 Cobranza con valores |
| CHEQUE_DEPOSITADO | MovementOnly | None | AM-FIN-03 Depósito de valores |
| CHEQUE_RECHAZADO | MovementOnly | Customer | AM-FIN-04 Rechazo de valores |
| PAGO_PROVEEDOR | PaymentOrder | Supplier | AM-FIN-10 Pago banco |
| CHEQUE_EMITIDO | PaymentOrder | Supplier | AM-FIN-11 Pago con cheque propio |
| CHEQUE_EMITIDO_DEBITADO | MovementOnly | None | AM-FIN-12 Débito de cheque propio |
| TRANSFERENCIA_PROPIA, DEPOSITO_EFECTIVO, EXTRACCION_EFECTIVO | Transfer | None | AM-FIN-20 Movimiento interno |
| COMISION, GASTO_BANCARIO | MovementOnly | None | AM-FIN-30 Gasto bancario |
| IMPUESTO_RETENCION | MovementOnly | None | AM-FIN-31 Impuestos bancarios |
| INTERES_GANADO / INTERES_PAGADO | MovementOnly | None | AM-FIN-32 / 33 |
| SUELDOS | PaymentOrder | None | AM-FIN-40 (HR opcional) |
| AJUSTE | MovementOnly | None | AM-FIN-90 Ajuste |

### 3.4 Lote de importación

Nueva tabla `finance."BankStatementImports"`:

| Columna | Uso |
|---------|-----|
| `AccountId`, `PeriodStart`, `PeriodEnd` | del archivo |
| `DeclaredOpeningBalance`, `DeclaredClosingBalance` | primer y último "Saldo" del CSV |
| `ComputedClosingBalance` | saldo sistema al cierre tras importar |
| `FileHash` (SHA-256), `FileName`, `RowsTotal`, `RowsImported`, `RowsDuplicated`, `RowsRejected` | trazabilidad |
| `Status` | `Balanced` / `Unbalanced` / `Reverted` |

`FinancialMovement` suma `ImportId` y `Origin`.

Dedup nuevo: clave `(AccountId, fecha, importe, tipo, referencia normalizada, hash(descripción))`. Si el archivo trae dos filas iguales y la base tiene una, se importa la segunda. Si el hash de archivo ya existe, se rechaza el lote entero con mensaje "Este archivo ya fue importado el dd/mm".

---

## 4. Flujos detallados

### 4.1 Importar extracto

1. Usuario elige cuenta, sube CSV. Preview muestra filas, saldo inicial/final detectado, cuántas son nuevas, duplicadas, rechazadas, y **cuántas matchean con movimientos del sistema pendientes** (ver 4.7).
2. Confirmar crea el lote, los movimientos `Imported`, corre reglas (sugerencias) y propone matches.
3. Si `ComputedClosingBalance != DeclaredClosingBalance`, el lote queda `Unbalanced`, se muestra la diferencia en rojo y la pantalla de cuenta lo recuerda hasta resolverlo. Causas típicas: movimientos manuales cargados a mano que no están en el banco, o extracto parcial.
4. Un lote se puede revertir sólo si ninguno de sus movimientos está vinculado a documentos.

### 4.2 Clasificar

Reglas enriquecidas (`FinancialConceptRule`):

| Campo nuevo | Uso |
|-------------|-----|
| `MatchMode = Regex` | patrones como `^TRANSF.*CUIT: 30-` |
| `CuitPattern` | CUIT exacto o prefijo. El importador ya deja `CUIT: nn-nnnnnnnn-n` en la descripción |
| `AmountMin`, `AmountMax` | rangos (comisiones chicas, sueldos grandes) |
| `SuggestedCounterpartyId`, `SuggestedCounterpartyType` | si la regla identifica un cliente/proveedor puntual |

Identificación automática de contraparte: al importar, extraer CUIT de la descripción, buscar en `crm.customers.TaxId` y `crm.suppliers.TaxId` **a través de un contrato** (`ICounterpartyLookup`, implementado por CRM, con implementación nula si CRM no está). Si hay match único: crédito → sugerir `COBRO_CLIENTE` + cliente; débito → `PAGO_PROVEEDOR` + proveedor. Esto elimina la mayoría del trabajo manual de la bandeja.

Bandeja:
- Filtros por estado, cuenta, concepto, rango de fechas, texto.
- Selección múltiple → "Confirmar sugeridos" en un click.
- Al confirmar a mano un movimiento sin regla: botón "Crear regla con este texto" prellenado con el fragmento distintivo de la descripción.
- Movimientos con concepto `MovementOnly` confirmados pasan a `ReconciliationStatus = Excluded` automáticamente (no necesitan documento).

### 4.3 Cobrar (recibo)

Un recibo tiene dos bloques que deben cuadrar:

**Medios de cobro (líneas)** — Σ = total del recibo:
| Medio | Qué hace |
|-------|----------|
| Transferencia con movimiento del extracto | elige de la cartera (concepto `UsableIn=Receipt`, `Confirmed`, no conciliado). Movimiento → `Reconciled`, `LinkedEntity = Receipt` |
| Transferencia sin movimiento aún | crea movimiento `System`, `PendingBank`. Se matchea al importar |
| Efectivo | movimiento en cuenta `Cash`, `Reconciled` directo |
| Cheque / eCheq recibido | crea `Cheque` con `Direction=Received`, `Status=InPortfolio`, `CustomerId`, `ReceiptId`. No toca banco |
| Retención sufrida | línea con tipo y número de certificado. No toca banco. Baja la deuda del cliente |
| Compensación / NC | línea sin movimiento; referencia al documento |

**Imputaciones** — Σ ≤ total del recibo:
- Se eligen facturas pendientes del cliente (contrato `ISalesDocumentsLookup`, no SQL).
- Si Σ imputado < total, el resto genera **anticipo** (`CustomerAdvance`) que aparece como saldo a favor y puede imputarse después con un "recibo de aplicación" sin medios.

Validaciones backend (además de las actuales): cliente obligatorio si algún concepto lo exige; moneda de líneas coherente con la cuenta; fecha no posterior a hoy; período contable abierto (contrato `IPeriodLockQuery`, nulo si no hay Contabilidad).

Numeración: `RC-{talonario:0000}-{número:00000000}` desde `finance."DocumentSequences"` con bloqueo de fila.

### 4.4 Pagar (orden de pago)

Simétrico, con estas particularidades:

| Medio | Qué hace |
|-------|----------|
| Transferencia con movimiento del extracto | cartera `UsableIn=PaymentOrder` |
| Transferencia sin movimiento | movimiento `System` débito, `PendingBank` |
| Cheque propio | crea `Cheque` `Direction=Issued`, `Status=Issued`, `SupplierId`, `PaymentOrderId`, `BankAccountId`, `PaymentDate` (diferido). No toca banco hasta que se debite |
| Cheque de tercero (endoso) | toma un cheque `InPortfolio` → `Endorsed`. No toca banco |
| Retención practicada | genera número de certificado correlativo por impuesto; queda como pasivo a depositar |
| Efectivo | cuenta `Cash` |

Validación nueva: `Amount == Σ líneas` (hoy falta). Imputaciones a facturas de compra ≤ total; resto = anticipo a proveedor.

### 4.5 Cheques recibidos — ciclo completo

```
InPortfolio ──deposit──▶ Deposited ──(match extracto crédito)──▶ Credited
     │                       │
     │                       └──reject──▶ Rejected ──▶ reabre deuda del cliente
     ├──endorse (en OP)──▶ Endorsed
     └──cancel──▶ Cancelled (sólo si no tiene recibo, o al anular el recibo)
```

- **Depositar** (`POST /cheques/{id}/deposit`): cuenta bancaria destino y fecha. Crea movimiento `System` crédito, concepto `CHEQUE_DEPOSITADO`, `PendingBank`, `LinkedEntity = Cheque`. Cuando llega el extracto, el match lo pasa a `Credited` con `CreditedAtUtc`.
- **Rechazar** (`POST /cheques/{id}/reject`): fecha, gastos bancarios. Crea movimiento débito `System` por el importe con concepto `CHEQUE_RECHAZADO` (y otro por gastos con `GASTO_BANCARIO` si aplica). El cheque pasa a `Rejected`. La imputación del recibo original se marca `Reversed` y se genera un **cargo pendiente** al cliente ("Cheque rechazado N° … + gastos") que aparece en su cuenta corriente y se cobra con un nuevo recibo. Si hay Contabilidad, el evento genera el contra-asiento.
- **Endosar**: ocurre desde la OP (4.4). Al anular la OP, vuelve a `InPortfolio`.
- **Vencimiento**: job diario marca `Expired` los `InPortfolio` con `DueDate` + 30 días (cheque común) y avisa.

### 4.6 Cheques emitidos — ciclo completo

```
Issued ──(match extracto débito)──▶ Debited
  │
  ├──cancel──▶ Cancelled (anulación de OP antes del débito)
  └──(rechazo por fondos)──▶ Rejected
```

- Al importar el extracto, para cada débito se busca cheque `Issued` de esa cuenta con importe igual y número presente en `ExternalReference`/descripción; se sugiere el match. Confirmar → `Debited`, movimiento vinculado, concepto `CHEQUE_EMITIDO_DEBITADO`.
- Pasivo "cheques emitidos a pagar" = Σ `Issued` por fecha de pago; alimenta cash flow.

### 4.7 Matching sistema ↔ extracto (la conciliación propiamente dicha)

Pantalla nueva **Finanzas → Conciliación**, por cuenta y período:

| Columna izquierda: extracto (`Imported`) | Columna derecha: sistema (`System PendingBank`) |
|---|---|
| fecha, descripción, importe, concepto, estado | fecha, documento origen (RC/OP/cheque/transfer), importe |

Motor de sugerencias (orden de prioridad):
1. Mismo importe + referencia/número de cheque contenido en descripción.
2. Mismo importe + fecha ± 3 días + mismo tipo.
3. Grupo de N movimientos del sistema que suman un importado (depósito de varios cheques en un solo crédito).

Confirmar match: el importado toma `ConceptId`, `LinkedEntityType/Id` del sistema; el del sistema pasa a `MatchedToImport` con `MatchedMovementId`. Desde ese momento sólo se ve uno. Deshacer match revierte ambos.

Indicadores de la cuenta: "Extracto conciliado hasta dd/mm", "N movimientos del banco sin concepto", "N movimientos del sistema sin respaldo bancario hace más de 5 días" (alerta: transferencia que nunca llegó, cheque no depositado).

### 4.8 Transferencias internas y caja

- `POST /transfers` crea ambos movimientos `System`, concepto `TRANSFERENCIA_PROPIA`, `Confirmed`. Los de cuentas `Bank` quedan `PendingBank`; los de `Cash` quedan `Reconciled`. Al importar ambos extractos, cada lado se matchea solo.
- Arqueo de caja: `POST /accounts/{id}/cash-count` con saldo contado; la diferencia genera movimiento con concepto `AJUSTE` y nota obligatoria.

### 4.9 Anular

`POST /collections/{id}/void` y `POST /payments/{id}/void`, motivo obligatorio:
1. Movimientos `Imported` vinculados → `Available`, se limpia `LinkedEntity`, se conserva el concepto.
2. Movimientos `System` creados por el documento → `Voided` (si ya estaban matcheados, se deshace el match primero).
3. Cheques: recibidos vuelven a `Cancelled` si nacieron en este recibo, o a `InPortfolio` si fueron endosados en esta OP; emitidos → `Cancelled` si no están `Debited` (si ya se debitó, no se puede anular: hay que hacer un documento inverso).
4. Imputaciones → borradas; anticipos → revertidos.
5. `Status = Voided`, `VoidedAtUtc`, `VoidReason`, `VoidedBy`.
6. Evento al gateway contable: `ReverseAsync`.

Bloqueos: período contable cerrado (vía contrato); cheque ya debitado; movimiento ya usado por otro documento después de un desmatch manual.

### 4.10 Retenciones

- **Sufridas** (en recibos): tipo (IVA, Ganancias, IIBB por jurisdicción, SUSS), certificado, importe. Reportes: listado por período para descargar como crédito fiscal.
- **Practicadas** (en OP): el sistema emite el certificado con numeración correlativa por impuesto (`finance."DocumentSequences"` tipo `RET-IVA`, `RET-GAN`…), imprimible. Total por impuesto y período = lo que hay que depositar; aparece en cash flow como egreso en la fecha de vencimiento.

---

## 5. Cambios de esquema (Finanzas)

```sql
-- Lote de importación
CREATE TABLE finance."BankStatementImports" (
  "Id" uuid PRIMARY KEY, "TenantId" uuid NOT NULL, "AccountId" uuid NOT NULL,
  "FileName" varchar(260), "FileHash" varchar(64) NOT NULL,
  "PeriodStart" date, "PeriodEnd" date,
  "DeclaredOpeningBalance" numeric(18,2), "DeclaredClosingBalance" numeric(18,2),
  "ComputedClosingBalance" numeric(18,2),
  "RowsTotal" int, "RowsImported" int, "RowsDuplicated" int, "RowsRejected" int,
  "Status" varchar(20) NOT NULL, "CreatedAtUtc" timestamptz NOT NULL, "CreatedBy" varchar(120)
);
CREATE UNIQUE INDEX ON finance."BankStatementImports" ("TenantId","AccountId","FileHash");

-- Movimiento
ALTER TABLE finance."FinancialMovements"
  ADD COLUMN "Origin" int NOT NULL DEFAULT 0,          -- 0 Imported, 1 System
  ADD COLUMN "ImportId" uuid,
  ADD COLUMN "MatchedMovementId" uuid,
  ADD COLUMN "CounterpartyType" varchar(16), ADD COLUMN "CounterpartyId" uuid;
-- ReconciliationStatus suma: 4 PendingBank, 5 MatchedToImport, 6 Voided

-- Concepto
ALTER TABLE finance."FinancialConcepts"
  ADD COLUMN "UsableIn" int NOT NULL DEFAULT 0,        -- 0 Receipt,1 PaymentOrder,2 MovementOnly,3 Transfer
  ADD COLUMN "CounterpartyType" varchar(16),
  ADD COLUMN "JournalTemplateCode" varchar(40);

-- Regla
ALTER TABLE finance."FinancialConceptRules"
  ADD COLUMN "CuitPattern" varchar(20), ADD COLUMN "AmountMin" numeric(18,2), ADD COLUMN "AmountMax" numeric(18,2),
  ADD COLUMN "SuggestedCounterpartyType" varchar(16), ADD COLUMN "SuggestedCounterpartyId" uuid;

-- Cheque (renombrar tabla a "Cheques" en el bloque 6.4; por ahora columnas)
ALTER TABLE finance."ReceivedCheques"
  ADD COLUMN "CustomerId" uuid, ADD COLUMN "SupplierId" uuid, ADD COLUMN "PaymentOrderId" uuid,
  ADD COLUMN "PaymentDateUtc" timestamptz, ADD COLUMN "RejectedAtUtc" timestamptz, ADD COLUMN "RejectionFees" numeric(18,2),
  ADD COLUMN "StatusHistoryJson" jsonb;
-- Status pasa a: 0 InPortfolio,1 Deposited,2 Credited,3 Endorsed,4 Rejected,5 Expired,6 Cancelled,
--                10 Issued,11 Debited  (migración de datos: Available→InPortfolio; UsedForPayment→Endorsed; Presented→Deposited)

-- Documentos
ALTER TABLE finance."CollectionReceipts" ADD COLUMN "VoidedAtUtc" timestamptz, ADD COLUMN "VoidReason" varchar(500), ADD COLUMN "VoidedBy" varchar(120), ADD COLUMN "AdvanceAmount" numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE finance."PaymentOrders" ADD COLUMN "VoidedAtUtc" timestamptz, ADD COLUMN "VoidReason" varchar(500), ADD COLUMN "VoidedBy" varchar(120), ADD COLUMN "AdvanceAmount" numeric(18,2) NOT NULL DEFAULT 0;
ALTER TABLE finance."CollectionReceiptImputations" ADD COLUMN "Status" varchar(16) NOT NULL DEFAULT 'Active'; -- Active / Reversed

CREATE TABLE finance."DocumentSequences" ("TenantId" uuid, "DocumentType" varchar(20), "PointOfSale" int, "NextNumber" bigint NOT NULL, PRIMARY KEY ("TenantId","DocumentType","PointOfSale"));

CREATE TABLE finance."CustomerAdvances" ("Id" uuid PRIMARY KEY, "TenantId" uuid, "CustomerId" uuid, "ReceiptId" uuid, "Amount" numeric(18,2), "Applied" numeric(18,2) DEFAULT 0, "CreatedAtUtc" timestamptz);
CREATE TABLE finance."SupplierAdvances" (... simétrica ...);
CREATE TABLE finance."WithholdingCertificates" ("Id" uuid PRIMARY KEY, "TenantId" uuid, "PaymentOrderId" uuid, "TaxType" varchar(20), "Number" varchar(30), "Base" numeric(18,2), "Rate" numeric(9,4), "Amount" numeric(18,2), "IssuedAtUtc" timestamptz);
```

---

## 6. Contabilidad desde asientos modelo

### 6.1 El contrato (lo que hace "enchufable" al módulo)

Proyecto nuevo `LealControl.Modules.Accounting.Contracts` (sólo interfaces y DTOs, sin EF):

```csharp
public interface IAccountingPostingGateway
{
    Task PostAsync(PostableDocument document, CancellationToken ct);
    Task ReverseAsync(string sourceModule, string sourceDocumentId, string reason, CancellationToken ct);
}

public sealed record PostableDocument(
    string SourceModule,          // Sales, Purchases, Finance, Payroll
    string DocumentType,          // InvoiceA, CreditNoteA, CollectionReceipt, PaymentOrder, BankMovement, ChequeDeposit, ChequeReject, InternalTransfer, Payroll
    string DocumentId, string DocumentNumber, DateTime Date, string Currency, decimal ExchangeRate,
    string? CounterpartyType, Guid? CounterpartyId, string? CounterpartyName,
    string? TemplateHint,         // FinancialConcept.JournalTemplateCode, si lo hay
    IReadOnlyDictionary<string, decimal> Amounts,   // "Total"=121000, "Net21"=100000, "Vat21"=21000, "BankAmount"=..., "RetentionAmount"=...
    IReadOnlyDictionary<string, string> Tags,       // "FinancialAccountId"=guid, "ChequeId"=guid, "RetentionType"=IVA
    IReadOnlyList<PostableDocumentLine>? Lines);    // opcional: una entrada por línea del recibo/OP para asientos por medio
```

- Host registra `NoOpAccountingPostingGateway` por defecto.
- Si el tenant tiene `Accounting` en `AllowedModulesJson`, se registra `AccountingPostingGateway` (en `Accounting.Infrastructure`).
- Sales y Finance inyectan `IAccountingPostingGateway` y llaman `PostAsync` al confirmar y `ReverseAsync` al anular. **No saben** si del otro lado hay algo.
- Regla verificable por test de arquitectura: `Finance.Infrastructure` y `Sales.Infrastructure` referencian `Accounting.Contracts`, nunca `Accounting.Infrastructure`. `Accounting.Infrastructure` no referencia a nadie.

### 6.2 Bandeja de pendientes

`accounting.pending_documents`: el gateway real guarda ahí el `PostableDocument` serializado con estado `Pending`. Es la cola de "cosas para contabilizar". Ventajas:
- `pending-summary` es un `COUNT` sobre esta tabla, sin SQL cruzado.
- Un tenant que activa Contabilidad hoy puede pedir **backfill**: Finanzas y Sales exponen `POST /finance/accounting-sync/replay?from=2026-01-01` que re-publica documentos confirmados históricos al gateway. Así "conectar el módulo" carga el pasado.
- Si el motor no encuentra plantilla o falta un mapeo, el documento queda `Pending` con `LastError`, visible y accionable.

### 6.3 Motor de plantillas

`JournalTemplateEngine.Render(JournalTemplate template, PostableDocument doc, AccountResolver accounts) → RenderedEntry` es una función pura. Por cada `JournalTemplateLine`:

1. Evaluar `Condition` contra `doc.Amounts` / `doc.Tags` (`IfHasVat21` ⇒ `Amounts["Vat21"] > 0`; `IfBankTransfer` ⇒ `Tags["Method"] == "BankTransfer"`; nueva `IfHasRetention`, `IfHasCheque`, `IfHasAdvance`, `IfHasExchangeDifference`).
2. Importe = `doc.Amounts[AmountSource]` (0 si falta y la condición no lo exigía).
3. Cuenta = según `AccountSource` (nuevo campo):
   - `Fixed` → `AccountCode` de la línea (comportamiento actual).
   - `Role:<nombre>` → resuelve por `AccountingMapping` (`AccountsReceivable`, `AccountsPayable`, `Bank`, `Cash`, `ChecksInHand`, `ChecksToPay`, `VatDebit`, `VatCredit`, `WithholdingsSuffered`, `WithholdingsToDeposit`, `CustomerAdvances`, `SupplierAdvances`, `BankExpenses`, `ExchangeGain`, `ExchangeLoss`…).
   - `FinancialAccount` → `Tags["FinancialAccountId"]` → `accounting.finance_account_mapping` → código contable. Permite "Banco Galicia" y "Banco Nación" en cuentas contables distintas.
   - `Counterparty` → Customer ⇒ Role AccountsReceivable; Supplier ⇒ Role AccountsPayable (con subcuenta por contraparte si el plan lo tiene).
4. `IsInvertedSign` invierte Debe/Haber (NC).
5. Memo desde `MemoTemplate` con `{DocumentNumber}`, `{CounterpartyName}`, `{Method}`, `{ChequeNumber}`.
6. Sumar Debe y Haber; si no balancea (tolerancia 0,01) → `RenderError("Asiento desbalanceado: D {x} / H {y}")`.

`AmountSource` nuevos para tesorería: `BankAmount`, `CashAmount`, `ChequeAmount`, `ThirdPartyChequeAmount`, `OwnChequeAmount`, `RetentionAmount`, `ImputedAmount`, `AdvanceAmount`, `ExchangeDifference`, `BankFee`, `MovementAmount`, `RejectionFees`.

### 6.4 Selección de plantilla

1. `doc.TemplateHint` (viene de `FinancialConcept.JournalTemplateCode`) si existe una plantilla activa con ese código.
2. Plantilla activa con `SourceModule == doc.SourceModule && DocumentType == doc.DocumentType`.
3. Plantilla activa con `SourceModule == doc.SourceModule && DocumentType == "All"`.
4. Ninguna → `Pending` con error "Sin asiento modelo para Finance/CollectionReceipt".

Si hay más de una candidata en el mismo nivel, gana la de `Code` menor y se registra warning.

### 6.5 Plantillas seed de tesorería (ejemplos renderizados)

**AM-FIN-01 Cobranza por banco** (`Finance/CollectionReceipt`, hint `COBRO_CLIENTE`)

| Línea | Cuenta (`AccountSource`) | D/H | `AmountSource` | Condición |
|---|---|---|---|---|
| 1 | FinancialAccount | Debe | BankAmount | IfBankTransfer |
| 2 | Role:Cash | Debe | CashAmount | IfCash |
| 3 | Role:ChecksInHand | Debe | ChequeAmount | IfHasCheque |
| 4 | Role:WithholdingsSuffered | Debe | RetentionAmount | IfHasRetention |
| 5 | Counterparty (Deudores) | Haber | ImputedAmount | Always |
| 6 | Role:CustomerAdvances | Haber | AdvanceAmount | IfHasAdvance |

Recibo RC-0001-00000089 por $ 121.000: transferencia $ 100.000 + cheque $ 18.000 + retención IIBB $ 3.000, todo imputado:

```
Banco Galicia c/c            100.000,00
Valores a depositar           18.000,00
Retenciones IIBB sufridas      3.000,00
        a Deudores por ventas — Industrias del Sur      121.000,00
```

**AM-FIN-03 Depósito de valores** (`Finance/ChequeDeposit`): Debe FinancialAccount `ChequeAmount` / Haber Role:ChecksInHand `ChequeAmount`.

**AM-FIN-04 Rechazo de valores** (`Finance/ChequeReject`): Debe Counterparty `ChequeAmount + RejectionFees` / Haber FinancialAccount `ChequeAmount` / Haber Role:BankExpenses… (o el banco cobra los gastos: Debe Counterparty `RejectionFees`, Haber FinancialAccount `RejectionFees`).

**AM-FIN-10 Pago a proveedor** (`Finance/PaymentOrder`, hint `PAGO_PROVEEDOR`): Debe Counterparty (Proveedores) `ImputedAmount` / Debe Role:SupplierAdvances `AdvanceAmount` / Haber FinancialAccount `BankAmount` / Haber Role:ChecksToPay `OwnChequeAmount` / Haber Role:ChecksInHand `ThirdPartyChequeAmount` / Haber Role:WithholdingsToDeposit `RetentionAmount`.

**AM-FIN-12 Débito de cheque propio** (`Finance/BankMovement`, hint `CHEQUE_EMITIDO_DEBITADO`): Debe Role:ChecksToPay / Haber FinancialAccount, `MovementAmount`.

**AM-FIN-20 Movimiento interno** (`Finance/InternalTransfer`): Debe FinancialAccount(destino) / Haber FinancialAccount(origen), `MovementAmount`. Se contabiliza una sola vez por transferencia (no por cada lado).

**AM-FIN-30 Gasto bancario** (`Finance/BankMovement`, hint `COMISION`): Debe Role:BankExpenses `MovementAmount` / Debe Role:VatCredit `Vat21` (si el extracto lo discrimina) / Haber FinancialAccount.

**AM-FIN-31 Impuestos bancarios** (hint `IMPUESTO_RETENCION`): Debe Role:BankTaxes / Haber FinancialAccount.

Estas plantillas se **seedean al activar Contabilidad** y el contador las adapta desde la UI existente (`JournalTemplateFormPage`). Lo que cambia es que ahora la edición tiene efecto.

### 6.6 Cuándo se contabiliza

Setting por tenant `accounting.posting_mode`:
- `OnConfirm`: el gateway renderiza y graba en la misma transacción lógica del documento (si falla la plantilla, el documento se confirma igual y queda `Pending` con error; nunca se bloquea tesorería por contabilidad).
- `Batch` (default): sólo encola. El contador abre **Contabilizar en lote**, ve el preview real documento por documento con su asiento propuesto, excluye lo que quiera y ejecuta.

Ambos caminos pasan por el mismo motor, así el preview y el asiento final son idénticos.

### 6.7 Un solo extracto: qué pasa con la conciliación contable

- Se eliminan `bank-statements/*` y `quick-post`. `BankReconciliationPage` pasa a mostrar, por cuenta financiera mapeada: saldo del mayor contable vs saldo de la cuenta en Finanzas al cierre del período, y la lista de documentos `Pending` que explican la diferencia. Esa es la conciliación que le importa al contador; la operativa (línea a línea contra el banco) vive en Finanzas (4.7).
- Comisiones, impuestos y gastos bancarios: el tesorero confirma el concepto en la bandeja de Finanzas; eso publica un `PostableDocument` tipo `BankMovement` con `TemplateHint = COMISION`; Contabilidad lo contabiliza con AM-FIN-30. Un solo lugar, dos módulos, sin duplicar el CSV.

### 6.8 Reversión

`ReverseAsync` busca el asiento por `(SourceModule, SourceDocumentId)`, genera uno nuevo con Debe/Haber invertidos, `EntryType = "Reversal"`, `Concept = "Reversión de {n} — {motivo}"`, y marca el original `ReversedByEntryId`. Si el período del original está cerrado, el contra-asiento va con fecha del día en el período abierto más cercano.

### 6.9 Qué pasa con `AccountingMapping`

Se conserva como el **catálogo de roles** que las plantillas usan vía `Role:`. Deja de usarse directamente en `auto-post/*`; esos endpoints se reescriben como `PostableDocument` → motor y se marcan obsoletos.

---

## 7. Endpoints nuevos y modificados (resumen)

| Método | Ruta | Acción |
|---|---|---|
| POST | `/finance/imports/bank/confirm` | crea lote, dedup nuevo, saldo, matches sugeridos |
| GET | `/finance/imports` · `/finance/imports/{id}` · POST `/finance/imports/{id}/revert` | lotes |
| GET | `/finance/accounts/{id}/reconciliation?from&to` | vista conciliación (dos columnas + sugerencias) |
| POST | `/finance/movements/match` `{importedId, systemId}` · `/unmatch` | conciliar / deshacer |
| DELETE | `/finance/movements/{id}/reconcile` | **eliminar** el endpoint genérico actual |
| PUT | `/finance/concepts/{id}` | nuevos atributos |
| POST | `/finance/concept-rules` | campos nuevos; `POST /concept-rules/from-movement/{id}` |
| POST | `/finance/movements/classification/bulk` | confirmar N |
| POST | `/finance/collections/{id}/void` · `/finance/payments/{id}/void` | anular |
| POST | `/finance/cheques/{id}/deposit` · `/reject` · `/cancel` | ciclo cheques |
| GET | `/finance/cheques?direction&status&dueFrom&dueTo` | reemplaza `/echeqs` (alias temporal) |
| POST | `/finance/accounts/{id}/cash-count` | arqueo |
| GET | `/finance/withholdings?period&type` · `/finance/withholdings/{id}/print` | retenciones |
| GET | `/finance/cashflow?days` | proyección server-side |
| POST | `/finance/accounting-sync/replay?from` | backfill al activar Contabilidad |
| GET | `/accounting/pending-documents` · POST `/{id}/skip` · `/{id}/retry` | bandeja |
| GET/PUT | `/accounting/finance-account-mapping` | mapeo cuentas |
| POST | `/accounting/batch-post/preview` · `/execute` | reescritos sobre el motor |
| — | `/accounting/bank-statements/*` | **eliminados** |

---

## 8. Orden de implementación y dependencias

```
Bloque 0 (hoy) ──▶ 3.1 validar A+B en staging
                    │
                    ├─▶ 3.2 lote import ─▶ 3.3 matching + pantalla Conciliación
                    │                          │
                    ├─▶ 3.4 concepto ampliado ─┤
                    ├─▶ 3.5 reglas + CUIT      │
                    ├─▶ 3.6 anular ────────────┤
                    ├─▶ 3.7 numeración         │
                    ├─▶ 3.8 OP = recibo        │
                    └─▶ 3.9/3.10 cheques ──▶ 3.11 cartera UI
                                               │
                    4.1 contrato + NoOp ◀───────┘   (puede arrancar en paralelo con 3.4)
                    4.2 bandeja pendientes
                    4.3 motor + tests ─▶ 4.4 selección ─▶ 4.5 batch real ─▶ 4.6 auto-post
                    4.7 un solo extracto (requiere 3.3 terminado)
                    4.8 mapeo cuentas (requiere 4.3)
                    4.9 reversión (requiere 3.6 y 4.3)
```

Estimación gruesa por bloque: 3 → cuatro a cinco semanas de una persona; 4 → tres semanas; se pueden solapar parcialmente desde 4.1.

Entregas visibles para el área contable-financiera, en orden:
1. **Semana 1:** bloque 0 desplegado; A+B validados; ya no se puede ensuciar el diario.
2. **Semana 2-3:** lote de importación con saldo cuadrado + pantalla de Conciliación + anulación de recibos/OP.
3. **Semana 4-5:** cartera de cheques completa (depósito, rechazo, emitidos) + reglas por CUIT + numeración.
4. **Semana 6-7:** motor de plantillas con las 10 plantillas de tesorería; primer asiento real generado desde un recibo.
5. **Semana 8:** batch-post real, backfill, baja del extracto duplicado.

---

## 9. Decisiones que necesitan el OK del área contable

1. **Saldo bancario con movimientos `System` pendientes:** propuesta de mostrar dos saldos ("banco" y "proyectado") en la cuenta. ¿Alcanza o hace falta un tercero "disponible" que descuente cheques emitidos no debitados?
2. **Rechazo de cheque:** ¿el cargo al cliente incluye siempre los gastos bancarios, o se decide por caso?
3. **Anticipo:** ¿se contabiliza en cuenta de pasivo separada (`Anticipos de clientes`) o directo contra Deudores con saldo acreedor? La plantilla AM-FIN-01 asume cuenta separada.
4. **Transferencia interna:** ¿un asiento por transferencia (propuesta) o uno por cada extracto que la confirma?
5. **Comisiones con IVA:** ¿el extracto Galicia discrimina IVA en línea aparte? Si sí, la regla debe reconocerlo como `IMPUESTO_RETENCION` y no como `COMISION`.
6. **Numeración de recibos:** ¿un solo talonario por empresa o uno por sucursal / cuenta?
7. **Retenciones practicadas:** ¿Leal Control emite el certificado o se sigue emitiendo desde el aplicativo de ARCA/ARBA y sólo se registra el número?
