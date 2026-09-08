# Instructivo de pruebas — Staging Leal Control ERP 2.0

**Ambiente:** staging (no es producción; todo lo generado puede anularse)  
**Fecha:** 03/09/2026  
**Rama:** `staging/metrology-2307` @ `53d1d5a`  
**Último smoke:** 10/10 Healthy — API `:5210` / web `:5175`  
**Fuente de alcance:** `docs/PLAN_MAESTRO_MEJORAS.md` (bloques 0 a 6)

---

## Cómo usar este documento

Cada bloque del plan maestro tiene pruebas. No hace falta que **toda** la empresa haga **todo**.

| Quién | Qué cubre |
|-------|-----------|
| **Coordinación / Admin** | Acceso, roles, acta de cierre |
| **Tesorería** | Parte **T** (circuito del dinero, bloques 3 y 3.15) |
| **Contabilidad** | Parte **C** (asientos modelo, bloque 4) y lo que toca de lote (0.1 actualizado) |
| **Admin tenant** | Usuarios, settings, backup SuperAdmin (bloques 0 y 1) |
| **Equipo técnico** | Health, backups, seguridad HTTP, tests automáticos (bloques 1, 2, 5, 6) |

Marcar cada fila: **OK** / **No OK** / **N/A**. Un **No OK** no se “salva” con un comentario: se reporta con el bloque de fallo.

**Cómo reportar un fallo**

```
Caso: (código, ej. T2.1 o C4.2)
Usuario / rol:
Fecha-hora:
Pasos:
Esperado:
Obtenido:
Error / captura:
Nº documento / movimiento / asiento:
```

**URL de staging:** la que indique el equipo técnico (web del entorno staging).

---

## 1. Objetivo

Confirmar en staging que:

1. No se corrompen datos ni se inventan asientos (bloque 0, actualizado por el 4).
2. Roles y módulos contratados recortan lo que no corresponde (bloque 1).
3. El ambiente está vivo (bloque 2 — ya verificado técnicamente; se reconfirma smoke).
4. El circuito **extracto → concepto → recibo/OP → conciliación → cheques** funciona en pantalla (bloque 3).
5. Contabilidad **encola, preview, contabiliza y revierte** documentos reales (bloque 4).
6. La app carga bien después del code-split (bloque 6).

Los tests automáticos del bloque 5 **no** los corre Tesorería/Contabilidad; el técnico los confirma.

---

## 2. Acceso, roles y datos mínimos

| Quién | Rol sugerido | Módulos |
|-------|----------------|---------|
| Tesorería | Tesorero o Admin | Finanzas |
| Contabilidad | Contador o Admin | Contabilidad + Finanzas (lectura) |
| Comercial (prueba negativa) | Comercial | Ventas/CRM — **sin** borrar usuarios ni escribir Finanzas |
| Coordinación | Admin | Ambos |

**Antes de cualquier sesión**

- [ ] Pueden iniciar sesión.
- [ ] Ven **Finanzas** y/o **Contabilidad** según rol y plan contratado.
- [ ] Hay: 1 banco, 1 caja (si se prueba efectivo), 1 cliente, 1 proveedor, 1 factura de venta abierta, 1 factura de compra abierta (o se crean en la sesión).
- [ ] Conceptos activos: cobro de cliente (Recibo), pago a proveedor (OP), comisión (solo movimiento), transferencia propia.

### Mapa de pantallas

| Menú | Para qué |
|------|----------|
| Finanzas → Bancos y cajas | Extracto, clasificar, transferencias, arqueo |
| Finanzas → Conceptos y reglas | Carteras, reglas, bandeja |
| Finanzas → Recibos de cobro | Cobro + picker de movimiento |
| Finanzas → Órdenes de pago | Pago + picker de movimiento |
| Finanzas → Conciliación | Match extracto ↔ sistema |
| Finanzas → Cartera de cheques | Depositar / rechazar / anular |
| Finanzas → Cash flow | Proyección |
| Empresa → Usuarios / Ajustes | Solo Admin |
| Contabilidad → Plan de cuentas | Mapeo banco → cuenta contable |
| Contabilidad → Asientos modelos | AM-FIN-01 / AM-FIN-02 |
| Contabilidad → Tablero P&L | Contabilizar lote |
| Contabilidad → Libro diario | Asientos y reversiones |
| Contabilidad → Conciliación tesorería | Saldos de mayor (**no** CSV) |

