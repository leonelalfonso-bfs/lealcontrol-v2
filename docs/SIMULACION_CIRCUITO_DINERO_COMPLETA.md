# Leal Control ERP 2.0
## Simulación completa del circuito del dinero

**Versión:** borrador para revisión  
**Fecha:** septiembre 2026  
**Complemento de:** `CIRCUITO_DINERO_FINANZAS.md`  
**Objetivo:** mostrar, con datos concretos, cómo quedaría el flujo completo desde el extracto bancario hasta la consolidación operativa (y contable, si aplica).

---

## 1. Cómo leer este documento

Esta simulación usa una empresa ficticia pero realista. En cada paso se muestra:

1. **Qué hace el usuario** (tesorería / cobranzas / contador).
2. **Qué guarda el sistema** (movimiento, concepto, documento).
3. **Cómo queda consolidado** (saldos, estados, trazabilidad).
4. **Qué pasa si NO hay módulo Contabilidad** vs. **si está activo**.

Los montos, fechas y nombres son de ejemplo. Lo importante es la lógica del circuito.

---

## 2. Empresa y configuración inicial

### 2.1 Empresa simulada

| Dato | Valor |
|------|-------|
| Razón social | **Leal Control Metrología S.A.** |
| CUIT | 30-71234567-8 |
| Moneda operativa | ARS |
| Módulo Contabilidad | **Activado** (para mostrar ambos escenarios) |

### 2.2 Cuentas financieras (tesorería)

| ID (ejemplo) | Nombre | Tipo | Moneda | Saldo inicial |
|--------------|--------|------|--------|---------------|
| `acc-galicia` | Banco Galicia CC $ | Banco | ARS | $ 1.250.000,00 |
| `acc-caja` | Caja Oficina | Caja | ARS | $ 45.000,00 |

> **Nota:** estas cuentas son de **Finanzas**, no del plan de cuentas contable.

### 2.3 Conceptos financieros relevantes (carteras)

| Código | Nombre | Dirección | Usable en | Requiere contraparte |
|--------|--------|-----------|-----------|----------------------|
| `COBRO_CLIENTE` | Cobro de cliente | Ingreso | Recibo | Sí (cliente) |
| `PAGO_PROVEEDOR` | Pago a proveedor | Egreso | Orden de pago | Sí (proveedor) |
| `COMISION` | Comisiones financieras | Egreso | Solo movimiento | No |
| `TRANSFERENCIA_PROPIA` | Transferencia entre cuentas propias | Interno | Ningún documento | No |
| `CHEQUE_RECIBIDO` | Cheque / eCheq recibido | Ingreso | Recibo | Sí (cliente) |
| `RETENCION` | Retención practicada | Egreso* | Recibo (línea aparte) | No |

\* En cobranzas, la retención no sale del banco como egreso del cliente: se registra como línea del recibo. El movimiento bancario neto ya refleja el ingreso real.

### 2.4 Reglas automáticas (ejemplo)

| Prioridad | Cuenta | Tipo mov. | Patrón | Concepto sugerido |
|-----------|--------|-----------|--------|-------------------|
| 10 | Galicia | Crédito | `METROLOGIA SA` | COBRO_CLIENTE |
| 10 | Galicia | Crédito | `INDUSTRIAS DEL SUR` | COBRO_CLIENTE |
| 20 | Galicia | Débito | `COMISION` | COMISION |
| 20 | Galicia | Débito | `MANTENIMIENTO CUENTA` | GASTO_BANCARIO |
| 30 | Galicia | Ambos | `TRANSF PROPIA` | TRANSFERENCIA_PROPIA |
| 40 | Galicia | Débito | `PROVEEDOR QUIMICA` | PAGO_PROVEEDOR |

### 2.5 Contrapartes y documentos previos (Ventas / Compras)

**Cliente — Industrias del Sur S.A.** (CUIT 30-55443322-1)

| Factura | Fecha | Total | Saldo pendiente |
|---------|-------|-------|-----------------|
| FA-0001-00001234 | 15/08/2026 | $ 605.000,00 | $ 605.000,00 |

**Proveedor — Química Patagónica S.R.L.** (CUIT 30-99887766-5)

| Factura compra | Fecha | Total | Saldo pendiente |
|----------------|-------|-------|-----------------|
| FC-A-00004567 | 10/08/2026 | $ 363.000,00 | $ 363.000,00 |

