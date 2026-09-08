# Leal Control ERP 2.0 — Plan maestro de mejoras

**Origen:** auditoría de código del 02/09/2026 sobre `staging/metrology-2307` @ `78e64d3`.
**Cómo usar este documento:** cada tarea tiene un checkbox `[x]` = **código implementado** (commit en rama). La verificación en staging se anota en **Verificado** y en el registro de avances al final. No marcar `[x]` como “hecho en producción” hasta pasar el criterio de aceptación en staging.

Documentos relacionados:
- `CIRCUITO_FINANCIERO_ANALISIS_Y_PLAN.md` — análisis funcional y plan detallado de bancos, cheques, conceptos, cobros/pagos y asientos modelo (bloques 3 y 4 de este plan se detallan ahí).
- `CIRCUITO_DINERO_FINANZAS.md` + `SIMULACION_CIRCUITO_DINERO_COMPLETA.md` — diseño aprobado por el área contable.
- `CIRCUITO_DINERO_PROGRESO.md` — checklist de validación de Fases A+B (queda vigente, se referencia desde el bloque 3).
- `quality/MODULO_CALIDAD_ANALISIS.md` — diseño y avance del módulo Calidad ISO 17025 (**Bloque Q** abajo; reanudar desde §0 de ese doc).

---

## Tablero de estado

| Bloque | Objetivo | Tareas | Código | Verificado staging | Estado |
|--------|----------|:------:|:------:|:------------------:|--------|
| 0 | Frenar corrupción de datos | 5 | 5/5 | 0/5 | ✅ Código en `fcd60ee` — validar staging |
| 1 | Cerrar agujeros de seguridad | 6 | 6/6 | 0/6 | ✅ Código en `a364601` — validar staging |
| 2 | Deploy y backups confiables | 6 | 6/6 | 6/6 | ✅ Verificado staging 02/09/2026 — smoke 10/10 Healthy |
| 3 | Circuito financiero completo | 14 | 14/14 | 1/14 | ◐ API A+B OK staging — UI manual + **F-T1** pendiente |
| 4 | Contabilidad desde asientos modelo | 9 | 9/9 | 0/9 | ◐ Código 4.1–4.9 listo — verificar staging |
| 5 | Red de tests del circuito del dinero | 6 | 6/6 | 0/6 | ✅ Código en `8fb4e17` — tests locales OK |
| 6 | Deuda técnica | 8 | 7/8 | 7/8 | ✅ `53d1d5a` staging 03/09/2026 — smoke 10/10; **6.4 diferido** |
| Q | Calidad ISO 17025 (SGC) | — | ◐ | ◐ | **C1✅ C2◐ C3 MC01+PG03+PG07✅** — siguiente PG04; detalle en `docs/quality/…` §0 |

Regla de orden: **bloque 2 antes del 3** (CI y backups estables). **No empezar bloque 4** sin tareas 3.1–3.6 del bloque 3.  
**Bloque Q** corre en paralelo en `staging/metrology-2307` (INMELA / auditoría OAA); no bloquea el circuito del dinero.

---

## Bloque 0 — Frenar corrupción de datos (esfuerzo total: 1 jornada)

Estas cinco tareas son cambios chicos. Se hacen todas juntas en un solo commit y se despliegan el mismo día.

### 0.1 Desactivar «Contabilizar en lote» hasta que lea documentos reales
- [x] `AccountingEndpoints.cs` — `POST /batch-post/execute` devuelve `409 Conflict` con mensaje "Función en reconstrucción" y **no escribe** ningún asiento.
- [x] `POST /batch-post/preview` devuelve lista vacía con warning explícito en lugar de la factura inventada "A-0001-00001245 / Agroservicios del Litoral".
- [x] `GET /batch-post/pending-summary` devuelve ceros reales y **elimina** el `catch` que devolvía 5/3/4 hardcodeados. Si la consulta falla, loguea con `ILogger` y devuelve 500.
- [x] `BatchPostingModal.tsx` — el botón "Contabilizar" queda deshabilitado con tooltip que explica el motivo.
- [x] Script SQL para detectar asientos ya generados por el lote falso: `scripts/detect-fake-batch-journal-entries.sql`. Ejecutar en staging y en la base de Leal Control; si hay filas, revertirlas con `POST /batch-runs/{id}/revert` o borrado manual documentado.