---

## 3. Orden sugerido (no hace falta un solo día)

| Sesión | Duración | Quién | Bloques |
|--------|----------|-------|---------|
| S1 — Ambiente y seguridad | 30–40 min | Admin + técnico | 0.3–0.5, 1.2–1.3, 2 (smoke) |
| S2 — Tesorería | 60–90 min | Tesorería | 3 + 3.15 |
| S3 — Contabilidad | 45–60 min | Contador | 4 (+ 0.1 actualizado) |
| S4 — Cheques, caja, cash flow | 40 min | Tesorería | 3.9–3.14 |
| S5 — Cierre | 15 min | Coordinación | Acta |

---

# Parte 0 — Integridad de datos (bloque 0)

### 0.1 Lote contable: ya no inventa datos (y el lote real del bloque 4 sí existe)

**Contexto:** al inicio se desactivó un lote que **inventaba** facturas. El bloque 4 **reactivó** el lote, pero contra documentos **encolados de verdad**.

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 0.1.1 | Contabilidad → Tablero → Contabilizar lote → Preview de un período **sin** documentos de prueba | No debe aparecer factura inventada tipo “A-0001-00001245 / Agroservicios del Litoral” | ☐ | ☐ |
| 0.1.2 | Contador de pendientes | Números reales (pueden ser 0), no 5/3/4 fijos de mentira | ☐ | ☐ |
| 0.1.3 | Si hay pendientes reales (después de Parte C) | Preview muestra esos documentos; Execute genera asientos **balanceados** | ☐ | ☐ |

### 0.2 Backup interno (Admin / SuperAdmin)

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 0.2.1 | SuperAdmin: descargar backup del tenant de prueba | El dump incluye tablas de finanzas (p. ej. `FinancialAccounts` / `FinancialMovements`) | ☐ | ☐ |
| 0.2.2 | Encabezado del dump | Menciona tablas exportadas / fallidas | ☐ | ☐ |

*(Si no hay acceso SuperAdmin en la sesión, marcar N/A y lo hace el técnico.)*

### 0.3 Rol en configuración de empresa

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 0.3.1 | Entrar como **Comercial** | Ve listado de usuarios (si el menú lo muestra) | ☐ | ☐ |
| 0.3.2 | Intentar borrar un usuario o guardar settings de empresa | “Permisos insuficientes” / 403 — **no** borra | ☐ | ☐ |
| 0.3.3 | Como **Admin** | Sí puede crear/editar usuarios y settings | ☐ | ☐ |

### 0.4 Tenant inválido / suspendido

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 0.4.1 | Técnico: JWT con `tenant_id` inventado contra cualquier API | 403 JSON claro | ☐ | ☐ |
| 0.4.2 | (Si hay tenant Suspended de prueba) | No opera el sistema | ☐ | ☐ |

### 0.5 Sesión huérfana

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 0.5.1 | Admin borra (o desactiva) un usuario que tiene otra pestaña abierta | Esa pestaña vuelve a login (no “se hace pasar” por otro usuario) | ☐ | ☐ |

---

# Parte 1 — Seguridad y visibilidad (bloque 1)

*El webhook de MercadoPago (1.1) y el hardening HTTP (1.5) los cubre el técnico; no hace falta en la sesión de tesorería.*

### 1.2 / 1.3 Menú y módulos según rol y plan

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 1.2.1 | Comercial | No escribe Finanzas/Contabilidad (menú oculto o 403 al forzar URL) | ☐ | ☐ |
| 1.2.2 | Tesorero | Opera Finanzas; no debería contabilizar lote (Contabilidad) | ☐ | ☐ |
| 1.2.3 | Contador | Opera Contabilidad; puede leer/usar Finanzas según política | ☐ | ☐ |
| 1.3.1 | Usuario **sin** módulo Contabilidad en el plan | No ve Contabilidad; API 403 si fuerza `/api/v1/accounting` | ☐ | ☐ |