---

## 3. Escenario A — Cobranza por transferencia bancaria

### Paso A1 — Importación del extracto (lunes 01/09/2026)

El tesorero descarga el CSV del Banco Galicia y lo importa en **Finanzas → Cuentas → Banco Galicia**.

**Fragmento del extracto importado:**

| Fecha | Descripción | Débito | Crédito | Saldo |
|-------|-------------|--------|---------|-------|
| 01/09 | COMISION MANT CUENTA | 3.500,00 | | 1.246.500,00 |
| 01/09 | TRANSF RECIBIDA INDUSTRIAS DEL SUR | | 605.000,00 | 1.851.500,00 |
| 01/09 | TRANSF PROPIA A CAJA OFICINA | 50.000,00 | | 1.801.500,00 |
| 02/09 | PAGO PROVEEDOR QUIMICA PATAGONICA | 363.000,00 | | 1.438.500,00 |

**Qué crea el sistema (movimientos financieros):**

| Mov. ID | Fecha | Tipo | Monto | Descripción | Estado clasif. | Concepto sugerido |
|---------|-------|------|-------|-------------|----------------|-------------------|
| `mov-001` | 01/09 | Egreso | 3.500 | COMISION MANT CUENTA | Sugerido | COMISION |
| `mov-002` | 01/09 | Ingreso | 605.000 | TRANSF RECIBIDA INDUSTRIAS DEL SUR | Sugerido | COBRO_CLIENTE |
| `mov-003` | 01/09 | Egreso | 50.000 | TRANSF PROPIA A CAJA OFICINA | Sugerido | TRANSFERENCIA_PROPIA |
| `mov-004` | 02/09 | Egreso | 363.000 | PAGO PROVEEDOR QUIMICA PATAGONICA | Sugerido | PAGO_PROVEEDOR |

**Consolidado tras importar (solo Finanzas):**

| Concepto | Estado |
|----------|--------|
| Saldo cuenta Galicia (calculado) | $ 1.438.500,00 |
| Movimientos sin confirmar | 4 |
| Recibos / OP vinculados | 0 |
| Conciliación bancaria operativa | 0 % |

> **Regla propuesta (Fase A):** mientras el movimiento no esté **Confirmado**, no aparece al armar recibos ni órdenes de pago.

---

### Paso A2 — Bandeja de clasificación (revisión humana)

El tesorero entra a **Finanzas → Conceptos → Bandeja de revisión** y confirma las sugerencias.

| Mov. | Acción usuario | Estado final | Concepto confirmado |
|------|----------------|--------------|---------------------|
| `mov-001` | Confirma | **Confirmado** | COMISION |
| `mov-002` | Confirma | **Confirmado** | COBRO_CLIENTE |
| `mov-003` | Confirma | **Confirmado** | TRANSFERENCIA_PROPIA |
| `mov-004` | Confirma | **Confirmado** | PAGO_PROVEEDOR |

**Consolidado tras clasificar:**

| Cartera (concepto) | Movimientos confirmados | Disponibles para documento |
|--------------------|-------------------------|----------------------------|
| COBRO_CLIENTE | 1 (`mov-002`) | Recibo de cobro |
| PAGO_PROVEEDOR | 1 (`mov-004`) | Orden de pago |
| COMISION | 1 (`mov-001`) | Ninguno (solo tesorería) |
| TRANSFERENCIA_PROPIA | 1 (`mov-003`) | Ninguno (movimiento interno) |

**Qué NO debería poder hacer el usuario (diseño objetivo):**

- Armar un recibo eligiendo `mov-001` (es un egreso / comisión).
- Armar un recibo con `mov-002` si no está confirmado.
- Mezclar `mov-002` (cobro) y `mov-004` (pago) en el mismo documento.

---

### Paso A3 — Recibo de cobro (Industrias del Sur)

**Usuario:** área de cobranzas  
**Pantalla:** Finanzas → Recibos de cobro → Nuevo

**Datos del recibo:**

| Campo | Valor |
|-------|-------|
| Cliente | Industrias del Sur S.A. |
| Fecha recibo | 01/09/2026 |
| Cartera elegida | **Cobro de cliente** (`COBRO_CLIENTE`) |
| Cuenta | Banco Galicia CC $ |

**Selector de movimientos (filtrado por cartera):**