**Criterio de aceptación:** apretar "Contabilizar" en staging no crea ninguna fila en `accounting.journal_entries`. La consulta del script devuelve 0 filas.
**Verificado:** pendiente staging / ____

### 0.2 Arreglar nombres de tabla del backup interno
- [x] `TenantProvisionerService.cs:323-325` — reemplazar la lista fija por descubrimiento dinámico vía `information_schema` (esquemas `public`, `crm`, `sales`, `purchases`, `finance`, `fleet`, `hr`, `accounting`, `communications`, `metrology`).
- [x] Dentro del `foreach`, el `catch` **loguea** la tabla que falló con `_logger.LogError` y agrega una línea `-- ERROR exportando {table}: {mensaje}` al dump.
- [x] El dump incluye `-- Tablas exportadas: N` y `-- Tablas fallidas: N` en el encabezado.

**Criterio de aceptación:** descargar el backup de Leal Control desde SuperAdmin y verificar que aparecen tablas `finance."FinancialAccounts"`, `finance."FinancialMovements"`, etc.
**Verificado:** pendiente staging / ____

### 0.3 Control de rol en `/api/v1/company`
- [x] `Program.cs` — policy `"RequireAdmin"` = `RequireRole("Admin", "Administrador", "SuperAdmin")` con `RoleClaimType = "role"`.
- [x] `CompanySettingsEndpoints.cs` — escrituras protegidas con `.RequireAuthorization("RequireAdmin")`.
- [x] Test de integración `CompanySettingsRbacTests.cs`: usuario `Comercial` recibe 403 en `DELETE /users/{id}` y `PUT /settings`.

**Criterio de aceptación:** el test pasa; en staging un usuario Comercial ve la lista de usuarios pero al intentar borrar recibe "Permisos insuficientes".
**Verificado:** pendiente `dotnet test` / ____

### 0.4 Cortar la request si el tenant no resuelve
- [x] `TenantConnectionProvider.cs` — lanza `TenantNotFoundException` si el tenant no existe; fallback sólo para `Guid.Empty`.
- [x] Bloqueo de tenants `Suspended` y `Expired`.
- [x] Middleware en `Program.cs` → 403 JSON con mensaje claro.
- [x] `TenantNotFoundException.cs` en BuildingBlocks.

**Criterio de aceptación:** un JWT con `tenant_id` inventado recibe 403 en cualquier endpoint.
**Verificado:** pendiente staging / ____

### 0.5 Sacar el fallback de identidad en `/auth/me`
- [x] `AuthEndpoints.cs` — eliminado fallback al primer usuario activo del tenant; si no hay usuario válido → 401.
- [x] `AuthContext.tsx` — ante 401 en `/me`, limpia sesión y redirige a `/login`.

**Criterio de aceptación:** borrar un usuario mientras tiene sesión abierta → esa pestaña vuelve a login.
**Verificado:** pendiente staging / ____

**Verificado bloque 0 (staging):** ____ / ____ — pendiente deploy + checklist manual

---

## Bloque 1 — Cerrar agujeros de seguridad (esfuerzo total: 3 jornadas)

### 1.1 Webhook de MercadoPago accesible y firmado
- [x] `SuperAdminEndpoints.cs` — mover `POST /webhooks/mercadopago` fuera del grupo con filtro SuperAdmin, a `/api/v1/public/webhooks/mercadopago` con `.AllowAnonymous()` y rate limit.
- [x] Validar header `x-signature` según la doc de MP (HMAC-SHA256 de `id` + `request-id` + `ts` con el secreto de la app). Rechazar con 401 si no coincide.
- [x] Idempotencia: guardar `payment_id` procesados en `master_payments`; si se repite, responder 200 sin re-procesar.

### 1.2 RBAC en el resto de los módulos
- [x] Definir matriz de roles × acciones (Admin, Contador, Tesorero, Comercial, Compras, Técnico, Lectura) en `docs/RBAC.md`.
- [x] Policies en `Program.cs`: `RequireAdmin`, `RequireFinance` (Admin, Tesorero, Contador), `RequireAccounting` (Admin, Contador), `RequireSales`, `RequirePurchases`.
- [x] Aplicar por grupo: `/api/v1/finance/*` → RequireFinance en escrituras; `/api/v1/accounting/*` → RequireAccounting; `/api/v1/automation/*` → RequireAdmin.
- [x] Frontend: `moduleRegistry.ts` oculta módulos según rol. El backend sigue siendo la última línea.

