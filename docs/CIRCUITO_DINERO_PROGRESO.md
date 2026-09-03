# Leal Control ERP 2.0
## Progreso de implementación — Circuito del dinero

**Última actualización:** 02/09/2026 (noche) — Bloque 3 desplegado en staging; API A+B OK; UI manual en curso
**Diseño aprobado:** `CIRCUITO_DINERO_FINANZAS.md` + `SIMULACION_CIRCUITO_DINERO_COMPLETA.md`
**Rama:** `staging/metrology-2307`

---

## Estado general

| Fase | Descripción | Estado |
|------|-------------|--------|
| **A** | Carteras estrictas (solo confirmados en recibos/OP) | ◐ API OK en staging — UI manual pendiente |
| **B** | Persistir concepto en líneas + validación backend | ◐ API OK en staging — UI manual pendiente |
| **C** | Reglas enriquecidas (CUIT, monto, etc.) | ✅ Código en rama — sin validar staging |
| **D** | Mapeo concepto → plantilla contable | ☐ Pendiente |
| **E** | Un solo extracto (Contabilidad lee Finanzas) | ☐ Pendiente |
| **F** | Paridad OP ↔ Recibos (UX) | ◐ Parcial — ver tarea **F-T1** |

---

## Sesión 02/09/2026 — Resumen para retomar mañana

### Hecho hoy

| Área | Resultado |
|------|-----------|
| **Deploy staging** | API + Web build OK (`docker compose -f docker-compose.staging.yml up -d --build`) |
| **Smoke** | 10/10 checks Healthy @ `:5210` |
| **Verify API** | `scripts/verify-finance-phases-ab.sh` → **8 OK, 0 FAIL, 1 SKIP** (SKIP = sin movimientos con `conceptId` para probar filtro) |
| **Fix build Docker** | BuildingBlocks AspNetCore, `TenantPaymentRecord`, TS recibos |
| **Fix verify script** | Validación con Python (sin falsos positivos de `grep`); no reutiliza `/tmp` viejo |
| **Fix UI conciliados** | Bandeja conceptos + cuentas: movimiento `Reconciled` muestra badge y no permite reclasificar (`b1e7ea2`) |
| **Clasificación bandeja** | Varios movimientos confirmados OK; uno falló con 400 → ya estaba **conciliado** (A-V8 esperado) |

### Commits relevantes (orden reciente)

| Commit | Descripción |
|--------|-------------|
| `b1e7ea2` | UI: bloquear reclasificación de movimientos conciliados |
| `f573eba` | Script verify: skip checks si fetch falla |
| `e2dec51` | Fix TS recibos + verify script Python |
| `cd217c6` | Fix build Docker (BuildingBlocks) |
| `fcb1e9b` | Bloque 3 completo (circuito dinero) |

### Pendiente mañana (prioridad)

1. ~~**F-T1** — Selector de movimiento en recibo/OP~~ → **implementado 03/09/2026** (validar staging).
2. Checklist UI **A-V6…A-V9** y **B-V5…B-V7** (recibo, OP, conciliación, void).
3. Re-correr verify tras confirmar más movimientos en bandeja (debería pasar también **A-V5** filtro `conceptId`).
4. Marcar Bloque 3 verificado en staging cuando A+B UI estén OK → desbloquear Bloque 4.

---

## Tarea F-T1: Picker de movimiento en recibo y OP — ✅ código 03/09/2026

**Reportado:** 02/09/2026 — validación manual staging.  
**Fix:** commit pendiente de deploy.

### Causas

1. UI filtraba `available-movements` por la cuenta de la línea → si los créditos estaban en otra cuenta, el desplegable quedaba vacío.
2. Carrera al cargar: primer request sin `conceptId` podía sobrescribir el bueno.
3. Columna `Origin` con default `System` → extractos viejos no cumplían `Origin == Imported`.

### Cambios

- Recibos/OP: carga por **cartera**; filtro de cuenta opcional («Todas las cuentas»); mensaje si lista vacía; al elegir movimiento completa cuenta/importe.
- API: acepta `Origin == Imported || ImportId != null`; excluye `MatchedToImport`.
- Schema: backfill `Origin = Imported` para filas de extracto.

### Criterio de aceptación (staging)

