# LEAL Control ERP 2.0 — Circuito del dinero
## Documento de diseño para revisión (área contable y financiera)

**Versión:** borrador 1.0  
**Fecha:** septiembre 2026  
**Destinatario:** equipo contable / financiero (revisión y OK)  
**Proyecto:** Leal Control ERP v2 — ambiente staging: https://v2.lealcontrol.com

---

## 1. Objetivo de este documento

Definir y validar con el área contable y financiera el **circuito del dinero** en LEAL Control ERP 2.0:

- Qué debe poder hacer un usuario de tesorería **sin** módulo de contabilidad.
- Cómo se **conecta** la contabilidad cuando el cliente la contrata.
- Qué existe hoy en el sistema, qué falta y qué proponemos implementar.

**Pedido de revisión:** leer, corregir, agregar observaciones y marcar OK (o cambios) antes de armar el plan de desarrollo.

---

## 2. Regla de arquitectura (no negociable)

> **Ningún módulo depende de otro; pueden estar conectados.**

| Situación | Comportamiento esperado |
|-----------|-------------------------|
| Cliente **sin** contabilidad | Finanzas funciona al 100%: bancos, extractos, clasificación, recibos, órdenes de pago, cheques, flujo de caja. |
| Cliente **agrega** contabilidad después | El sistema se conecta: toma la información ya generada en Finanzas y permite generar asientos según mapeo configurado. |
| Contabilidad deshabilitada | Ninguna pantalla ni proceso de Finanzas debe fallar ni pedir cuentas contables. |

**Principio de diseño:** Finanzas = operación del dinero (tesorería). Contabilidad = registro formal (plan de cuentas, libros, asientos). La conexión es **opcional y configurable**, no un bloqueo.

---

## 3. Visión del circuito (resumen ejecutivo)

```text
EXTRACTO BANCO  →  MOVIMIENTOS  →  CLASIFICACIÓN (conceptos + reglas)
                                              ↓
                         CONCEPTO = "CARTERA OPERATIVA" (filtro preciso)
                                              ↓
              RECIBO DE COBRO / ORDEN DE PAGO  →  IMPUTACIÓN A FACTURAS
                                              ↓
                    [Si contabilidad activa]  →  ASIENTO (plantilla por concepto)
```

### Ideas centrales acordadas

1. **Importar extracto bancario** (CSV del banco) a una cuenta financiera.
2. **Clasificar movimientos** con **conceptos financieros** y **reglas automáticas** (patrones en descripción, etc.).
3. El **concepto actúa como cartera**: al armar un recibo de cobro, el usuario elige movimientos de ingreso que ya están en la cartera correcta (ej. "Cobro a cliente"), no todos los créditos del banco mezclados.
4. Los **conceptos también sirven para contabilidad**: cada concepto puede mapearse a una **plantilla de asiento**, de modo que cada empresa configure el circuito según su actividad.
5. **Nada al azar:** un movimiento no confirmado no debería usarse en documentos operativos (recibos / OP).

---

## 4. Glosario

| Término | Significado en LEAL Control |
|---------|----------------------------|
| **Cuenta financiera** | Banco, caja, billetera virtual, inversión. No es una cuenta del plan contable. |
| **Movimiento financiero** | Línea del extracto o movimiento manual (ingreso/egreso). |
| **Concepto financiero** | Etiqueta operativa: "Cobro a cliente", "Pago proveedor", "Comisión bancaria", etc. |
| **Regla de concepto** | Patrón automático (ej. descripción contiene "COMISION") → sugiere un concepto. |
| **Cartera (operativa)** | Conjunto de movimientos filtrados por concepto + estado, usados al armar recibos u OP. |
| **Recibo de cobro** | Documento que agrupa formas de cobro e imputa a facturas de venta. |
| **Orden de pago (OP)** | Documento simétrico hacia proveedores / compras. |
| **Plantilla de asiento** | Modelo contable (Debe/Haber) asociado a un tipo de operación. |
| **Conector contable** | Mapeo concepto → plantilla; solo aplica si el módulo contabilidad está activo. |