### 1.3 Enforcement del plan contratado (`AllowedModulesJson`)
- [x] Endpoint filter global que lee `allowed_modules` del JWT y devuelve 403 si la ruta pertenece a un módulo no contratado. Mapa ruta → módulo en un solo lugar.
- [x] `moduleRegistry.ts` lee `user.allowedModulesJson` y oculta lo no contratado.

### 1.4 Limpieza de credenciales y modos dev
- [x] `AuthEndpoints.cs:84-87` — el auto-alta de `admin@lealcontrol.com/admin123` se elimina; reemplazar por script `scripts/seed-dev-admin.sh` que sólo corre a mano.
- [x] `Program.cs:73` — eliminar la constante `retiredJwtFallback` (ya está bloqueada; no tiene por qué seguir en el código).
- [x] `appsettings.json` — connection string sin password; dev usa `appsettings.Development.json` o user-secrets.

### 1.5 Hardening HTTP
- [x] `UseHttpsRedirection` + HSTS en Production. Nginx ya termina TLS, pero la API no debe aceptar HTTP plano si llega.
- [x] Rate limiting global (200 req/min/IP) además del de auth.
- [x] `UseExceptionHandler` con ProblemDetails: hoy no hay manejador global y las excepciones no controladas devuelven stack traces en dev y 500 vacíos en prod.

### 1.6 Unificar validación JWT
- [x] Eliminar los usos de `SimpleJwt.DecodeToken` como camino paralelo de autorización (`SuperAdminEndpoints.cs:52,680`, `AuthEndpoints.cs:181,255`). Todo pasa por `HttpContext.User`.

**Verificado bloque 1 (staging):** ____ / ____ — pendiente deploy + checklist manual

---

## Bloque 2 — Deploy y backups confiables (esfuerzo total: 2 jornadas)

### 2.1 Gate de CI antes del deploy
- [x] `deploy-staging.yml` y `deploy-prod.yml` — trigger `workflow_run` del CI con `conclusion == success` (+ `workflow_dispatch` manual).
- [x] Smoke test post-deploy: `scripts/smoke-health.sh` exige `/health` Healthy con 9 DbContexts.

### 2.2 Health checks completos y usados
- [x] `Program.cs` — `AddDbContextCheck` para Master, Finance, Accounting, HR, Fleet, Metrology (+ CRM, Sales, Communications).
- [x] `docker-compose.staging.yml` / `prod` — healthcheck en `postgres` y `api`, `depends_on: service_healthy` en `api` y `web`.
- [x] Límites de recursos (`mem_limit`, `cpus`) en api, postgres y web.
- [x] `/health/live` (liveness, sin DB) para Docker; `/health` completo (9 DbContexts) para `smoke-health.sh`.

### 2.3 Backups verificados
- [x] `backup-lealcontrol.sh` — si Postgres no responde, `exit 1`.
- [x] Después de cada dump: `gzip -t` + tamaño > 10 KB + contar `COPY`.
- [x] Script `scripts/verify-restore.sh`: base temporal, restaura último dump, cuenta 5 tablas clave.
- [x] `docs/RUNBOOK_RESTORE.md` con procedimiento paso a paso.

### 2.4 Migraciones que fallan detienen el arranque
- [x] `TenantDatabaseBootstrapper.cs` — sin `try/catch` que trague errores de `MigrateAsync` en CRM/Sales/Communications.
- [x] Bypass controlado para bases legacy sin `__ef_migrations_history` pero con tablas existentes (warning + `EnsureTables`).
- [ ] Antes de desplegar: reconciliar `__EFMigrationsHistory` en staging/prod/demo si hay drift (tarea operativa).

### 2.5 Scripts SQL destructivos fuera del repo o con guardas
- [x] `migrate-tenant-id*.sql` movidos a `scripts/one-off/` con README de no re-ejecutar.

### 2.6 Observabilidad mínima
- [x] Serilog sink a archivo rotativo (`/var/log/lealcontrol/api-.log`, 14 días) vía `appsettings.Production.json` + volumen Docker.
- [x] Enricher `TenantIdEnricher` en todos los logs.

**Verificado bloque 2 (staging):** 02/09/2026 — deploy OK, smoke 10/10 @ `89d1c0d`, verify-restore OK @ `f8d109d`.

---

## Bloque 3 — Circuito financiero completo y conciliado

