# Leal Control ERP 2.0  
## Diseño del circuito del dinero (Finanzas + Contabilidad)

**Versión:** borrador para revisión  
**Fecha:** septiembre 2026  
**Destinatario:** área contable y financiera  
**Objetivo:** validar el diseño operativo antes de implementar cambios en el sistema  

---

## 1. Propósito de este documento

Este documento resume cómo debería funcionar el **circuito del dinero** en Leal Control ERP 2.0: desde el extracto bancario hasta la cobranza, el pago a proveedores y (opcionalmente) la contabilización.

Está pensado para que el equipo contable-financiero pueda:

- Revisar si el flujo refleja la operación real de la empresa.
- Señalar errores, omisiones o casos especiales.
- Aprobar el diseño o proponer cambios antes de que el equipo técnico lo implemente.

**Instrucciones para la revisión:** al final hay una sección de preguntas y un espacio para comentarios. Marcá con OK las partes que estén bien y escribí qué cambiarías en las que no.

---

## 2. Regla de arquitectura (acordada)

> **Ningún módulo depende de otro; los módulos pueden estar conectados.**

| Situación | Comportamiento esperado |
|-----------|-------------------------|
| Cliente **sin** módulo Contabilidad | Finanzas funciona al 100%: bancos, extractos, conceptos, recibos, órdenes de pago, cheques, flujo de caja. |
| Cliente **agrega** Contabilidad después | El sistema se conecta: toma la información ya generada en Finanzas y permite generar asientos sin rehacer la operación. |
| Contabilidad desactivada o no contratada | Nada en Finanzas se bloquea ni pide asientos. |

**En resumen:** Finanzas es el núcleo operativo del dinero. Contabilidad es un **conector opcional**, no un requisito.

---

## 3. Visión del circuito (cómo debería sentirse para el usuario)

### 3.1 Flujo general

```
  EXTRACTO BANCARIO (CSV del banco)
           │
           ▼
  MOVIMIENTOS en la cuenta (ingresos y egresos)
           │
           ▼
  REGLAS automáticas + revisión humana
           │
           ▼
  CONCEPTO confirmado (ej.: "Cobro a cliente", "Comisión bancaria")
           │
           ├──────────────────────────────────────┐
           ▼                                      ▼
  RECIBO DE COBRO                         ORDEN DE PAGO
  (elige movimientos de                    (elige movimientos de
   cartera de INGRESOS)                     cartera de EGRESOS)
           │                                      │
           ▼                                      ▼
  Imputación a facturas de venta          Imputación a facturas de compra
           │                                      │
           └──────────────┬───────────────────────┘
                          ▼
            (Opcional) CONTABILIDAD: asiento según plantilla
                          configurada por concepto / documento
```

### 3.2 Idea central: el **Concepto** como **cartera operativa**

Un **concepto financiero** no es una cuenta contable. Es una **etiqueta operativa** que agrupa movimientos del mismo tipo y permite trabajar con precisión:

- **Cartera "Cobro a cliente"** → al armar un recibo, solo aparecen ingresos ya clasificados así.
- **Cartera "Pago a proveedor"** → al armar una orden de pago, solo aparecen egresos de ese tipo.
- **Cartera "Comisión bancaria"** → movimientos que luego (si hay contabilidad) van a una plantilla de gasto bancario.

**Beneficio:** el usuario no elige entre cientos de movimientos del extracto, sino entre los que ya fueron identificados para ese tipo de operación.

### 3.3 Relación con la contabilidad (cuando el cliente la contrata)

Cada concepto (o cada tipo de documento) puede tener asociada una **plantilla de asiento**. Así cada empresa configura el mapeo según su actividad y su plan de cuentas, sin que el sistema imponga un único criterio.

- Finanzas **no necesita** saber si existe contabilidad.
- Contabilidad **lee** lo ya confirmado en Finanzas y propone/genera el asiento.

---