### 1.4 Login de emergencia

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 1.4.1 | No existe alta automática `admin@lealcontrol.com` / `admin123` en staging | Hay que usar usuarios sembrados a mano | ☐ | ☐ |

---

# Parte 2 — Ambiente (bloque 2)

**Estado técnico 03/09/2026:** smoke 10/10 Healthy. Reconfirmar si hubo rebuild.

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 2.1 | Abrir la web de staging | Carga login / app | ☐ | ☐ |
| 2.2 | Técnico: `GET /health` API | 10 checks Healthy | ☐ | ☐ |
| 2.3 | Técnico: backup + `verify-restore` (cuando toque) | Restore de tenant OK | ☐ | ☐ |

---

# Parte T — Tesorería / circuito del dinero (bloque 3)

## T0. Preparación (5–10 min)

1. **Finanzas → Conceptos y reglas:** cobro (Recibo), pago (OP), comisión (solo movimiento), transferencia propia.
2. **Finanzas → Bancos y cajas:** cuenta banco activa.
3. Tener CSV de extracto de prueba (Galicia / Santander / Macro o archivo de laboratorio).

**OK si:** se ven cuentas, conceptos y la bandeja de movimientos.

---

## T1. Importar extracto (3.2)

**Objetivo:** lote de importación con control de saldo y sin duplicar el mismo archivo.

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| T1.1 | Importar CSV en la cuenta banco y confirmar | Movimientos en bandeja | ☐ | ☐ |
| T1.2 | Si el archivo declara saldo final | Si no cierra, el lote queda desbalanceado y se ve la diferencia | ☐ | ☐ |
| T1.3 | Volver a importar **el mismo** archivo | Rechazo por duplicado (hash) | ☐ | ☐ |
| T1.4 | Filas idénticas repetidas en el CSV | Si el archivo trae N iguales, se importan N (no se “come” duplicados reales del banco) | ☐ | ☐ |

---

## T2. Clasificar y confirmar (3.4, 3.5, A-V8)

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| T2.1 | Clasificar créditos como cobro de cliente y confirmar | Estado Confirmado | ☐ | ☐ |
| T2.2 | Clasificar débitos como pago a proveedor y confirmar | Estado Confirmado | ☐ | ☐ |
| T2.3 | Comisión bancaria | Concepto **solo movimiento** (no usable en recibo) | ☐ | ☐ |
| T2.4 | Aplicar reglas / confirmar sugeridos en lote | Se confirman N movimientos | ☐ | ☐ |
| T2.5 | “Crear regla a partir de este movimiento” | Queda regla y vuelve a sugerir | ☐ | ☐ |
| T2.6 | Intentar reclasificar un movimiento **Conciliado** | Bloqueo + mensaje claro (no solo “Error 400”) | ☐ | ☐ |

---

## T3. Recibo — elegir el movimiento (3.15 F-T1)  **prioridad alta**

**Condición:** 3 o más créditos **confirmados** con el mismo concepto de cobro, aún no conciliados.

1. **Finanzas → Recibos de cobro** → nuevo.
2. Cliente + imputación a factura (si hay).
3. Línea: transferencia/banco + concepto cobro + cuenta (o “Todas”).
4. Abrir el desplegable de **movimiento bancario**.

| # | Qué debe pasar | OK | No |
|---|----------------|----|----|
| T3.1 | Aparecen los N movimientos (fecha, importe, descripción) | ☐ | ☐ |
| T3.2 | No aparecen sin clasificar ni solo “sugeridos” | ☐ | ☐ |
| T3.3 | Al cambiar cartera o cuenta, se recarga la lista | ☐ | ☐ |
| T3.4 | Lista vacía → mensaje claro, no error técnico | ☐ | ☐ |
| T3.5 | Al guardar, el movimiento queda vinculado / conciliado | ☐ | ☐ |
| T3.6 | El recibo se numera (ej. RC-…) | ☐ | ☐ |
| T3.7 | Si hay resto sin imputar, se ve **anticipo** a cliente | ☐ | ☐ |
| T3.8 | Tesorería **no se bloquea** si Contabilidad falla o demora | ☐ | ☐ |

**Anotar:** Nº de recibo y descripción del movimiento.

---

## T4. Orden de pago — mismo criterio (3.8, 3.15)