El detalle funcional, las reglas de negocio y los cambios de esquema están en `CIRCUITO_FINANCIERO_ANALISIS_Y_PLAN.md`. Acá sólo el checklist.

### 3.1 Validar en staging lo ya hecho (Fases A+B)
- [x] Script `scripts/verify-finance-phases-ab.sh` (API: available-movements, reconciliation).
- [x] Verify API staging 02/09/2026: 8 OK, 0 FAIL (`verify-finance-phases-ab.sh @ :5210`).
- [ ] Recorrer checklist A-V1…A-V9 y B-V1…B-V7 de `CIRCUITO_DINERO_PROGRESO.md` en v2 (UI manual).
- [x] **F-T1** — Picker de movimiento en recibo/OP (código 03/09/2026): carga por cartera, filtro cuenta opcional, backfill Origin. **Validar en staging.**

### 3.2 Extracto: lote de importación con control de saldo
- [x] Nueva tabla `finance."BankStatementImports"` (cuenta, período, saldo inicial/final declarado, hash del archivo, filas, estado).
- [x] `FinancialMovement.ImportId` y `FinancialMovement.Origin` (`Imported` | `System`).
- [x] Dedup por `(AccountId, fecha, importe, tipo, referencia, hash descripción)` que tolere N movimientos idénticos si el archivo trae N.
- [x] Al confirmar: comparar saldo final declarado vs saldo calculado; si difiere, el lote queda `Unbalanced` y se muestra la diferencia.
- [x] Rechazar importar dos veces el mismo archivo (hash).

### 3.3 Matching movimiento del sistema ↔ movimiento del extracto
- [x] Recibos, OP y transferencias que crean movimientos los marcan `Origin = System`, `PendingBank` en cuentas banco.
- [x] Al importar, se sugiere match `System ↔ Imported` por importe exacto y fecha ± 3 días (`SuggestedMatches` en confirm).
- [x] API `GET/POST /finance/reconciliation` + match/unmatch.
- [x] Pantalla **Finanzas → Conciliación** (`/finanzas/conciliacion`).

### 3.4 Conceptos: atributos de cartera
- [x] `FinancialConcept.UsableIn` (`Receipt`, `PaymentOrder`, `MovementOnly`, `Transfer`), `CounterpartyType` (`Customer`, `Supplier`, `None`), `JournalTemplateCode` (texto libre, opcional; lo interpreta Contabilidad si está activa).
- [x] Los seeds se actualizan: `COMISION` y `GASTO_BANCARIO` = `MovementOnly`; `TRANSFERENCIA_PROPIA` = `Transfer`; etc.
- [x] `available-movements` filtra además por `UsableIn`.

### 3.5 Reglas enriquecidas (Fase C del diseño)
- [x] `FinancialConceptRule`: `CuitPattern`, `AmountMin`, `AmountMax`, `MatchMode = Regex`, `CounterpartyId` sugerido.
- [x] Extraer CUIT de la descripción (`CUIT: 30-…`) y buscar en `crm.customers`/`crm.suppliers`; si hay match único, sugerir concepto según dirección y setear `SuggestedCounterpartyId`.
- [x] Al confirmar a mano un movimiento, botón "Crear regla a partir de este movimiento".
- [x] Confirmación masiva en la bandeja (seleccionar N sugeridos → confirmar).

### 3.6 Anular recibos y órdenes de pago
- [x] `POST /collections/{id}/void` y `POST /payments/{id}/void` con motivo obligatorio. Efectos: movimientos vinculados vuelven a `Available`, cheques vuelven a su estado anterior, imputaciones se borran, `Status = Voided`, y si hay asiento contable se publica evento de reversión.
- [x] Prohibir anular si el período contable está cerrado (consultar por contrato, no por SQL cruzado).
- [x] UI: botón Anular en detalle de recibo/OP con confirmación.

### 3.7 Numeración correlativa y por talonario
- [x] Tabla `finance."DocumentSequences"` (tenant, tipo, prefijo, próximo número). `RC-0001-00000123`, `OP-0001-00000045`. Transacción con `FOR UPDATE`.

### 3.8 Consistencia OP = Recibo
- [x] OP: `Amount` = suma de líneas (hoy no se valida); imputaciones ≤ total; resto = anticipo a proveedor.
- [x] Recibo: resto sin imputar genera **anticipo** explícito (`CustomerAdvance`) visible en cuenta corriente.

