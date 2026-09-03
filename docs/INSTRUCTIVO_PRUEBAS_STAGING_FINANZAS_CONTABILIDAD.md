# Instructivo de pruebas — Circuito de dinero y Contabilidad (staging)

**Ambiente:** staging (Leal Control ERP 2.0)  
**Fecha del instructivo:** 03/09/2026  
**Versión de código:** rama `staging/metrology-2307` @ `bc1070d` (smoke health 10/10 OK)  
**Público:** Tesorería / Contabilidad / Admin operativo  

---

## 1. Objetivo

Validar en staging, con datos reales o de prueba controlados, que:

1. El **circuito de extracto → concepto → recibo / orden de pago** funciona en la pantalla (Finanzas).
2. La **contabilización desde asientos modelo** encola documentos, arma asientos balanceados y permite anular con contra-asiento (Contabilidad).

No es una prueba de producción. Todo lo que se genere puede revertirse o quedar marcado como prueba.

---

## 2. Acceso y roles

| Quién | Rol sugerido | Para qué |
|-------|--------------|----------|
| Tesorería | Admin o Tesorero | Extractos, conceptos, recibos, OP, conciliación de extracto |
| Contabilidad | Admin o Contador | Plan de cuentas, mapeo, modelos, lote, libro diario |
| Coordinación | Admin | Ver ambos módulos y cerrar el acta |

**URL de staging:** la que les indique el equipo técnico (web del entorno staging).

**Antes de empezar**
- [ ] Pueden iniciar sesión.
- [ ] Ven el menú **Finanzas** y **Contabilidad** (según rol y módulos contratados).
- [ ] Tienen al menos: 1 cuenta banco, 1 cliente, 1 proveedor, conceptos de cobro/pago activos.

**Cómo reportar un fallo**

Copiar en un mensaje / ticket:

```
Caso: (número o nombre del escenario)
Usuario / rol:
Fecha-hora:
Pasos hechos:
Resultado esperado:
Resultado obtenido:
Captura o texto de error (si aparece):
Nº documento / movimiento / asiento (si hay):
```

---

## 3. Mapa rápido de pantallas

| Área | Ruta en el menú | Qué se prueba |
|------|-----------------|---------------|
| Bancos y cajas | Finanzas → Bancos y cajas | Importar extracto, clasificar movimientos |
| Conceptos | Finanzas → Conceptos y reglas | Carteras / usableIn |
| Recibos | Finanzas → Recibos de cobro | Cobro + elegir movimiento del extracto |
| Órdenes de pago | Finanzas → Órdenes de pago | Pago + elegir movimiento del extracto |
| Conciliación extracto | Finanzas → Conciliación (si aparece en menú) o desde bancos | Match sistema ↔ extracto |
| Plan de cuentas | Contabilidad → Plan de Cuentas | Mapeo cuenta financiera → cuenta contable |
| Asientos modelos | Contabilidad → Asientos Modelos | Plantillas AM-FIN-01 / AM-FIN-02 |
| Tablero contable | Contabilidad → Tablero P&L | Contabilizar lote |
| Libro diario | Contabilidad → Libro Diario | Asientos generados / reversiones |
| Conciliación tesorería | Contabilidad → Conciliación tesorería | Solo saldos de mayor (NO subir extracto) |

---

## Parte A — Tesorería (circuito del dinero)

### A0. Preparación (5–10 min)

1. Ir a **Finanzas → Conceptos y reglas**.
2. Verificar que existan (o crear) conceptos tipo:
   - Cobro de cliente → usable en **Recibo**
   - Pago a proveedor → usable en **Orden de pago**
   - Comisión bancaria → usable solo en **movimiento** (MovementOnly), si ya está sembrado
3. Ir a **Finanzas → Bancos y cajas** y elegir una cuenta banco activa.

**OK si:** ven cuentas y conceptos; pueden abrir la bandeja de movimientos.

---

### A1. Importar / confirmar movimientos del extracto

**Objetivo:** Tener varios créditos confirmados con el mismo concepto de cobro (ideal 3 o más).

1. En la cuenta banco, importar un extracto (CSV/Excel) o usar movimientos ya importados.
2. En la bandeja, clasificar créditos como **Cobro de cliente** (o el concepto equivalente).
3. Confirmar los movimientos clasificados.
4. Intentar reclasificar un movimiento que ya esté **Conciliado**.

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| A1.1 | Tras confirmar, el movimiento queda Confirmado | ☐ | ☐ |
| A1.2 | Los conciliados muestran badge / estado Conciliado | ☐ | ☐ |
| A1.3 | No permite reclasificar un conciliado (mensaje claro, no solo “Error 400”) | ☐ | ☐ |

---

### A2. Recibo de cobro — elegir el movimiento del extracto (F-T1)