Solo muestra:

| ✓ | Mov. | Fecha | Monto | Descripción | Estado |
|---|------|-------|-------|-------------|--------|
| ☑ | `mov-002` | 01/09 | $ 605.000,00 | TRANSF RECIBIDA INDUSTRIAS DEL SUR | Confirmado / Sin conciliar |

No muestra: comisión, transferencia propia, pago a proveedor, ni movimientos de otras carteras.

**Líneas del recibo:**

| Método | Cuenta | Movimiento | Monto |
|--------|--------|------------|-------|
| Transferencia | Galicia | `mov-002` | $ 605.000,00 |

**Imputaciones a facturas:**

| Factura | Total factura | Monto imputado | Saldo factura después |
|---------|---------------|----------------|------------------------|
| FA-0001-00001234 | $ 605.000,00 | $ 605.000,00 | **$ 0,00** |

**Documento generado:**

| Campo | Valor |
|-------|-------|
| Recibo N° | RC-0001-00000089 |
| ID | `rcpt-089` |
| Monto total | $ 605.000,00 |
| Estado | Confirmado |

---

### Paso A4 — Consolidado del movimiento bancario tras el recibo

Estado de `mov-002` después de confirmar el recibo:

| Campo | Valor |
|-------|-------|
| Concepto | COBRO_CLIENTE (confirmado) |
| Clasificación | Confirmado |
| Conciliación | **Conciliado** |
| Vinculado a | Recibo `RC-0001-00000089` |
| Cliente asociado | Industrias del Sur S.A. |
| Factura(s) | FA-0001-00001234 (pagada) |

**Vista consolidada — Banco Galicia (01/09 al 02/09):**

| Fecha | Descripción | Concepto | Documento | Débito | Crédito | Conciliado |
|-------|-------------|----------|-----------|--------|---------|------------|
| 01/09 | COMISION MANT CUENTA | COMISION | — | 3.500 | | No* |
| 01/09 | TRANSF INDUSTRIAS DEL SUR | COBRO_CLIENTE | RC-000089 | | 605.000 | **Sí** |
| 01/09 | TRANSF PROPIA A CAJA | TRANSFERENCIA_PROPIA | Transferencia interna | 50.000 | | Parcial** |
| 02/09 | PAGO QUIMICA PATAGONICA | PAGO_PROVEEDOR | — | 363.000 | | No |

\* La comisión no requiere recibo/OP; queda como gasto bancario identificado.  
\** La transferencia propia debería vincularse con el ingreso en Caja (ver Escenario C).

**Impacto en otros módulos (conexión, no dependencia):**

| Módulo | Qué se actualiza | ¿Obligatorio? |
|--------|------------------|---------------|
| Ventas | Factura FA-00001234 → saldo $ 0 | Sí (por imputación) |
| Finanzas | Movimiento conciliado | Sí |
| Contabilidad | Nada aún | No |

---

### Paso A5 — Orden de pago (Química Patagónica)

**Pantalla:** Finanzas → Órdenes de pago → Nueva

| Campo | Valor |
|-------|-------|
| Proveedor | Química Patagónica S.R.L. |
| Fecha pago | 02/09/2026 |
| Cartera | **Pago a proveedor** (`PAGO_PROVEEDOR`) |
| Cuenta | Banco Galicia CC $ |

**Movimiento disponible en cartera:**

| ✓ | Mov. | Monto | Descripción |
|---|------|-------|-------------|
| ☑ | `mov-004` | $ 363.000,00 | PAGO PROVEEDOR QUIMICA PATAGONICA |

**Imputación:**

| Factura compra | Monto imputado | Saldo después |
|----------------|----------------|---------------|
| FC-A-00004567 | $ 363.000,00 | **$ 0,00** |

**Documento:** OP-0001-00000034 (`pop-034`)

**Estado final de `mov-004`:** Confirmado → Conciliado → vinculado a OP-000034.

---

### Paso A6 — Contabilidad (módulo conectado, opcional en el flujo)

Si el cliente tiene Contabilidad activa y configuró mapeo concepto → plantilla:

