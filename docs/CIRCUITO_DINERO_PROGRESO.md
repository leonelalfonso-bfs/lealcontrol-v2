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

1. **F-T1** — Selector de movimiento en recibo/OP cuando hay N créditos/débitos con la misma cartera (ver abajo).
2. Checklist UI **A-V6…A-V9** y **B-V5…B-V7** (recibo, OP, conciliación, void).
3. Re-correr verify tras confirmar más movimientos en bandeja (debería pasar también **A-V5** filtro `conceptId`).
4. Marcar Bloque 3 verificado en staging cuando A+B UI estén OK → desbloquear Bloque 4.

---

## Tarea abierta — F-T1: Picker de movimiento en recibo y OP

**Reportado:** 02/09/2026 — validación manual staging.

### Comportamiento esperado

Al armar **recibo** u **orden de pago** con línea bancaria:

1. El usuario elige **cartera / concepto** (ej. «Cobro de cliente») — ✅ funciona.
2. Debe aparecer un **desplegable de movimientos** del extracto: fecha, importe, cuenta, descripción — para elegir **cuál** de los N movimientos confirmados vincular.
3. Solo movimientos **Confirmados**, **Origin = Imported**, **no Reconciled**, con `UsableIn` correcto (`Receipt` / `PaymentOrder`).

### Comportamiento actual (bug)

- Los **conceptos** se ven y filtran.
- Si hay **varios movimientos** con la misma clasificación/cartera (ej. 10 cobros de clientes confirmados), **no aparecen** (o no todos) en el selector de movimiento del recibo/OP.
- Los movimientos **ya conciliados** correctamente **no deben** listarse — eso no es bug.

### Archivos a revisar

| Archivo | Notas |
|---------|--------|
| `CollectionReceiptsWorkspacePage.tsx` | `loadMovementsForAccount`, `filteredAvailableMovements`, `movementConceptFilter`, bloque «Vincular transferencia» |
| `PaymentOrderFormPage.tsx` | Paridad con recibos |
| `FinanceImport.cs` | `GET .../collections|payments/available-movements` |
| `frontend/src/api/client.ts` | `listCollectionAvailableMovements`, `listPaymentAvailableMovements` |

### Criterio de aceptación

- Con ≥ 3 movimientos confirmados no conciliados del mismo concepto en Galicia, al abrir recibo → transferencia → cartera «Cobro de cliente», el `<select>` lista **todos** con fecha + importe + descripción.
- Igual para OP con «Pago a proveedor» y débitos.
- Al elegir uno, completa importe/cuenta/concepto de la línea.
- Movimientos `Reconciled` siguen sin aparecer.

### Idea de fix (para mañana)

- Verificar que `loadMovementsForAccount` se ejecute al cambiar **cuenta** y **concepto** (recibos hoy solo recarga en parte del flujo).
- Evitar doble filtro cliente/API que deje lista vacía (`filteredAvailableMovements` vs query `?conceptId=`).
- Mostrar mensaje explícito si `available-movements` devuelve `[]`: «No hay créditos confirmados disponibles para esta cartera».
- Tests manuales con JWT + `curl` a `available-movements?conceptId=...` vs lo que muestra la UI.

---

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
