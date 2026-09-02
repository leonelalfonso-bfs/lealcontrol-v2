# Leal Control ERP 2.0
## Progreso de implementación — Circuito del dinero

**Última actualización:** 02/09/2026 — Bloque 3 en curso (3.1–3.4 código, validación staging pendiente)
**Diseño aprobado:** `CIRCUITO_DINERO_FINANZAS.md` + `SIMULACION_CIRCUITO_DINERO_COMPLETA.md`

---

## Estado general

| Fase | Descripción | Estado |
|------|-------------|--------|
| **A** | Carteras estrictas (solo confirmados en recibos/OP) | ✅ Código listo — validar UI staging |
| **B** | Persistir concepto en líneas + validación backend | ✅ Código listo — validar UI staging |
| **C** | Reglas enriquecidas (CUIT, monto, etc.) | ☐ Pendiente |
| **D** | Mapeo concepto → plantilla contable | ☐ Pendiente |
| **E** | Un solo extracto (Contabilidad lee Finanzas) | ☐ Pendiente |
| **F** | Paridad OP ↔ Recibos (UX) | ☐ Parcial |

---

## Fase A — Checklist de validación

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| A-V1 | `GET /collections/available-movements` solo devuelve movimientos **Confirmados** | ☐ | | |
| A-V2 | `GET /payments/available-movements` solo devuelve movimientos **Confirmados** | ☐ | | |
| A-V3 | Movimientos sin clasificar **no** aparecen al armar recibo | ☐ | | |
| A-V4 | Movimientos sugeridos (no confirmados) **no** aparecen | ☐ | | |
| A-V5 | Filtro por cartera (conceptId) funciona en API | ☐ | | |
| A-V6 | UI recibos: selector de cartera obligatorio (ingresos) | ☐ | | |
| A-V7 | UI OP: selector de cartera obligatorio (egresos) | ☐ | | |
| A-V8 | No se puede reclasificar movimiento ya conciliado | ☐ | | |
| A-V9 | Backend rechaza movimiento no confirmado al guardar recibo/OP | ☐ | | |

**Estado Fase A:** ☐ No iniciada · ◐ En curso · ☐ Completada en staging

---

## Fase B — Checklist de validación

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| B-V1 | `ConceptId` persistido en `CollectionReceiptLines` | ☐ | | |
| B-V2 | `ConceptId` persistido en `PaymentOrderLines` | ☐ | | |
| B-V3 | Backend valida que movimiento ∈ cartera elegida | ☐ | | |
| B-V4 | Backend valida dirección concepto (ingreso/egreso) | ☐ | | |
| B-V5 | Al vincular movimiento, queda conciliado + trazable | ☐ | | |
| B-V6 | Imputación a facturas sigue funcionando | ☐ | | |
| B-V7 | Cheques / retenciones sin movimiento bancario siguen OK | ☐ | | |

**Estado Fase B:** ☐ No iniciada · ◐ En curso · ☐ Completada en staging

---

## Verificación API (staging)

```bash
export FINANCE_TEST_JWT="<token tras login en v2>"
bash scripts/verify-finance-phases-ab.sh 5210
```

## Prueba manual sugerida (staging)

1. Importar extracto Galicia en **Finanzas → Cuentas**.
2. Confirmar conceptos en **Finanzas → Conceptos → Bandeja**.
3. Armar **recibo** eligiendo cartera "Cobro de cliente" → solo ver créditos confirmados.
4. Vincular movimiento → verificar conciliación en cuenta bancaria.
5. Repetir con **orden de pago** y cartera "Pago a proveedor".
6. Intentar usar movimiento sin confirmar → debe fallar (UI no lo lista + API rechaza).

---

## Archivos modificados (Fase A+B)

| Archivo | Cambio |
|---------|--------|
| `FinanceMovementLinkValidator.cs` | Validación centralizada |
| `FinanceImport.cs` | Filtro confirmados en available-movements |
| `FinanceConcepts.cs` | Bloqueo reclasificación si conciliado |
| `FinanceSchema.cs` | Columna `ConceptId` en líneas |
| `FinanceReceipts.cs` / `FinancePayments.cs` | Validación + persistencia |
| `CollectionReceiptsWorkspacePage.tsx` | Cartera obligatoria + API conceptId |
| `PaymentOrderFormPage.tsx` | Paridad con recibos |

---

## Próximo paso después de A+B

- Deploy a staging y marcar checklists arriba.
- Fase C: reglas por CUIT, monto, contraparte del extracto.
- Ver también: `COMUNICACIONES_PLAN_MEJORA.md` (correo, prioridad 2).