**Objetivo:** Si hay varios créditos confirmados con la misma cartera, el recibo debe dejar elegir **cuál**.

1. Ir a **Finanzas → Recibos de cobro** → nuevo recibo.
2. Elegir cliente e imputaciones habituales.
3. En la línea de cobro: método transferencia / banco, concepto de cobro, cuenta (opcional “Todas”).
4. Abrir el desplegable de **movimiento bancario**.

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| A2.1 | Aparecen los N movimientos confirmados (fecha, importe, descripción) | ☐ | ☐ |
| A2.2 | Al cambiar de cartera o cuenta, se recarga la lista | ☐ | ☐ |
| A2.3 | Si no hay movimientos, mensaje claro (lista vacía), no error técnico | ☐ | ☐ |
| A2.4 | Al guardar el recibo, el movimiento elegido queda vinculado / conciliado según diseño | ☐ | ☐ |
| A2.5 | El recibo se guarda aunque Contabilidad falle (tesorería no se bloquea) | ☐ | ☐ |

**Datos útiles para anotar:** Nº de recibo, ID o descripción del movimiento vinculado.

---

### A3. Orden de pago — mismo criterio

1. Nuevo OP a un proveedor.
2. Concepto de pago + cuenta; desplegable de movimientos (débitos confirmados).

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| A3.1 | Lista de débitos disponibles con fecha/importe/descripción | ☐ | ☐ |
| A3.2 | Se puede elegir uno y guardar la OP | ☐ | ☐ |
| A3.3 | Vacío / cambio de cartera se comporta como en el recibo | ☐ | ☐ |

**Anotar:** Nº de OP.

---

### A4. Anular un recibo (tesorería)

1. Abrir un recibo de prueba (preferible uno **aún no** contabilizado, o uno de prueba).
2. Anular con motivo obligatorio (ej. “Prueba staging 03/09”).

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| A4.1 | Pide motivo y confirma | ☐ | ☐ |
| A4.2 | El recibo queda anulado / voided | ☐ | ☐ |
| A4.3 | El movimiento del extracto vuelve a disponible para otro recibo (si aplica) | ☐ | ☐ |

*(Si el recibo ya tenía asiento, Contabilidad debe generar contra-asiento — ver B5.)*

---

## Parte B — Contabilidad (asientos modelo)

### B0. Preparación

1. **Contabilidad → Asientos Modelos**  
   Verificar plantillas activas, por ejemplo:
   - `AM-FIN-01` Recibo de cobranza  
   - `AM-FIN-02` Orden de pago  
2. **Contabilidad → Plan de Cuentas**  
   Al final de la página: panel **Mapeo cuenta financiera → plan contable**.
3. Mapear cada banco/caja/billetera de Finanzas a una cuenta imputable del plan (ej. Banco Galicia C/C → `1.1.01.002`).
4. Guardar mapeo.

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| B0.1 | Se listan las cuentas de Finanzas | ☐ | ☐ |
| B0.2 | Se puede elegir cuenta del plan y guardar | ☐ | ☐ |
| B0.3 | Al recargar la página, el mapeo persiste | ☐ | ☐ |

**Importante:** si falta el mapeo de la cuenta usada en el recibo/OP, el documento puede quedar en **Error** al contabilizar (eso es esperado).

---

### B1. El extracto NO se sube en Contabilidad

1. Ir a **Contabilidad → Conciliación tesorería**.

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| B1.1 | Se ven saldos de mayor (caja/banco/cheques/PSP), no un upload de CSV | ☐ | ☐ |
| B1.2 | Hay enlace o indicación hacia conciliación / extracto en Finanzas | ☐ | ☐ |

---

### B2. Encolado al confirmar recibo / OP

**Condición:** setting de auto-post **apagado** (comportamiento por defecto: solo encola).

1. Crear un recibo de prueba nuevo (Parte A2) con movimiento y concepto mapeados.
2. Ir a **Contabilidad → Tablero P&L**.
3. Revisar el contador de **documentos pendientes** (bloque “Contabilizar lote”).

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| B2.1 | Tras el recibo/OP, sube el pendiente de Finanzas (o total pendientes) | ☐ | ☐ |
| B2.2 | El recibo en Finanzas se guardó igual aunque Contabilidad demore | ☐ | ☐ |

---

### B3. Preview del lote (sin grabar)

1. En el tablero, abrir **Contabilizar lote**.
2. Elegir período que incluya la fecha del recibo/OP de prueba.
3. Incluir módulo **Finance** (o Todos).
4. Ejecutar **Preview / Vista previa**.

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| B3.1 | Aparece el documento con plantilla (ej. AM-FIN-01) | ☐ | ☐ |
| B3.2 | Se ven líneas Debe/Haber con cuentas e importes | ☐ | ☐ |
| B3.3 | Totales Debe ≈ Haber (balanceado) | ☐ | ☐ |
| B3.4 | Si falta plantilla o mapeo: warning / documento “sin modelo” o error claro, no pantalla en blanco | ☐ | ☐ |