| Concepto | Plantilla de asiento | Disparador |
|----------|---------------------|------------|
| COBRO_CLIENTE | `ASIENTO_COBRO_TRANSFERENCIA` | Al confirmar recibo |
| PAGO_PROVEEDOR | `ASIENTO_PAGO_TRANSFERENCIA` | Al confirmar OP |
| COMISION | `ASIENTO_COMISION_BANCARIA` | Manual o al confirmar clasificación |
| TRANSFERENCIA_PROPIA | `ASIENTO_TRANSFERENCIA_INTERNA` | Al vincular ambos movimientos |

#### Asiento por recibo RC-000089 (ejemplo)

| Cuenta contable | Debe | Haber |
|-----------------|------|-------|
| 1.1.03 Banco Galicia | 605.000,00 | |
| 1.1.05 Deudores por ventas | | 605.000,00 |

#### Asiento por OP-000034 (ejemplo)

| Cuenta contable | Debe | Haber |
|-----------------|------|-------|
| 2.1.01 Proveedores | 363.000,00 | |
| 1.1.03 Banco Galicia | | 363.000,00 |

#### Asiento por comisión `mov-001` (ejemplo)

| Cuenta contable | Debe | Haber |
|-----------------|------|-------|
| 5.2.01 Gastos bancarios | 3.500,00 | |
| 1.1.03 Banco Galicia | | 3.500,00 |

**Importante:** el tesorero pudo completar A1–A5 **sin** generar ningún asiento. La contabilización es un paso posterior.

---

## 4. Escenario B — Cobranza con retención y cheque

Muestra un caso más complejo: el cliente paga con transferencia parcial + retención + eCheq.

### Situación

**Cliente:** Metrología Labs S.A.  
**Factura:** FA-0001-00001250 por **$ 1.210.000,00** (saldo pendiente completo).

**Acuerdo de cobro:**

| Concepto | Monto |
|----------|-------|
| Transferencia bancaria | $ 1.000.000,00 |
| Retención Ganancias (cert. 0001-12345678) | $ 36.300,00 |
| eCheq a 30 días | $ 173.700,00 |
| **Total** | **$ 1.210.000,00** |

### Paso B1 — Movimiento en extracto

| Mov. | Tipo | Monto | Descripción | Concepto confirmado |
|------|------|-------|-------------|---------------------|
| `mov-010` | Ingreso | 1.000.000 | TRANSF METROLOGIA LABS SA | COBRO_CLIENTE |

> La retención y el eCheq **no** aparecen como movimientos del extracto en este momento.

### Paso B2 — Recibo con tres líneas

**Recibo RC-0001-00000090**

| Línea | Método | Detalle | Monto |
|-------|--------|---------|-------|
| 1 | Transferencia | `mov-010` en Galicia | $ 1.000.000,00 |
| 2 | Retención | Ganancias — Cert. 0001-12345678 | $ 36.300,00 |
| 3 | eCheq | eCheq N° 00012345, vto. 30/09/2026 | $ 173.700,00 |

**Imputación:**

| Factura | Imputado |
|---------|----------|
| FA-0001-00001250 | $ 1.210.000,00 |

### Consolidado

| Elemento | Estado después del recibo |
|----------|---------------------------|
| `mov-010` | Conciliado con RC-000090 |
| eCheq 00012345 | En cartera — estado: **Recibido** (no depositado) |
| Retención | Registrada en línea de recibo (sin movimiento bancario) |
| Factura FA-00001250 | Saldo $ 0 |

### Paso B3 — Depósito del eCheq (15/09/2026)

Cuando el eCheq se deposita y el banco acredita:

| Mov. | Tipo | Monto | Descripción | Concepto |
|------|------|-------|-------------|----------|
| `mov-011` | Ingreso | 173.700 | ACREDITACION CHEQUE 00012345 | COBRO_CLIENTE o CHEQUE_RECIBIDO* |

\* **Punto a definir con contable:** ¿el ingreso del depósito se vincula al eCheq ya incluido en el recibo, o se trata como segundo paso sin nueva imputación a factura?  
**Propuesta:** vincular `mov-011` al eCheq / recibo existente **sin** volver a imputar factura (solo cierra el circuito del instrumento).

**Estado final del eCheq:** Depositado → Acreditado.

---

## 5. Escenario C — Transferencia interna (Galicia → Caja)

### Movimientos

| Mov. | Cuenta | Tipo | Monto | Concepto |
|------|--------|------|-------|----------|
| `mov-003` | Galicia | Egreso | 50.000 | TRANSFERENCIA_PROPIA |
| `mov-020` | Caja | Ingreso | 50.000 | TRANSFERENCIA_PROPIA |