---

## 5. Flujo detallado propuesto (usuario final)

### 5.1 Tesorería — sin contabilidad

| Paso | Acción del usuario | Sistema |
|------|-------------------|---------|
| 1 | Crea cuenta "Banco Galicia CC" | Alta de cuenta financiera |
| 2 | Importa extracto CSV | Crea movimientos; evita duplicados |
| 3 | Revisa bandeja de clasificación | Reglas sugieren conceptos; usuario confirma o corrige |
| 4 | Movimientos quedan en estado **Confirmado** | Listos para usar en documentos |
| 5 | Arma **recibo de cobro** | Elige cartera "Cobro a cliente" → solo ve movimientos de esa cartera |
| 6 | Imputa a facturas del cliente | Actualiza saldo de facturas (módulo ventas, por referencia) |
| 7 | Consulta flujo de caja / saldos | Reportes de finanzas |

### 5.2 Cuando el cliente contrata contabilidad

| Paso | Acción | Sistema |
|------|--------|---------|
| 1 | Admin mapea conceptos → plantillas de asiento | Configuración única por empresa |
| 2 | Al confirmar recibo u OP (o en lote) | Opción "Generar asiento contable" |
| 3 | Contador revisa en Libro Diario | Asiento generado desde plantilla + datos del documento |
| 4 | Conciliación contable | Lee movimientos ya clasificados en Finanzas (un solo extracto) |

**Importante:** el recibo **nunca** debería bloquearse porque falta un asiento. La contabilización es un paso posterior u opcional automático.

---

## 6. Qué existe hoy en LEAL Control v2 (staging)

### 6.1 Módulo Finanzas — implementado

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Cuentas financieras (banco, caja, etc.) | ✅ | Pantalla Cuentas |
| Import extracto CSV | ✅ | Galicia y formatos genéricos; deduplicación |
| Movimientos financieros | ✅ | Crédito/débito, saldo reportado, referencia externa |
| Conceptos financieros (seed) | ✅ | ~18 conceptos: COBRO_CLIENTE, PAGO_PROVEEDOR, COMISION, etc. |
| Reglas de concepto | ✅ | Contiene / empieza con / termina / exacto; prioridad |
| Sugerencia automática al importar | ✅ | Aplica reglas a movimientos nuevos |
| Bandeja de revisión / confirmación | ✅ | Pantalla Conceptos y reglas |
| Re-aplicar reglas en lote | ✅ | Sobre movimientos no confirmados |
| Recibos de cobro (workspace) | ✅ | Líneas, imputaciones a facturas, cheques |
| Órdenes de pago | ✅ | Estructura similar a recibos |
| Cheques / eCheqs (cartera) | ✅ | Estados y vínculo a recibos |
| Filtro movimientos por concepto en recibo | ⚠️ Parcial | Endpoint existe; no es estricto |
| Finanzas sin contabilidad | ✅ | Módulo independiente en código |

### 6.2 Módulo Contabilidad — implementado (conector parcial)

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Plan de cuentas | ✅ | |
| Libro diario / mayor / balance | ✅ | |
| Plantillas de asiento (seeds) | ✅ | Incluye recibo cobranza y OP |
| Auto-post recibo / factura / compra | ⚠️ | Endpoints existen; no integrados al flujo de cobranzas |
| Import extracto bancario **contable** | ⚠️ | **Separado** del de Finanzas (duplicado) |
| Mapeo concepto financiero → plantilla | ❌ | No existe |

### 6.3 Desacoplamiento técnico

- Schemas PostgreSQL separados: `finance` y `accounting`.
- El módulo Finanzas **no importa** código de Contabilidad.
- La conexión es por lectura opcional y endpoints de auto-post.

---