**No ejecutar el lote todavía** hasta revisar el preview con el Contador.

---

### B4. Ejecutar el lote

1. Con el preview OK, **Ejecutar / Contabilizar**.
2. Ir a **Contabilidad → Libro Diario**.
3. Buscar el asiento del recibo/OP (concepto con nº de documento).

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| B4.1 | Se genera al menos 1 asiento nuevo | ☐ | ☐ |
| B4.2 | Partida doble: suma Debe = suma Haber | ☐ | ☐ |
| B4.3 | El pendiente del documento pasa a contabilizado (ya no cuenta como Pending) | ☐ | ☐ |
| B4.4 | Queda registro del lote (historial de batch / corrida) | ☐ | ☐ |

**Anotar:** Nº de asiento, Nº de lote si aparece.

---

### B5. Anular documento ya contabilizado (contra-asiento)

1. En Finanzas, anular el recibo (o OP) que ya se contabilizó en B4, con motivo “Prueba reversión staging”.
2. En **Libro Diario**, buscar un asiento de tipo **Reversal / Reversión** referido al original.

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| B5.1 | La anulación en Finanzas termina OK | ☐ | ☐ |
| B5.2 | Aparece contra-asiento (líneas invertidas respecto del original) | ☐ | ☐ |
| B5.3 | No se duplica el contra-asiento si se reintenta / ya estaba revertido | ☐ | ☐ |

**Nota:** si el período contable del mes está **cerrado/bloqueado**, la reversión puede quedar bloqueada con mensaje — anotar el caso.

---

### B6. (Opcional) Revertir un lote completo

Solo si el Contador lo autoriza en staging:

1. Desde el historial de lotes, **Revertir** el batch de prueba.
2. Verificar que los asientos del lote se eliminan / revierten según diseño y los documentos vuelven a pendientes.

| # | Qué debe pasar | OK | No OK |
|---|----------------|----|-------|
| B6.1 | El lote queda marcado como revertido | ☐ | ☐ |
| B6.2 | Los documentos vuelven a poder contabilizarse | ☐ | ☐ |

---

## Parte C — Escenarios de error esperados (también son prueba)

| Caso | Acción | Resultado esperado |
|------|--------|--------------------|
| C1 | Contabilizar recibo **sin** mapeo de la cuenta financiera | Documento en Error con mensaje de falta de mapeo |
| C2 | Concepto sin plantilla y sin modelo genérico | Warning “sin modelo” / queda pendiente |
| C3 | Intentar subir extracto desde Contabilidad (si hubiera botón viejo) | No debe permitir; el extracto es solo en Finanzas |
| C4 | Clasificar movimiento ya conciliado | Bloqueo + mensaje claro |

---

## 4. Acta de cierre (firmar / copiar al chat)

| Área | Responsable | Fecha | Resultado global | Observaciones |
|------|-------------|-------|------------------|---------------|
| Tesorería (Parte A) | | | ☐ OK / ☐ Con fallos / ☐ No probado | |
| Contabilidad (Parte B) | | | ☐ OK / ☐ Con fallos / ☐ No probado | |
| Coordinación | | | ☐ Habilitar producción / ☐ Corregir antes | |

**Bloqueadores que impiden producción**

- [ ] No se puede elegir movimiento en recibo/OP con varios confirmados  
- [ ] El lote genera asientos desbalanceados  
- [ ] Anular un cobro ya asentado no genera contra-asiento (y el período está abierto)  
- [ ] Falta de mapeo no se explica y “rompe” la operación de tesorería  

**No bloqueadores (se pueden corregir después)**

- [ ] Textos / ayudas de UI  
- [ ] Plantillas incompletas para casos raros (anticipo, diferencia de cambio, etc.)  
- [ ] Checklist manual viejo de fases A/B aún pendiente en algún punto menor  

---

## 5. Orden sugerido de una sesión de 60–90 minutos

1. A0 + B0 (preparación conjunta, 15 min)  
2. A1 + A2 + A3 (tesorería, 30 min)  
3. B2 + B3 + B4 (contabilidad, 25 min)  
4. A4 + B5 (anulación / reversión, 15 min)  
5. Completar acta y listar tickets (10 min)  

---

## 6. Contacto técnico

Ante dudas de ambiente (URL, usuarios, roles, smoke health), responder al chat de implementación con el bloque de “Cómo reportar un fallo” de la sección 2.

*Documento interno de QA funcional — no sustituye el plan maestro (`docs/PLAN_MAESTRO_MEJORAS.md`).*