### Comportamiento esperado

1. Ninguno de los dos aparece en recibos ni OP.
2. El sistema los vincula como **par interno** (`TransferId` compartido).
3. El flujo de caja muestra salida de banco y entrada en caja.
4. Si hay contabilidad: un asiento de transferencia interna (Banco → Caja chica).

**Consolidado de tesorería:**

| Cuenta | Antes | Cambio | Después |
|--------|-------|--------|---------|
| Galicia | 1.851.500 | -50.000 | 1.801.500 |
| Caja | 45.000 | +50.000 | 95.000 |
| **Total empresa** | — | 0 | Sin efecto en patrimonio |

---

## 6. Tablero consolidado final (todos los escenarios)

### 6.1 Saldos financieros

| Cuenta | Saldo final simulado |
|--------|----------------------|
| Banco Galicia | $ 1.438.500,00* |
| Caja Oficina | $ 95.000,00 |

\*Antes de acreditar eCheq del Escenario B.

### 6.2 Movimientos por estado

| Estado | Cantidad | Ejemplo |
|--------|----------|---------|
| Confirmado + Sin conciliar | 2 | Comisión, transferencia propia (si no se emparejó) |
| Confirmado + Conciliado | 3 | Cobro Industrias, Pago Química, Cobro Metrología Labs |
| En cartera (eCheq) | 1 | eCheq 00012345 |

### 6.3 Documentos operativos

| Tipo | Número | Contraparte | Monto | Movimientos vinculados |
|------|--------|-------------|-------|------------------------|
| Recibo | RC-000089 | Industrias del Sur | $ 605.000 | `mov-002` |
| Recibo | RC-000090 | Metrología Labs | $ 1.210.000 | `mov-010` + retención + eCheq |
| Orden de pago | OP-000034 | Química Patagónica | $ 363.000 | `mov-004` |

### 6.4 Facturas saldadas

| Módulo | Documento | Estado |
|--------|-----------|--------|
| Ventas | FA-00001234 | Pagada |
| Ventas | FA-00001250 | Pagada |
| Compras | FC-A-00004567 | Pagada |

### 6.5 Contabilidad (si está activa)

| Origen | Asiento | Estado |
|--------|---------|--------|
| RC-000089 | AS-2026-000451 | Generado |
| OP-000034 | AS-2026-000452 | Generado |
| mov-001 comisión | AS-2026-000453 | Pendiente / manual |
| Transferencia interna | AS-2026-000454 | Al vincular par |

---

## 7. Vista “de punta a punta” (diagrama de trazabilidad)

```text
EXTRACTO CSV
    │
    ├─ mov-002  CRÉDITO 605.000  "INDUSTRIAS DEL SUR"
    │       │ regla → COBRO_CLIENTE (sugerido)
    │       │ usuario confirma
    │       └─► RC-000089 ──imputa──► FA-00001234 (Ventas)
    │               │
    │               └─► [Contabilidad] AS-451 Banco / Deudores
    │
    ├─ mov-004  DÉBITO 363.000  "QUIMICA PATAGONICA"
    │       └─► OP-000034 ──imputa──► FC-A-00004567 (Compras)
    │               └─► [Contabilidad] AS-452 Proveedores / Banco
    │
    ├─ mov-001  DÉBITO 3.500  "COMISION"
    │       └─► (sin recibo/OP) ──► [Contabilidad] AS-453 Gasto bancario
    │
    └─ mov-003  DÉBITO 50.000  "TRANSF PROPIA"
            └─► empareja con mov-020 en Caja (transferencia interna)
```

---

## 8. Qué muestra esta simulación del diseño objetivo

| # | Comportamiento | ¿Se ve en la simulación? |
|---|----------------|--------------------------|
| 1 | Un solo import de extracto en Finanzas | Sí |
| 2 | Concepto como cartera filtrada | Sí (recibo y OP) |
| 3 | Movimiento confirmado antes de usar en documento | Sí (regla propuesta) |
| 4 | Trazabilidad movimiento ↔ documento ↔ factura | Sí |
| 5 | Finanzas funciona sin contabilidad | Sí (pasos A1–A5) |
| 6 | Contabilidad se conecta después | Sí (paso A6) |
| 7 | Retenciones y eCheqs en el mismo recibo | Sí (Escenario B) |
| 8 | Transferencias internas fuera de recibos/OP | Sí (Escenario C) |