- Con ≥ 3 movimientos confirmados no conciliados del mismo concepto, el `<select>` del recibo/OP lista todos con fecha + importe + descripción.
- Movimientos `Reconciled` siguen sin aparecer.

## Fase A — Checklist de validación

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| A-V1 | `GET /collections/available-movements` solo devuelve movimientos **Confirmados** | ☑ | 02/09/2026 | verify API staging |
| A-V2 | `GET /payments/available-movements` solo devuelve movimientos **Confirmados** | ☑ | 02/09/2026 | verify API staging |
| A-V3 | Movimientos sin clasificar **no** aparecen al armar recibo | ☐ | | UI — depende F-T1 |
| A-V4 | Movimientos sugeridos (no confirmados) **no** aparecen | ☐ | | UI |
| A-V5 | Filtro por cartera (conceptId) funciona en API | ☐ | 02/09/2026 | SKIP en verify (sin movimientos con conceptId en respuesta global) |
| A-V6 | UI recibos: selector de cartera obligatorio (ingresos) | ☐ | | |
| A-V7 | UI OP: selector de cartera obligatorio (egresos) | ☐ | | |
| A-V8 | No se puede reclasificar movimiento ya conciliado | ☑ | 02/09/2026 | API 400 + UI badge «Conciliado» `b1e7ea2` |
| A-V9 | Backend rechaza movimiento no confirmado al guardar recibo/OP | ☐ | | |

**Estado Fase A:** ◐ En curso (API OK; UI parcial)

---

## Fase B — Checklist de validación

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| B-V1 | `ConceptId` persistido en `CollectionReceiptLines` | ☐ | | |
| B-V2 | `ConceptId` persistido en `PaymentOrderLines` | ☐ | | |
| B-V3 | Backend valida que movimiento ∈ cartera elegida | ☐ | | |
| B-V4 | Backend valida dirección concepto (ingreso/egreso) | ☐ | | |
| B-V5 | Al vincular movimiento, queda conciliado + trazable | ☐ | | Bloqueado por F-T1 |
| B-V6 | Imputación a facturas sigue funcionando | ☐ | | |
| B-V7 | Cheques / retenciones sin movimiento bancario siguen OK | ☐ | | |

**Estado Fase B:** ◐ En curso

---

## Verificación API (staging)

```bash
export FINANCE_TEST_JWT="$(curl -s -X POST http://127.0.0.1:5210/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"TU_EMAIL","password":"TU_PASSWORD"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('token',''))")"

bash scripts/verify-finance-phases-ab.sh 5210
# Esperado: OK verify-finance-phases-ab (API)
```

---

## Prueba manual sugerida (staging)

1. Importar extracto Galicia en **Finanzas → Cuentas**.
2. Confirmar conceptos en **Finanzas → Conceptos → Bandeja**.
3. Armar **recibo** → transferencia → cartera «Cobro de cliente» → **elegir movimiento** del listado (F-T1).
4. Guardar → verificar conciliación en cuenta y en **Finanzas → Conciliación**.
5. Repetir con **orden de pago** y «Pago a proveedor».
6. Intentar reclasificar movimiento conciliado → debe bloquearse (UI + API).

---

## Archivos clave (Fase A+B)

| Archivo | Cambio |
|---------|--------|
| `FinanceMovementLinkValidator.cs` | Validación centralizada |
| `FinanceImport.cs` | Filtro confirmados en available-movements |
| `FinanceConcepts.cs` | Bloqueo reclasificación si conciliado |
| `FinanceSchema.cs` | Columna `ConceptId` en líneas |
| `FinanceReceipts.cs` / `FinancePayments.cs` | Validación + persistencia |
| `CollectionReceiptsWorkspacePage.tsx` | Cartera + vínculo movimiento (**F-T1 pendiente**) |
| `PaymentOrderFormPage.tsx` | Paridad con recibos (**F-T1 pendiente**) |
| `scripts/verify-finance-phases-ab.sh` | Verify API Fases A+B |

---

## Próximo paso

1. **Mañana:** F-T1 picker movimientos → completar A-V3…A-V7, B-V5.
2. Marcar Bloque 3 verificado en `PLAN_MAESTRO_MEJORAS.md`.
3. Fase C/D/E según plan maestro; Bloque 4 contabilidad cuando 3.1 staging cierre.