## 4. Qué hay hoy en Leal Control v2 (staging)

Estado al **septiembre 2026**, según revisión del sistema en pruebas (v2.lealcontrol.com).

### 4.1 Módulo Finanzas — implementado

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Cuentas bancarias y cajas | ✅ Operativo | Tipos: banco, caja, billetera, inversión |
| Importación de extracto CSV | ✅ Operativo | Galicia y formatos similares; evita duplicados |
| Movimientos bancarios | ✅ Operativo | Ingresos (crédito) y egresos (débito) |
| Conceptos financieros | ✅ Operativo | Ej.: Cobro cliente, Pago proveedor, Comisión, Sueldos… |
| Reglas de clasificación | ✅ Operativo | Por texto en descripción; prioridad configurable |
| Bandeja de revisión | ✅ Operativo | Sugerido → confirmado por usuario |
| Recibos de cobro | ✅ Operativo | Líneas de cobro + imputación a facturas |
| Órdenes de pago | ✅ Operativo | Simétrico a cobranzas |
| Cheques / eCheqs | ✅ Operativo | Cartera de cheques recibidos |
| Filtro por concepto al elegir movimiento en recibo | ⚠️ Parcial | Existe filtro, pero no es estricto |
| Finanzas sin contabilidad | ✅ Cumple la regla | No exige asientos |

### 4.2 Módulo Contabilidad — implementado (opcional)

| Funcionalidad | Estado | Notas |
|---------------|--------|-------|
| Plan de cuentas | ✅ Operativo | |
| Libro diario, mayor, sumas y saldos | ✅ Operativo | |
| Plantillas de asiento (modelos) | ✅ Operativo | Incluye modelos para recibo y orden de pago |
| Auto-asiento de recibo / compra / venta | ⚠️ Manual | Endpoint existe; no está integrado al flujo diario de cobranzas |
| Conciliación bancaria contable | ⚠️ Separada | Importa extracto **otra vez** en módulo Contabilidad |
| Mapeo concepto financiero → plantilla | ❌ No existe | Las plantillas se eligen por tipo de documento, no por concepto |

### 4.3 Conceptos seed incluidos hoy (ejemplos)

| Código | Nombre | Uso típico |
|--------|--------|------------|
| COBRO_CLIENTE | Cobro a cliente | Ingresos por cobranzas |
| PAGO_PROVEEDOR | Pago a proveedor | Egresos por pagos |
| COMISION | Comisión bancaria | Gastos del banco |
| GASTO_BANCARIO | Gasto bancario | Débitos varios del banco |
| TRANSFERENCIA_INTERNA | Transferencia entre cuentas | Movimientos internos |
| SUELDOS | Sueldos y cargas | Pagos de nómina |
| RETENCION | Retención practicada | Retenciones en cobros/pagos |
| AJUSTE | Ajuste / diferencia de cambio | Ajustes ARS/USD |
| *(y otros)* | | Ver pantalla Conceptos en Finanzas |

---

## 5. Brechas respecto a la visión acordada

| # | Brecha | Impacto en el día a día | Prioridad sugerida |
|---|--------|-------------------------|-------------------|
| 1 | Movimientos **sin clasificar** pueden usarse en recibos/OP | Riesgo de imputar un movimiento incorrecto | **Alta** |
| 2 | El concepto elegido en el recibo **no siempre se guarda** en el movimiento | Pérdida de trazabilidad | **Alta** |
| 3 | **Dos importaciones** de extracto (Finanzas y Contabilidad) | Doble trabajo y posible desvío entre tesorería y contabilidad | **Alta** |
| 4 | Reglas solo miran **texto** de la descripción | Mucha clasificación manual (CUIT, contraparte, monto no se usan) | Media |
| 5 | No hay **mapeo concepto → plantilla contable** | La contabilidad no sigue la lógica operativa de Finanzas | Media |
| 6 | Auto-contabilización **no está en el flujo** de confirmar recibo/OP | El contador debe ir a otro lado del sistema | Media |
| 7 | Órdenes de pago con menos refinamiento que recibos en filtro por concepto | Asimetría cobranzas vs pagos | Media-Baja |