### 3.9 Ciclo de vida de cheques recibidos
- [x] Estados: `InPortfolio` → `Deposited` → `Credited`; `InPortfolio` → `Endorsed` (usado en OP); cualquier → `Rejected`; `Cancelled`.
- [x] Al entrar por recibo: `Status = InPortfolio`, `CustomerId`, `CollectionReceiptId`.
- [x] `POST /cheques/{id}/deposit` (cuenta destino, fecha) → crea movimiento `System` crédito con concepto `CHEQUE_DEPOSITADO`, `PendingBank`. Cuando llega el extracto, se matchea (3.3) y pasa a `Credited`.
- [x] `POST /cheques/{id}/reject` (fecha, gastos) → movimiento débito por el importe + gastos, cheque `Rejected`, y se **reabre la deuda del cliente**: la imputación del recibo original se marca `Reversed` y aparece un saldo a cobrar "Cheque rechazado N°…".
- [x] `POST /cheques/{id}/endorse` se hace desde la OP (ya existe parcialmente como `UsedForPayment`; renombrar a `Endorsed`).

### 3.10 Ciclo de vida de cheques emitidos
- [x] Estados: `Issued` → `Presented` → `Debited`; `Issued` → `Cancelled`; `Presented` → `Rejected`.
- [x] Al pagar con cheque propio en OP: se crea el cheque `Issued` con `SupplierId`, `PaymentOrderId`, `BankAccountId`, fecha de pago diferido.
- [x] Al importar extracto y aparecer el débito: sugerir match con cheque emitido por importe + número (`ExternalReference` suele traer el número) → `Debited`.
- [x] Cheques emitidos y no debitados = pasivo "cheques a pagar", visible en cash flow por fecha de pago.

### 3.11 Cartera de cheques (UI)
- [x] Reescribir `ChequePortfolioPage.tsx` (hoy es una línea minificada): tabs Recibidos / Emitidos, filtros por estado y vencimiento, acciones Depositar / Rechazar / Anular, detalle con historial de estados, alerta de vencidos.

### 3.12 Transferencias internas y efectivo
- [x] `POST /transfers` marca ambos movimientos con concepto `TRANSFERENCIA_PROPIA`, `Confirmed`, `Origin = System`, `PendingBank`.
- [x] Cajas (`Cash`) no importan extracto; sus movimientos nacen `Reconciled` directamente. Arqueo: `POST /accounts/{id}/cash-count` con diferencia → concepto `AJUSTE`.

### 3.13 Multimoneda en el circuito
- [x] Importación toma moneda de la cuenta (hoy hardcodea `"ARS"`).
- [x] Recibo en USD imputado a factura en ARS (o viceversa) calcula diferencia de cambio y la deja lista como línea `ExchangeDifference` para Contabilidad.

### 3.14 Cash flow proyectado real
- [x] `CashFlowPage.tsx` suma: saldos, facturas de venta/compra por vencimiento, cheques recibidos en cartera por fecha, cheques emitidos por fecha de pago, OP programadas, sueldos si HR activo. Horizonte configurable. Comparación proyectado vs real por semana.

**Verificado bloque 3:** 02/09/2026 — API Fases A+B OK (smoke 10/10, verify 8/8+1 skip). UI manual y **F-T1** pendientes.

---

### 3.15 (F-T1) — Selector de movimiento bancario en recibo y OP

**Problema:** En recibo/OP el usuario elige la cartera (concepto) pero, cuando hay varios movimientos del extracto con esa clasificación, no puede elegir **cuál** movimiento vincular.

**Alcance:**
- [x] Recibos: al elegir concepto `UsableIn = Receipt`, cargar y mostrar créditos confirmados no conciliados (`GET /collections/available-movements?conceptId=`), cuenta opcional («Todas»).
- [x] OP: idem con débitos y `/payments/available-movements`.
- [x] Recargar lista al cambiar cartera/cuenta; mensaje si lista vacía.
- [x] No listar movimientos `Reconciled` / `MatchedToImport`.
- [x] Backfill `Origin=Imported` para extractos con default System + API acepta `ImportId != null`.

**Archivos:** `CollectionReceiptsWorkspacePage.tsx`, `PaymentOrderFormPage.tsx`, `FinanceImport.cs`, `FinanceSchema.cs`.