## 7. Brechas identificadas (qué falta)

### 7.1 Operativas (Finanzas)

| # | Brecha | Impacto |
|---|--------|---------|
| 1 | Movimientos **sin clasificar** aparecen al armar recibos | Confusión; mezcla de conceptos |
| 2 | No se exige concepto **Confirmado** para usar en recibo/OP | "Nada al azar" no se cumple |
| 3 | Concepto elegido en línea de recibo **no se persiste** en backend | Pérdida de trazabilidad |
| 4 | Reglas solo miran **descripción** | Mucha clasificación manual (CUIT, monto, contraparte del CSV no se usan) |
| 5 | OP menos pulida que recibos en UX de carteras | Circuito incompleto para pagos |

### 7.2 De integración (Finanzas ↔ Contabilidad)

| # | Brecha | Impacto |
|---|--------|---------|
| 6 | **Dos importadores de extracto** (Finanzas y Contabilidad) | Usuario importa dos veces; datos desalineados |
| 7 | Sin mapeo **Concepto → Plantilla de asiento** | Contabilidad no se "enchufa" con la clasificación operativa |
| 8 | Auto-post no usa documentos reales en lote | Contabilización manual o fragmentada |
| 9 | Crear recibo no ofrece "Generar asiento" (opcional) | Conector poco visible |

### 7.3 Incidente reciente (contexto migración multi-tenant)

Durante la migración a BD por tenant, algunos datos quedaron con `TenantId` antiguo y no se veían en pantalla. **Se recuperaron** con script SQL. No afecta el diseño del circuito, pero confirma la importancia de pruebas con datos reales antes de producción.

---

## 8. Propuesta de mejora (fases)

### Fase A — Carteras estrictas (Finanzas, sin tocar Contabilidad)

- Solo movimientos con clasificación **Confirmada** aparecen en recibos y OP.
- Selector de **cartera (concepto)** obligatorio al armar documento.
- Validar que el movimiento pertenece a la cartera elegida.
- Persistir concepto en líneas de recibo/OP.

**Resultado:** circuito operativo preciso; usable sin contabilidad.

### Fase B — Reglas enriquecidas

- Reglas por: CUIT/CBU del extracto, rango de monto, tipo crédito/débito, cuenta bancaria.
- Mejor sugerencia automática → menos trabajo en bandeja.

### Fase C — Conector contable

- Campo opcional: `Concepto → Plantilla de asiento`.
- Botón "Contabilizar" en recibo/OP confirmado (o regla automática configurable).
- Sin bloquear operación si contabilidad está off.

### Fase D — Un solo extracto

- Eliminar duplicidad: Contabilidad **lee** movimientos de Finanzas.
- Una sola importación CSV por período/cuenta.

### Fase E — Simetría pagos

- Misma UX de carteras para Órdenes de Pago que para Recibos.

---

## 9. Diagrama del circuito objetivo

```text
                    ┌──────────────────────┐
                    │   EXTRACTO BANCO     │
                    │   (CSV / manual)     │
                    └──────────┬───────────┘
                               ▼
                    ┌──────────────────────┐
                    │  Movimiento financiero │
                    └──────────┬───────────┘
                               ▼
              ┌────────────────────────────────┐
              │  Reglas  →  Sugiere concepto   │
              │  Usuario →  Confirma           │
              └────────────────┬───────────────┘
                               ▼
              ┌────────────────────────────────┐
              │  CARTERA (por concepto)        │
              │  Ej: "Cobro a cliente"       │
              └────────────┬───────────────────┘
                           │
           ┌───────────────┴───────────────┐
           ▼                               ▼
┌─────────────────────┐         ┌─────────────────────┐
│  RECIBO DE COBRO    │         │  ORDEN DE PAGO      │
│  + imputación       │         │  + imputación       │
│    facturas venta   │         │    facturas compra  │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           └───────────────┬───────────────┘
                           ▼
              ┌────────────────────────────────┐
              │  [OPCIONAL] Contabilidad       │
              │  Concepto → Plantilla → Asiento  │
              └────────────────────────────────┘
```