---

## 6. Propuesta de diseño (para aprobación)

### 6.1 Principios de uso

1. **Nada al azar:** un movimiento solo entra en un recibo u OP si tiene concepto **confirmado** y pertenece a la cartera correcta (ingreso/egreso).
2. **Un solo extracto:** se importa una vez en Finanzas; Contabilidad consume esos movimientos (no vuelve a subir el CSV).
3. **Concepto = cartera:** cada concepto define para qué documentos sirve (recibo, OP, solo tesorería).
4. **Contabilidad enchufable:** al activar el módulo, se configuran plantillas por concepto; no se obliga al usuario de tesorería.

### 6.2 Atributos sugeridos de un concepto (ampliación)

| Atributo | Descripción | Ejemplo |
|----------|-------------|---------|
| Dirección | Ingreso / Egreso / Interno / Ambos | Cobro cliente = Ingreso |
| Usable en | Recibo / Orden de pago / Solo movimiento | Comisión = Solo movimiento |
| Requiere contraparte | Cliente o proveedor obligatorio | Cobro cliente = Sí |
| Estado mínimo del movimiento | Solo "Confirmado" para documentos | Evita usar sugeridos sin revisar |
| Plantilla contable (opcional) | Solo si módulo Contabilidad activo | COBRO_CLIENTE → plantilla caja vs deudores |

### 6.3 Flujo detallado: cobranza (ejemplo)

1. **Lunes:** se importa extracto del banco Galicia.
2. **Sistema** sugiere conceptos según reglas (ej. descripción contiene nombre de cliente).
3. **Tesorero** revisa bandeja y confirma: este crédito = "Cobro a cliente".
4. **Cobranzas** arma recibo para Cliente X:
   - Elige cuenta banco.
   - Elige cartera **"Cobro a cliente"**.
   - Ve **solo** los créditos confirmados de esa cartera, no conciliados.
   - Selecciona el movimiento del extracto.
   - Imputa a facturas pendientes del cliente.
5. **Si hay Contabilidad:** al confirmar, opción "Generar asiento" con plantilla del concepto.

### 6.4 Flujo detallado: pago a proveedor (simétrico)

Misma lógica con cartera **"Pago a proveedor"**, movimientos de **egreso**, imputación a facturas de compra.

### 6.5 Cheques y eCheqs

Propuesta: integrados al mismo circuito. Un cheque recibido puede:
- Vincularse a un movimiento de cartera "Cobro a cliente", o
- Tener cartera propia "Cheque en cartera" hasta su depósito.

*(Pendiente definición con área financiera — ver preguntas al final.)*

---

## 7. Plan de implementación sugerido (técnico)

Sujeto al OK de este documento. Las fases pueden reordenarse según feedback.

| Fase | Entregable | Dependencia contable |
|------|------------|----------------------|
| **A** | Solo movimientos **confirmados** y de cartera correcta en recibos/OP | No |
| **B** | Guardar y validar concepto al vincular movimiento en documentos | No |
| **C** | Reglas enriquecidas (CUIT, monto, contraparte del extracto) | No |
| **D** | Mapeo concepto → plantilla de asiento + botón "Contabilizar" | Sí (módulo activo) |
| **E** | Unificar extracto: Contabilidad lee movimientos de Finanzas | Sí (módulo activo) |
| **F** | Paridad total OP vs Recibos en UX de carteras | No |

**Recomendación:** implementar **A + B** primero; con eso el circuito operativo queda sólido sin tocar Contabilidad.

---

## 8. Preguntas para revisión del área contable-financiera

Por favor respondan cada ítem (OK / cambiar / no aplica + comentario).

### 8.1 Conceptos y carteras