**Criterio:** Con 3+ movimientos «Cobro de cliente» confirmados, el desplegable del recibo muestra los N con fecha/importe/descripción. **Validar staging.**

---

## Bloque 4 — Contabilidad real desde asientos modelo

Detalle en `CIRCUITO_FINANCIERO_ANALISIS_Y_PLAN.md`, sección 6.

### 4.1 Contrato de integración entre módulos
- [x] Nuevo proyecto `LealControl.Modules.Accounting.Contracts` con `IAccountingPostingGateway` + `PostableDocument` / líneas / constantes AmountSource.
- [x] Implementación nula `NoOpAccountingPostingGateway` (`TryAdd` en Host) + gateway real al activar módulo Contabilidad.
- [x] Finance referencia sólo Contracts; publica recibo/OP al confirmar y `ReverseAsync` al anular (fallos de Contabilidad no bloquean tesorería).

### 4.2 Bandeja de documentos pendientes de contabilizar
- [x] Tabla `accounting.pending_documents` + entidad EF + EnsureTables.
- [x] Gateway real **encola** ahí (nunca lee `sales.*` / `finance.*` por SQL).
- [x] `GET /batch-post/pending-summary` cuenta esta tabla. `GET /pending-documents` lista Pending/Error.
- [ ] Backfill / replay histórico desde Finance (opcional, más adelante).

### 4.3 Motor de plantillas
- [x] `JournalTemplateEngine.Render(...) → JournalEntry` puro (sin DB), con resolución de `AmountSource` desde el documento (incl. aliases `PaymentAmount`/`Withholdings`) y render de memo.
- [ ] `JournalTemplateLine.AccountSource`: `Fixed` (código), `Role` (`AccountsReceivable`, `AccountsPayable`, `Bank`, `Cash`, `ChecksInHand`, `VatDebit`, …, resueltos desde `AccountingMapping`), `FinancialAccount` (resuelve por `accounting.finance_account_mapping`), `Counterparty` (deudores/proveedores).
- [ ] Nuevos `AmountSource` para tesorería: `BankAmount`, `CashAmount`, `ChequeAmount`, `RetentionAmount`, `ImputedAmount`, `AdvanceAmount`, `ExchangeDifference`, `BankFee`, `MovementAmount`.
- [ ] Validación: el asiento renderizado debe balancear; si no, el documento queda `Error` con el detalle y no se graba.
- [ ] Tests unitarios del motor con 10 casos (factura A, NC, recibo transferencia, recibo con cheque + retención, OP con cheque propio, comisión bancaria, transferencia interna, anticipo, diferencia de cambio, sueldos).

### 4.4 Selección de plantilla
- [x] `JournalTemplateSelector.Select(PostableDocument, templates)` — prioridad: (1) `TemplateHint` (código exacto); (2) `SourceModule` + `DocumentType` exactos; (3) `SourceModule` + `All`. Sin match → warning "sin modelo".
- [x] Variante async `SelectAsync(...)` que carga templates activos desde DB.
- [ ] `JournalTemplate.DocumentType` amplía a `CollectionReceipt`, `PaymentOrder`, `BankMovement`, `ChequeDeposit`, `ChequeReject`, `InternalTransfer`.

### 4.5 Batch-post real
- [x] `POST /batch-post/preview` — `BatchPostProcessor.PreviewAsync`: renderiza pendientes con motor + selector, devuelve asiento por documento, warnings y unmapped.
- [x] `POST /batch-post/execute` — `BatchPostProcessor.ExecuteAsync`: graba asientos, marca `Posted`, crea `AccountingBatchRun`. Valida período cerrado. Errores → `Error` sin bloquear el lote.
- [x] `POST /batch-runs/{id}/revert` — `BatchPostProcessor.RevertAsync`: elimina asientos del lote, devuelve documentos a `Pending`.

### 4.6 Auto-post opcional al confirmar
- [x] Setting por tenant `accounting.auto_post_on_confirm` (bool). Si está activo, el gateway renderiza y graba en el momento; si no, sólo encola para el lote. `GET/PUT /api/v1/accounting/settings`.
- [x] `auto-post/invoice|purchase|receipt` publican vía `IAccountingPostingGateway` (plantillas). Compatibilidad; respuesta marca `obsolete`.