---

## 10. Preguntas para revisión del área contable/financiera

Por favor responder o anotar en este documento:

### Conceptos y carteras

1. ¿Un **concepto** puede pertenecer a más de una "cartera" de uso, o siempre es 1:1?
2. ¿Un **recibo** puede mezclar movimientos de distintos conceptos de ingreso, o un recibo = una cartera?
3. ¿Los **cheques en cartera** son un concepto más o un flujo separado del extracto bancario?

### Clasificación

4. ¿Qué campos del extracto deberían alimentar las reglas automáticas? (descripción, CUIT, CBU, código operación, monto fijo, etc.)
5. ¿Quién debe **confirmar** la clasificación: solo tesorería, o contador también?

### Recibos e imputaciones

6. ¿Siempre se imputa a **facturas**, o hay cobros a cuenta / anticipos sin factura?
7. ¿Cómo manejan **diferencia de cambio** y **retenciones** en el recibo? (el sistema ya tiene campos; validar si alcanza)

### Contabilidad (conector)

8. ¿El asiento se genera **al confirmar** el recibo, al **cerrar el día**, o **manual** por el contador?
9. ¿Cada **concepto** debe tener su plantilla de asiento, o basta una plantilla por tipo de documento (recibo / OP)?
10. ¿Qué pasa si un movimiento se reclasifica después de contabilizado?

### Reportes

11. ¿Qué reportes son imprescindibles en Finanzas sin contabilidad? (flujo de caja, conciliación bancaria operativa, aging, etc.)
12. ¿La conciliación bancaria "oficial" es operativa (Finanzas) o contable (asientos), o ambas deben coincidir?

---

## 11. Hoja de revisión (completar y devolver)

| Revisado por | Fecha | Rol |
|--------------|-------|-----|
| | | |

| Ítem | OK | Cambios solicitados |
|------|----|---------------------|
| Regla módulos independientes | ☐ | |
| Visión circuito extracto → cartera → recibo | ☐ | |
| Concepto como cartera operativa | ☐ | |
| Conector contable opcional | ☐ | |
| Fases A–E propuestas | ☐ | |
| Preguntas sección 10 | ☐ | |

**Comentarios generales:**

```
(espacio para notas)



```

**Prioridad sugerida por el área (ordenar 1, 2, 3…):**

- [ ] Fase A — Carteras estrictas  
- [ ] Fase B — Reglas enriquecidas  
- [ ] Fase C — Conector contable  
- [ ] Fase D — Un solo extracto  
- [ ] Fase E — Simetría OP  

---

## 12. Próximos pasos (después del OK)

1. Incorporar correcciones de este documento.
2. Armar **plan de desarrollo** con estimación por fase.
3. Implementar Fase A en staging y validar con casos reales (extracto Galicia + recibo + imputación).
4. Iterar con el área hasta cerrar el circuito antes de clientes en producción.

---

## 13. Referencia técnica (para el equipo de desarrollo)

| Área | Ubicación en código |
|------|-------------------|
| Finanzas (backend) | `src/Modules/Finance/` |
| Conceptos y reglas | `FinanceConcepts.cs` |
| Import extracto | `FinanceImport.cs` |
| Recibos | `FinanceReceipts.cs` |
| Órdenes de pago | `FinancePayments.cs` |
| Contabilidad | `src/Modules/Accounting/` |
| UI cuentas / import | `frontend/src/pages/FinanceAccountsPage.tsx` |
| UI conceptos | `frontend/src/pages/FinanceConceptsPage.tsx` |
| UI recibos | `frontend/src/pages/CollectionReceiptsWorkspacePage.tsx` |

---

*Documento generado para revisión interna — LEAL Control ERP 2.0*