| # | Pregunta | Respuesta / comentario |
|---|----------|------------------------|
| 1 | ¿La lista de conceptos seed cubre la operación habitual (cobros, pagos, comisiones, sueldos, retenciones, transferencias)? ¿Falta alguno? | |
| 2 | ¿Un mismo concepto puede usarse en recibo **y** en orden de pago, o siempre es exclusivo ingreso/egreso? | |
| 3 | ¿Un recibo puede mezclar movimientos de **varias** carteras de ingreso, o siempre una cartera por recibo? | |

### 8.2 Extracto y clasificación

| # | Pregunta | Respuesta / comentario |
|---|----------|------------------------|
| 4 | ¿Quién debe confirmar la clasificación: tesorería, contador, o ambos según monto? | |
| 5 | ¿Qué datos del extracto deberían disparar reglas automáticas además del texto? (CUIT, CBU, monto fijo, etc.) | |
| 6 | ¿Están de acuerdo en **un solo import** de extracto (Finanzas) y que Contabilidad use los mismos movimientos? | |

### 8.3 Cobranzas y pagos

| # | Pregunta | Respuesta / comentario |
|---|----------|------------------------|
| 7 | ¿Siempre se imputa el recibo a facturas, o a veces es "anticipo" sin imputación? | |
| 8 | ¿Cómo deben tratarse cheques diferidos vs transferencia ya en extracto? | |
| 9 | ¿Retenciones van en la misma línea del recibo o como concepto/movimiento aparte? | |

### 8.4 Contabilidad (si aplica)

| # | Pregunta | Respuesta / comentario |
|---|----------|------------------------|
| 10 | ¿El asiento debe generarse **automático** al confirmar recibo/OP, o siempre con revisión del contador? | |
| 11 | ¿Prefieren mapeo **por concepto** (cada concepto → plantilla) o **por tipo de documento** (todo recibo → una plantilla)? | |
| 12 | ¿Qué pasa si el plan de cuentas cambia: se actualizan plantillas o se congelan por período? | |

### 8.5 Casos especiales

| # | Pregunta | Respuesta / comentario |
|---|----------|------------------------|
| 13 | Diferencia de cambio ARS/USD en cobros: ¿concepto "Ajuste" separado o parte del recibo? | |
| 14 | Movimientos internos entre cuentas propias: ¿excluidos de recibos/OP? | |
| 15 | ¿Otros casos que hoy no estén contemplados? | |

---

## 9. Aprobación y próximos pasos

| Rol | Nombre | Fecha | OK / Observaciones |
|-----|--------|-------|-------------------|
| Dirección / producto | | | |
| Área contable-financiera | | | |
| Desarrollo | Leonel | | Borrador técnico |

**Próximos pasos tras la revisión:**

1. Incorporar cambios sugeridos por contable/finanzas.
2. Cerrar versión 1.0 del diseño.
3. Implementar Fase A + B en staging.
4. Prueba conjunta con datos reales (sin clientes en producción).
5. Documentar manual de usuario del circuito.

---

## 10. Glosario breve

| Término | Significado en Leal Control |
|---------|----------------------------|
| **Movimiento** | Línea del extracto bancario (ingreso o egreso) en una cuenta |
| **Concepto** | Clasificación operativa del movimiento (cartera) |
| **Regla** | Criterio automático para sugerir un concepto |
| **Recibo de cobro** | Documento que agrupa cobros e imputa a facturas de venta |
| **Orden de pago** | Documento que agrupa pagos e imputa a facturas de compra |
| **Imputación** | Asignación de un monto cobrado/pagado a una factura específica |
| **Plantilla de asiento** | Modelo contable (debe/haber) para generar asientos |
| **Conciliación** | Vincular movimiento bancario con documento (recibo/OP) o asiento |

---

*Documento generado para revisión interna — Leal Control ERP 2.0*  
*Contacto técnico: equipo de desarrollo / Leonel*