### 4.7 Un solo extracto
- [x] `POST /accounting/bank-statements/upload` y `quick-post` responden 410: el extracto vive en Finanzas. Tablas `BankStatement*` se conservan (sin writes) hasta backup operativo.
- [x] `BankReconciliationPage.tsx` muestra saldo de mayor (caja/banco/cheques/PSP) vía `GET /treasury-reconciliation` y enlaza a `/finanzas/conciliacion`.
- [x] Gastos bancarios: confirmar concepto `COMISION` en Finanzas → documento pendiente → plantilla (no quick-post en Contabilidad).

### 4.8 Mapeo cuenta financiera → cuenta contable
- [x] Tabla `accounting.finance_account_mapping` + `GET/PUT /finance-account-mappings`. UI en Plan de Cuentas.
- [x] Al renderizar tesorería, si el documento trae `FinancialAccountId` y no hay mapeo → Error claro. Si hay mapeo, sustituye las líneas PaymentAmount/Bank/Caja/Cheque.

### 4.9 Revertir al anular
- [x] `ReverseAsync`: pendientes/Error → Skipped. Posted → contra-asiento `EntryType=Reversal` (debe/haber invertidos). Respeta período cerrado. Idempotente si ya hay reversión.

**Verificado bloque 4:** ____ / ____

---

## Bloque 5 — Red de tests del circuito del dinero

- [x] 5.1 Proyecto `tests/LealControl.Modules.Finance.Tests` con Testcontainers: importación (dedup, saldo, hash), reglas (cada `MatchMode`, CUIT, rango), validador de vínculo, anulación, ciclo de cheque recibido y emitido.
- [x] 5.2 Proyecto `tests/LealControl.Modules.Accounting.Tests`: motor de plantillas (los 10 casos de 4.3), selección de plantilla, batch-post real, revert.
- [x] 5.3 Escenario QA `QaFinance001_ExtractToReceiptToLedger`: importar extracto → confirmar → recibo → contabilizar → auditor verifica banco, deudores y partida doble.
- [x] 5.4 Escenario QA `QaFinance002_ChequeReceivedDepositedRejected`.
- [x] 5.5 `ArchitectureTests`: Finance no referencia Accounting.Infrastructure; Accounting.Infrastructure no referencia Finance ni Sales. Sólo `Contracts`.
- [x] 5.6 CI corre los nuevos proyectos y publica cobertura (coverlet ya está en `Directory.Packages.props`).

**Verificado bloque 5:** 03/09/2026 — Finance.Tests 22/22, Accounting.Tests 15/15, Arch 3/3, QA-FIN-001/002 2/2.

---

## Bloque 6 — Deuda técnica que frena la velocidad

- [x] 6.1 Code splitting: `React.lazy` por ruta en `App.tsx`; `import()` dinámico de `exceljs`, `html2pdf.js`, `pdfjs-dist`. Meta: chunk inicial < 800 KB.
- [x] 6.2 Partir `AccountingEndpoints.cs` (2.014 líneas) en `Accounts`, `JournalEntries`, `Reports`, `Templates`, `BatchPosting`, `Periods`. Idem `CommunicationsEndpoints.cs`.
- [x] 6.3 Finance y Accounting con capa `Application` (comandos + handlers) para poder testear sin HTTP. Empezar por recibos y OP.
- [ ] 6.4 Una convención de nombres de tabla por esquema. Decisión: snake_case tablas + PascalCase columnas (como CRM). Migración de renombre para `finance`, `fleet`, `hr` y las tablas PascalCase de `sales`. **Diferido** (no se implementa en este bloque).
- [x] 6.5 Eliminar `catch { }` en `MetrologyEndpoints.cs:93,266`; reemplazar `Console.WriteLine` por `ILogger` en `CrmDbContext`, `MetrologyDbContext`, `GrainsEndpoints`.
- [x] 6.6 Componentes base en `frontend/src/components/ui/`: `Modal` (con `role="dialog"`, foco, Escape), `DataTable`, `FormField`. Migrar primero las 4 pantallas de Finanzas.
- [x] 6.7 Tipar `client.ts` para finanzas y contabilidad (hoy 51 `any`).
- [x] 6.8 Borrar `CollectionReceiptsPage.tsx` (huérfano) y consolidar `Sales/Infrastructure/Migrations` + `Persistence/Migrations` en una sola carpeta.

**Verificado bloque 6:** 03/09/2026 — staging smoke 10/10 Healthy (`:5210` / `:5175`). 6.4 diferido. Chunk inicial `index` ~320 KB. Finance 32, Accounting 15, Arch 10.