---

## 9. Fallos o dudas detectadas en la simulación

Estas son observaciones para discutir con el área contable-financiera **antes** de implementar.

### 9.1 Huecos de diseño

| # | Observación | Pregunta / propuesta |
|---|-------------|----------------------|
| 1 | **eCheq incluido en recibo vs. acreditación bancaria posterior** | Cuando el cheque se deposita, ¿el movimiento del extracto cierra el eCheq sin nueva imputación? **Propuesta:** sí, solo vínculo instrumento ↔ movimiento. |
| 2 | **Retención sin movimiento bancario** | La retención baja la deuda del cliente pero no pasa por banco. **Propuesta:** línea de recibo tipo Retención; asiento contable aparte si aplica. |
| 3 | **Comisiones y gastos bancarios** | No van a recibo/OP. ¿Se contabilizan solos o en lote mensual? | 
| 4 | **Un recibo, una cartera** | En la simulación cada recibo usa una sola cartera de ingreso. ¿Permitimos mezclar COBRO_CLIENTE + CHEQUE_RECIBIDO en el mismo recibo? **Propuesta:** sí, si ambas son carteras de ingreso compatibles. |
| 5 | **Reclasificar después de conciliar** | Si se cambia el concepto de `mov-002` ya vinculado a RC-000089, hay que desconciliar primero. **Propuesta:** bloquear reclasificación si está conciliado. |
| 6 | **Doble import contable** | Hoy Contabilidad puede importar extracto por separado. En el diseño objetivo, solo Finanzas importa. **Acción:** Fase D del plan. |
| 7 | **Anticipo sin factura** | No simulado aquí. Cliente paga $ 100.000 sin factura. **Propuesta:** recibo sin imputación + saldo a favor del cliente. |
| 8 | **Diferencia de cambio** | No simulado (todo ARS). Para USD hace falta tipo de cambio y posible concepto AJUSTE. |

### 9.2 Brechas actuales del sistema (vs. esta simulación)

| # | Qué pide la simulación | Estado actual en v2 |
|---|------------------------|---------------------|
| 1 | Solo movimientos confirmados en selector | Parcial — hay que endurecer |
| 2 | Filtro estricto por cartera en OP | Menos pulido que en recibos |
| 3 | Persistir concepto al vincular en documento | No siempre se guarda |
| 4 | Vincular eCheq acreditado sin re-imputar | A validar en código |
| 5 | Mapeo concepto → plantilla contable | No existe |
| 6 | Un solo extracto para Contabilidad | Duplicado hoy |

---

## 10. Checklist para validación con tu colaboradora

Pedile que recorra la simulación y marque:

| Paso | ¿Refleja la operación real? | ¿OK? | Comentarios |
|------|----------------------------|------|-------------|
| A1 Importar extracto | | ☐ | |
| A2 Confirmar conceptos | | ☐ | |
| A3 Armar recibo con cartera | | ☐ | |
| A4 Ver movimiento conciliado | | ☐ | |
| A5 Armar orden de pago | | ☐ | |
| A6 Asientos contables (si aplica) | | ☐ | |
| B Recibo con retención + eCheq | | ☐ | |
| C Transferencia interna | | ☐ | |
| Sección 9 — dudas detectadas | | ☐ | |

**Preguntas clave para cerrar:**

1. ¿El flujo del eCheq (Escenario B, paso B3) es correcto?
2. ¿Las comisiones se contabilizan al confirmar o en lote?
3. ¿Un recibo puede tener líneas de distintas carteras de ingreso?
4. ¿Falta simular algún caso? (anticipo, ND/NC, pago parcial, multi-factura, etc.)

---

## 11. Próximo paso sugerido

1. Tu colaboradora revisa este documento + `CIRCUITO_DINERO_FINANZAS.md`.
2. Marcan OK o proponen cambios en la sección 9 y el checklist.
3. Con eso cerramos el diseño y arrancamos **Fase A** (carteras estrictas) en staging.
4. Repetimos la misma simulación con datos reales en v2.lealcontrol.com para validar.

---

*Simulación interna — Leal Control ERP 2.0*  
*Complemento del diseño del circuito del dinero*