| # | Qué debe pasar | OK | No |
|---|----------------|----|----|
| T4.1 | Lista de débitos confirmados con fecha/importe/descripción | ☐ | ☐ |
| T4.2 | Se elige uno y se guarda la OP (nº OP-…) | ☐ | ☐ |
| T4.3 | Importe de la OP = suma de líneas; imputaciones ≤ total | ☐ | ☐ |
| T4.4 | Resto sin imputar = anticipo a proveedor (visible) | ☐ | ☐ |
| T4.5 | Vacío / cambio de cartera igual que en el recibo | ☐ | ☐ |

**Anotar:** Nº de OP.

---

## T5. Conciliación extracto ↔ sistema (3.3)

**Finanzas → Conciliación** (no Contabilidad).

| # | Qué debe pasar | OK | No |
|---|----------------|----|----|
| T5.1 | Se elige la cuenta y se ven extracto vs sistema | ☐ | ☐ |
| T5.2 | Hay sugerencias de match (importe + fecha ± 3 días) | ☐ | ☐ |
| T5.3 | Confirmar match funciona | ☐ | ☐ |
| T5.4 | (Si hay) Deshacer match | ☐ | ☐ |

---

## T6. Anular recibo / OP (3.6)

Preferir un documento **de prueba**. Motivo obligatorio, ej. “Prueba staging 03/09”.

| # | Qué debe pasar | OK | No |
|---|----------------|----|----|
| T6.1 | Pide motivo y confirma | ☐ | ☐ |
| T6.2 | Documento queda anulado | ☐ | ☐ |
| T6.3 | El movimiento del extracto vuelve a disponible | ☐ | ☐ |
| T6.4 | Cheques del documento vuelven al estado anterior (si aplica) | ☐ | ☐ |
| T6.5 | Si el **período contable está cerrado**, no deja anular (mensaje claro) | ☐ | ☐ |

Si ya estaba contabilizado → el Contador verifica contra-asiento (C5).

---

## T7. Cheques recibidos (3.9, 3.11)

**Finanzas → Cartera de cheques** — tab Recibidos.

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| T7.1 | Alta o importación de cheque recibido | Aparece En cartera | ☐ | ☐ |
| T7.2 | Depositar en banco | Movimiento sistema crédito; cheque Depositado | ☐ | ☐ |
| T7.3 | Cuando llega el débito/crédito en extracto, match (T5) | Pasa a Acreditado | ☐ | ☐ |
| T7.4 | Rechazar (con gastos si se prueba) | Movimiento débito; se **reabre deuda** del cliente | ☐ | ☐ |
| T7.5 | Filtro vencidos / alerta | Se ven vencidos | ☐ | ☐ |
| T7.6 | Usar cheque en una OP (endoso) | Sale de cartera / Endosado | ☐ | ☐ |

---

## T8. Cheques emitidos (3.10)

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| T8.1 | OP pagada con cheque propio | Cheque Emitido ligado a proveedor/OP | ☐ | ☐ |
| T8.2 | Al importar el débito del extracto | Sugerencia de match por importe / número | ☐ | ☐ |
| T8.3 | Cash flow | El cheque no debitado aparece como salida futura por fecha | ☐ | ☐ |

---

## T9. Transferencias, caja y efectivo (3.12)

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| T9.1 | Transferencia interna banco ↔ banco/caja | Dos movimientos Confirmados, concepto transferencia propia | ☐ | ☐ |
| T9.2 | Caja: no pide CSV de extracto | Movimientos nacen conciliados | ☐ | ☐ |
| T9.3 | Arqueo de caja con diferencia | Concepto ajuste y asiento de diferencia | ☐ | ☐ |

---

## T10. Multimoneda (3.13) — si hay cuenta USD

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| T10.1 | Importar extracto de cuenta USD | Moneda USD (no forzar ARS) | ☐ | ☐ |
| T10.2 | Recibo USD imputado a factura ARS (o al revés) | Diferencia de cambio visible / lista para Contabilidad | ☐ | ☐ |

Si no hay USD en staging: **N/A**.

---