---

## Bloque Q — Módulo Calidad ISO/IEC 17025 (paralelo)

Documento canónico (diseño + **punto de reanudación §0** + checklist C3):  
`docs/quality/MODULO_CALIDAD_ANALISIS.md`

Rama de trabajo: `staging/metrology-2307` · Staging: https://v2.lealcontrol.com

### Estado por fase

- [x] **Q.C1** Árbol documental, versiones, upload/approve DT, seed `tools/quality-seed`, PG01-R01/R02 Generated, descarga autenticada
- [ ] **Q.C2** Enlace Metrología completo — **parcial:** snapshot SGC + approve DT + `MetrologyInstrument` (termómetro). Falta PG14-R3/R4, PG09 R2, hoja de vida, Linked IT
- [ ] **Q.C3** Registros de gestión — **parcial (bloque MC01 cerrado):**
  - [x] Hub `/calidad/registros` (menú sin un ítem por registro)
  - [x] MC01-R01 / R02 / R03 / R05
  - [x] PG01-R01 / R02 (desde C1)
  - [x] PG03-R01 Quejas (Structured + SLA)
  - [x] PG07-R1 NC / TNC / Riesgos / OM
  - [ ] **Siguiente:** PG04 Auditorías
  - [ ] PG06 · PG05 · PG08 · PG09-R3 · PG14-R5/R6 + QualityEquipment
- [ ] **Q.C4** Dashboard SGC, auditoría before/after, modo presentación

**Reanudar siempre desde:** `MODULO_CALIDAD_ANALISIS.md` §0.

---

## Registro de avances

| Fecha | Bloque.Tarea | Commit | Verificó | Notas |
|-------|--------------|--------|----------|-------|
| 02/09/2026 | 0.1–0.5 | `fcd60ee` | pendiente staging | Batch-post deshabilitado, backup dinámico, RBAC company, tenant routing, /me seguro |
| 02/09/2026 | 1.1–1.6 | `a364601` | pendiente staging | Webhook MP público, RBAC módulos, allowed_modules, seed-dev-admin, HTTP hardening, JWT unificado |
| 02/09/2026 | 2.3 verify-restore | `f8d109d` | ✅ staging | restore tenant OK; master_tenants en dump catálogo aparte |
| 02/09/2026 | 3.2 | `1f1d8d6` | pendiente staging | BankStatementImports — validar con import Galicia |
| 03/09/2026 | 4.1–4.2 gateway + pending_documents | — | pendiente staging | Contracts + enqueue recibo/OP; summary sin SQL cruzado |
| 03/09/2026 | 3.15 F-T1 picker | — | pendiente staging | Recibo/OP listan movimientos por cartera; backfill Origin |
| 02/09/2026 | 3.1 verify API | `f573eba` | ✅ staging | 8 OK verify-finance-phases-ab; JWT + script Python |
| 02/09/2026 | 3.1 UI A-V8 | `b1e7ea2` | ✅ staging | Movimiento conciliado: badge + no reclasificar |
| 02/09/2026 | Deploy fixes | `cd217c6`–`e2dec51` | ✅ staging | Docker build OK, web+api healthy |
| 02/09/2026 | 3.1, 3.3–3.14 | `fcb1e9b` | ◐ staging | Código completo; UI manual + **F-T1** pendiente |
| 03/09/2026 | 6.1–6.8 (sin 6.4) | `53d1d5a` | ✅ staging | smoke 10/10 Healthy; 6.4 diferido |
| 07/09/2026 | Q.C1 + Q.C2 cortes 1–2 | (rama metrology) | ◐ staging | Árbol calidad + snapshot/DT/termómetro |
| 07/09/2026 | Q.C3 MC01-R01 | `9f5e5f4` | pendiente staging | Confidencialidad interno |
| 07/09/2026 | Q.C3 MC01-R02 | `847b9ee` | pendiente staging | Confidencialidad externo |
| 07/09/2026 | Q.C3 hub + MC01-R03 | `7fd1fba` | pendiente staging | Índice registros + indicadores |
| 07/09/2026 | Q.C3 MC01-R05 | `97b7cec` | pendiente staging | Notas institucionales |
| 07/09/2026 | Q docs/plan | *(docs)* | — | §0 reanudación; siguiente **PG03-R01** |