## T11. Cash flow (3.14)

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| T11.1 | Abrir Cash flow, horizonte 30 días | Saldos + facturas por vencer + cheques + OP | ☐ | ☐ |
| T11.2 | Cambiar horizonte | Recalcula | ☐ | ☐ |

---

# Parte C — Contabilidad (bloque 4)

## C0. Preparación

1. **Asientos modelos:** plantillas activas `AM-FIN-01` (recibo) y `AM-FIN-02` (OP), u otras equivalentes.
2. **Plan de cuentas → mapeo** cuenta financiera → cuenta imputable (ej. Banco Galicia → `1.1.01.002`).
3. Guardar y recargar.

| # | Esperado | OK | No |
|---|----------|----|----|
| C0.1 | Se listan bancos/cajas de Finanzas | ☐ | ☐ |
| C0.2 | Se elige cuenta del plan y persiste al recargar | ☐ | ☐ |

**Si falta el mapeo del banco usado, el documento puede ir a Error al contabilizar — es esperado (C6).**

---

## C1. El extracto no se sube en Contabilidad (4.7)

| # | Esperado | OK | No |
|---|----------|----|----|
| C1.1 | Conciliación tesorería = saldos de **mayor**, no upload CSV | ☐ | ☐ |
| C1.2 | Hay enlace a conciliación / extracto en **Finanzas** | ☐ | ☐ |
| C1.3 | Si alguien prueba un upload viejo en Contabilidad | 410 / no permite | ☐ | ☐ |

---

## C2. Encolado al confirmar (4.1, 4.2, 4.6)

**Por defecto el auto-post al confirmar está apagado:** solo encola.

| # | Esperado | OK | No |
|---|----------|----|----|
| C2.1 | Tras un recibo/OP de T3/T4, sube el contador de pendientes | ☐ | ☐ |
| C2.2 | Tesorería guardó igual aunque Contabilidad demore | ☐ | ☐ |
| C2.3 | (Opcional) Si un Admin prende auto-post en settings | El asiento se genera al confirmar, no solo en lote | ☐ | ☐ |

---

## C3. Preview del lote (4.5) — sin grabar todavía

| # | Esperado | OK | No |
|---|----------|----|----|
| C3.1 | Aparece el documento con plantilla (AM-FIN-01 / 02) | ☐ | ☐ |
| C3.2 | Líneas Debe/Haber con cuentas e importes | ☐ | ☐ |
| C3.3 | Totales Debe ≈ Haber | ☐ | ☐ |
| C3.4 | Sin plantilla o sin mapeo: warning/error claro, no pantalla en blanco | ☐ | ☐ |

El Contador revisa el preview **antes** de ejecutar.

---

## C4. Ejecutar el lote

| # | Esperado | OK | No |
|---|----------|----|----|
| C4.1 | Al menos 1 asiento nuevo en Libro diario | ☐ | ☐ |
| C4.2 | Partida doble: Debe = Haber | ☐ | ☐ |
| C4.3 | El documento deja de estar Pending | ☐ | ☐ |
| C4.4 | Queda historial de lote / corrida | ☐ | ☐ |
| C4.5 | Un documento en Error **no** frena el resto del lote | ☐ | ☐ |

**Anotar:** Nº asiento y Nº lote.

---

## C5. Anular ya contabilizado (4.9)

Anular en Finanzas el recibo/OP de C4, motivo “Prueba reversión staging”.

| # | Esperado | OK | No |
|---|----------|----|----|
| C5.1 | Anulación tesorería OK | ☐ | ☐ |
| C5.2 | Contra-asiento tipo Reversión (líneas invertidas) | ☐ | ☐ |
| C5.3 | Reintentar no duplica el contra-asiento | ☐ | ☐ |
| C5.4 | Período cerrado → bloqueo con mensaje | ☐ | ☐ |

---

## C6. Errores esperados (también son prueba)

| Caso | Acción | Esperado | OK | No |
|------|--------|----------|----|----|
| C6.1 | Contabilizar sin mapeo del banco | Error “falta mapeo”, tesorería intacta | ☐ | ☐ |
| C6.2 | Concepto sin plantilla ni modelo genérico | Warning “sin modelo” / queda pendiente | ☐ | ☐ |
| C6.3 | Comisión confirmada en Finanzas | Encola para plantilla; **no** hay quick-post en Contabilidad | ☐ | ☐ |

---

## C7. Revertir lote completo (opcional)

Solo si el Contador lo autoriza en staging.

| # | Esperado | OK | No |
|---|----------|----|----|
| C7.1 | Lote marcado revertido | ☐ | ☐ |
| C7.2 | Documentos vuelven a poder contabilizarse | ☐ | ☐ |

---

# Parte 5 — Tests automáticos (bloque 5) — solo técnico

No se piden a Tesorería/Contabilidad. El técnico confirma (ya corridos al 03/09/2026):

| Proyecto | Esperado |
|----------|----------|
| Finance.Tests | 32 OK |
| Accounting.Tests | 15 OK |
| ArchitectureTests | 10 OK (Finance no referencia Accounting.Infrastructure) |
| QA-FIN-001 / 002 | Extracto→recibo→mayor y cheque depositado/rechazado |

---

# Parte 6 — Deuda técnica visible (bloque 6)

El usuario de negocio no “prueba code-split”, pero sí nota roturas.

| # | Qué hacer | Esperado | OK | No |
|---|-----------|----------|----|----|
| 6.1 | Entrar a la app y navegar Finanzas / Recibo / imprimir PDF / exportar Excel | Primera carga razonable; PDF y Excel funcionan **al usarlos** (no hace falta al abrir el login) | ☐ | ☐ |
| 6.2 | Bancos: modal importar CSV y modal clasificar | Se cierran con Escape / clic afuera; foco en el diálogo | ☐ | ☐ |
| 6.3 | Conceptos: “Nuevo concepto” | Abre modal, no una ficha suelta rara | ☐ | ☐ |
| 6.4 | Conciliación y cartera de cheques | Tablas se ven y se puede conciliar / depositar | ☐ | ☐ |

**Fuera de alcance:** renombre de tablas (6.4 del plan) — no se prueba.

---

# Escenarios de error transversales

| Caso | Resultado esperado |
|------|-------------------|
| URL de Contabilidad sin módulo | 403 / menú oculto |
| Comercial borra usuario | Permisos insuficientes |
| Reclasificar conciliado | Bloqueo + texto claro |
| Recibo con varios cobros iguales | Se **elige** el movimiento (no el primero a ciegas) |
| Lote sin documentos reales | No inventa facturas de demostración |

---

# Acta de cierre

| Área | Responsable | Fecha | Resultado | Observaciones |
|------|-------------|-------|-----------|---------------|
| 0 Integridad / usuarios | | | ☐ OK ☐ Fallos ☐ N/A | |
| 1 Roles / módulos | | | ☐ OK ☐ Fallos ☐ N/A | |
| 2 Ambiente | | | ☐ OK ☐ Fallos ☐ N/A | |
| T Tesorería (3 + F-T1) | | | ☐ OK ☐ Fallos ☐ No probado | |
| C Contabilidad (4) | | | ☐ OK ☐ Fallos ☐ No probado | |
| 6 UI Finanzas | | | ☐ OK ☐ Fallos ☐ N/A | |
| Coordinación | | | ☐ Seguir en staging ☐ Listo para plan de prod ☐ Corregir antes | |

### Bloqueadores de producción (marcar si ocurrió)

- [ ] No se puede elegir movimiento en recibo/OP con varios confirmados  
- [ ] El lote genera asientos desbalanceados o inventa documentos  
- [ ] Anular un cobro asentado no genera contra-asiento (período abierto)  
- [ ] Falta de mapeo “rompe” tesorería (el recibo no debería fallar)  
- [ ] Comercial puede borrar usuarios o escribir Contabilidad  
- [ ] El extracto se carga desde Contabilidad  

### No bloqueadores (se corrigen después)

- [ ] Textos / ayudas  
- [ ] Plantillas incompletas (anticipo, diferencia de cambio, sueldos)  
- [ ] Cash flow o cheques emitidos no recorridos en la sesión  

---

## Contacto

Dudas de URL, usuarios o smoke: chat de implementación, con el bloque de fallo de la sección “Cómo reportar”.

*Documento interno de QA funcional. No sustituye el plan maestro. Bloque 6.4 (renombre de tablas) no forma parte de estas pruebas.*
