# Leal Control ERP 2.0
## Plan de mejora del módulo Communications (correo y canales)

**Versión:** 1.1 — plan y seguimiento

**Última actualización:** 26 de septiembre de 2026

**Estado:** piloto de Comunicaciones en staging; último cambio de código publicado en `main`: `f4467df`

**Relacionado con:** `docs/CIRCUITO_DINERO_FINANZAS.md`, `docs/SIMULACION_CIRCUITO_DINERO_COMPLETA.md`

---

## 0. Punto de reanudación y checklist vivo

La casilla de staging **recibió un correo automáticamente**, sin pulsar «Recibir Correo», después de activar **Comunicaciones → Cuentas de correo → Activar automático**. El servicio comprueba cada casilla habilitada aproximadamente cada 5 minutos. El usuario también confirmó que la vista ampliada del correo quedó bien. Estas son pruebas reales de staging; lo demás se marca por separado como publicado o pendiente de verificar.

### Publicado en `main`

- [x] Habilitación global de Comunicaciones desde SuperAdmin y acceso por tenant.
- [x] Bandeja unificada con correo, WhatsApp, Instagram y Facebook; notas internas, etiquetas e historial de asignación/estado.
- [x] Protección de credenciales de Meta por tenant y manejo idempotente de webhooks duplicados.
- [x] Estado de salud de casillas (última sincronización y error), recepción automática opcional por cuenta y sincronización IMAP aislada por tenant (`fbe3871`).
- [x] Mejora de distribución de la bandeja y área amplia de lectura de correo (`ca7ab08`, `e1b7c2d`).
- [x] Descarga autenticada de adjuntos y omisión de sincronización periódica de WhatsApp desconectado (`f4467df`).

### Comprobado por el usuario en staging

- [x] El módulo pudo habilitarse desde SuperAdmin y quedó visible en el tenant.
- [x] La vista del correo quedó cómoda para leer.
- [x] Tras activar «Automático» en una casilla, un correo nuevo llegó sin intervención manual.
- [ ] Confirmar que staging desplegó `f4467df` y que un adjunto se abre o descarga sin error 401.
- [ ] Confirmar que, con WhatsApp desconectado, la bandeja deja de generar 409 periódicos.
- [ ] Probar envío y respuesta de correo con una casilla real; comprobar que el mensaje saliente queda en el historial.
- [ ] Probar notas, etiquetas, asignación, estado y vínculo a cliente/lead con usuarios reales.
- [ ] Verificar deduplicación y aislamiento entre dos tenants con datos reales.
- [ ] Repetir el recorrido validado en producción antes de considerar cerrado el piloto.

**Criterio para marcar:** `[x]` en «Publicado» significa código integrado; `[x]` en «Comprobado» exige una prueba observada en el ambiente indicado. No dar por validada una función solo porque compiló.

**Próximo paso:** cerrar las verificaciones del último despliegue, completar la prueba funcional de correo y después continuar con los vínculos de negocio (Fase B). Registrar cada resultado en los checklists de fase más abajo.

---

## 1. Objetivo de este documento

Definir el plan para **mejorar lo que ya existe** en el módulo Communications (correo + bandeja unificada), sin incorporar Thunderbird ni un cliente de correo de escritorio embebido.

Incluye:
- Qué hay hoy en el sistema.
- Qué falta para un gestor de correo útil dentro del ERP.
- Fases de implementación con **checklist** para ir validando avances.
- Regla de arquitectura: módulo **conectado**, no dependiente.

---

## 2. Decisión de diseño (acordada en conversación)

### 2.1 Lo que NO vamos a hacer

| Opción descartada | Motivo |
|-------------------|--------|
| **Thunderbird embebido** | Es aplicación de escritorio (Mozilla), no componente web integrable |
| **Fork de cliente de correo completo** | Costo de mantenimiento enorme; desvía foco del ERP |
| **Roundcube/SnappyMail en iframe** | PHP aparte, SSO complejo, difícil vincular a facturas/clientes del ERP |
| **Reemplazar Communications desde cero** | Ya hay inversión en IMAP, bandeja, WhatsApp, Meta |

### 2.2 Lo que SÍ vamos a hacer

> **Potenciar el módulo Communications actual** hasta tener un gestor de correo operativo dentro del ERP, conectado a CRM, Ventas, Compras y Finanzas.

Patrón de referencia (Odoo, FileMaker FileMailer, etc.):
1. Sincronizar correos vía IMAP al ERP.
2. Mostrar bandeja unificada (email + WhatsApp + redes).
3. Vincular conversaciones a clientes, leads, facturas, pedidos.
4. Enviar desde el ERP con adjuntos (PDF factura, presupuesto, remito).
5. Contabilidad / Finanzas **no dependen** de Communications; solo se conectan si el cliente lo usa.

### 2.3 Alternativa futura (solo si la bandeja propia queda corta)

**EmailEngine + ee-client** (open source / servicio headless):
- Motor IMAP/SMTP/Gmail/Graph unificado.
- UI web embebible en React.
- Evaluar **solo en Fase D** si hace falta UI tipo Thunderbird (carpetas avanzadas, búsqueda full-text masiva).

Por ahora: **mejorar lo propio**.

---

## 3. Qué hay hoy (inventario técnico)

### 3.1 Backend — `src/Modules/Communications/`

| Componente | Estado | Notas |
|------------|--------|-------|
| Cuentas IMAP/SMTP | ✅ | `mail_accounts`, secretos cifrados |
| Sync manual IMAP | ✅ | `POST /accounts/{id}/sync` |
| Envío SMTP | ✅ | `POST /accounts/{id}/send` |
| Mensajes + adjuntos en BD | ✅ | `communications.email_messages`, `email_attachments` |
| Conversaciones unificadas | ✅ | Email, WhatsApp, Instagram, Facebook |
| Vínculo conversación ↔ cliente/lead | ✅ | `POST /conversations/{id}/link` |
| Sugerencia automática de cliente | ✅ | `suggested-matches` |
| Asignación, estado, plantillas | ✅ | assign, status, templates |
| Sync automático (servicio) | ✅ | Cada 5 minutos, activación por casilla; validado con correo real en staging |
| OAuth Gmail / Microsoft | ⚠️ | UI avisa; OAuth no implementado |
| Vínculo a factura / pedido / OP | ❌ | Solo Customer, Lead, Order parcial |
| Envío con PDF adjunto desde documento | ⚠️ | `EmailComposer` en varias pantallas; sin adjunto PDF automático |
| Búsqueda full-text | ⚠️ | Búsqueda básica en bandeja |
| Carpetas IMAP (Sent, Trash, etc.) | ❌ | Solo concepto lógico en UI |

### 3.2 Frontend

| Pantalla | Ruta | Estado |
|----------|------|--------|
| Bandeja unificada | `InboxPage.tsx` | ✅ Completa (email + WA + Meta) |
| Config cuentas | `MailSettingsPage.tsx` | ✅ Gmail, Microsoft, Yahoo, Custom |
| Composer reutilizable | `EmailComposer.tsx` | ✅ Usado en cliente, factura, presupuesto, pedido, oportunidad |
| Historial en ficha cliente | `CustomerDetailPage` | ⚠️ Parcial |
| Envío desde factura | `InvoicePrintPage` | ✅ Composer con contexto |
| Envío desde remito | `RemitoPrintPage` | ✅ |
| Envío desde presupuesto | `QuotePrintPage` | ✅ |

### 3.3 API principal (`/api/v1/communications/`)

```
GET  /accounts
POST /accounts
POST /accounts/{id}/test
POST /accounts/{id}/sync
POST /accounts/{id}/send
GET  /messages?entityType=&entityId=
GET  /conversations
GET  /conversations/{id}/messages
POST /conversations/{id}/link
POST /conversations/{id}/assign
POST /conversations/{id}/status
GET  /conversations/{id}/suggested-matches
GET  /templates
POST /media/upload
... WhatsApp / Meta endpoints
```

---

## 4. Brechas respecto a la visión objetivo

| # | Brecha | Impacto | Prioridad |
|---|--------|---------|-----------|
| 1 | Monitoreo y reintentos del sync automático | Ya recibe solo; falta backoff y validar fallos prolongados | **Alta** |
| 2 | Sin OAuth real para Gmail/Microsoft | Muchos usuarios no pueden conectar casilla | **Alta** |
| 3 | Vínculo limitado a Cliente/Lead | No se ve hilo desde factura, compra, recibo | **Alta** |
| 4 | Envío sin adjuntar PDF del documento automáticamente | Hay que reenviar manualmente | **Alta** |
| 5 | Sin panel "Correos de este cliente" robusto en ficha | CRM pierde contexto | Media |
| 6 | Sin reglas automáticas de clasificación (remitente → cliente) | Mucho trabajo manual en bandeja | Media |
| 7 | Sin firma HTML por usuario/cuenta | Emails poco profesionales | Media |
| 8 | Sin carpetas IMAP reales | Usuarios acostumbrados a "Enviados", "Papelera" | Baja |
| 9 | Sin notificación push/email de mensajes nuevos | Depende de entrar al ERP | Baja |

---

## 5. Visión objetivo (usuario final)

```
Cuenta de correo (IMAP/SMTP u OAuth)
         │
         ▼
   Sync automático cada X min
         │
         ▼
   Bandeja unificada (Inbox)
         │
         ├── Vincular a Cliente / Lead / Factura / Pedido
         ├── Responder con plantilla
         └── Asignar a vendedor
         
Desde Factura / Presupuesto / Remito:
         │
         ▼
   "Enviar por email" → PDF adjunto + texto + registro en historial
```

**Principio:** el usuario **no sale del ERP** para gestionar correo comercial vinculado al negocio.

---

## 6. Plan de implementación por fases

### Resumen de fases

| Fase | Nombre | Entregable principal | ¿Bloquea otros módulos? |
|------|--------|----------------------|-------------------------|
| **A** | Sync y confiabilidad | Cron + errores visibles + test conexión | No |
| **B** | Vínculos de negocio | Conversación ↔ factura, pedido, compra | No |
| **C** | Envío con adjuntos | PDF automático desde documentos | No |
| **D** | Bandeja y UX | Panel en ficha cliente, reglas, firmas | No |
| **E** | OAuth + proveedores | Gmail y Microsoft sin app password | No |
| **F** | Avanzado (opcional) | Carpetas IMAP, búsqueda, EmailEngine | No |

---

## 7. Fase A — Sync y confiabilidad

**Objetivo:** que el correo entre solo, sin depender de que alguien pulse "Recibir".

### Tareas técnicas

| # | Tarea | Archivos probables |
|---|-------|-------------------|
| A1 | ✅ Servicio de sync por tenant cada 5 min | `CommunicationsSyncBackgroundService.cs` |
| A2 | ◐ `LastSyncAtUtc` y `LastError` disponibles; contador persistente pendiente | `MailAccount`, endpoints |
| A3 | ☐ Reintentos con backoff si falla IMAP | `MailSyncService.cs` |
| A4 | ✅ Alerta en UI si cuenta lleva >24h sin sync o con error | `MailSettingsPage.tsx` |
| A5 | ◐ Logs de tenant y cantidad de correos; falta identificador de cuenta | Serilog |

### Checklist de validación — Fase A

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| A-V1 | Cuenta IMAP conecta con "Probar" | ☐ | | |
| A-V2 | Sync manual trae mensajes nuevos | ☐ | | |
| A-V3 | Sync automático corre sin intervención | ✅ | 26-09-2026 | Correo recibido solo en staging tras activar la casilla |
| A-V4 | Si la contraseña es incorrecta, se muestra error claro en Config | ☐ | | |
| A-V5 | No se duplican mensajes al sincronizar dos veces | ☐ | | |
| A-V6 | Multi-tenant: cuenta de empresa A no ve correos de empresa B | ☐ | | |

**Estado fase A:** ◐ En curso. Recepción automática validada en staging; A3 y pruebas de errores, duplicados y multi-tenant pendientes.

---

## 8. Fase B — Vínculos de negocio

**Objetivo:** cualquier conversación o envío queda trazado al objeto comercial correcto.

### Tareas técnicas

| # | Tarea | Detalle |
|---|-------|---------|
| B1 | Extender `link` a más tipos de entidad | `Invoice`, `Quote`, `Order`, `PurchaseInvoice`, `CollectionReceipt` |
| B2 | `GET /messages?entityType=Invoice&entityId=` en ficha factura | Panel "Comunicaciones" |
| B3 | Al enviar desde `EmailComposer` con `entityType` + `entityId`, guardar vínculo | `CommunicationsEndpoints.cs` |
| B4 | Mostrar hilos vinculados en `CustomerDetailPage` (pestaña Comunicaciones) | Frontend |
| B5 | Badge en bandeja: "Vinculado a FA-0001-1234" | `InboxPage.tsx` |

### Checklist de validación — Fase B

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| B-V1 | Vincular conversación a un cliente desde bandeja | ☐ | | |
| B-V2 | Vincular conversación a una factura de venta | ☐ | | |
| B-V3 | Desde ficha cliente se ven todos los hilos vinculados | ☐ | | |
| B-V4 | Desde ficha factura se ve historial de emails de esa factura | ☐ | | |
| B-V5 | Sugerencia automática de cliente sigue funcionando | ☐ | | |
| B-V6 | Desvincular / cambiar vínculo sin perder el mensaje | ☐ | | |

**Estado fase B:** ◐ En curso. Vínculo a cliente/lead y contexto de algunos envíos ya existen; faltan vínculos a documentos y validación integral.

---

## 9. Fase C — Envío con adjuntos desde documentos

**Objetivo:** "Enviar factura por email" adjunta el PDF y registra el envío.

### Tareas técnicas

| # | Tarea | Detalle |
|---|-------|---------|
| C1 | Endpoint o helper: generar PDF de factura/presupuesto/remito en servidor | Reutilizar lógica de print |
| C2 | `SendEmailRequest` acepta `attachmentIds` o `generatePdfFromEntity` | `CommunicationsEndpoints.cs` |
| C3 | `EmailComposer` opción "Adjuntar PDF del documento" (checkbox default ON) | `EmailComposer.tsx` |
| C4 | Tras envío exitoso: mensaje saliente en BD + vínculo a entidad | Ya parcialmente existe |
| C5 | Mismo flujo para: Factura, Presupuesto, Remito, Pedido, OC compra | Pantallas print/detail |

### Checklist de validación — Fase C

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| C-V1 | Enviar factura: llega email con PDF adjunto al destinatario | ☐ | | |
| C-V2 | El envío queda registrado en historial de la factura | ☐ | | |
| C-V3 | Presupuesto y remito: mismo comportamiento | ☐ | | |
| C-V4 | Si falla SMTP, usuario ve error claro (no "éxito falso") | ☐ | | |
| C-V5 | Adjunto no supera límite razonable (ej. 10 MB) con mensaje claro | ☐ | | |
| C-V6 | Finanzas / Contabilidad no requieren este módulo para operar | ☐ | | |

**Estado fase C:** ☐ Pendiente. El composer existe, pero el PDF del documento aún no se adjunta automáticamente.

---

## 10. Fase D — Bandeja y experiencia de uso

**Objetivo:** bandeja usable a diario sin sentir que "falta Thunderbird".

### Tareas técnicas

| # | Tarea | Detalle |
|---|-------|---------|
| D1 | Reglas: si remitente = email de cliente X → sugerir vínculo automático | Tabla `mail_routing_rules` o similar |
| D2 | Firmas por usuario y/o por cuenta | HTML simple |
| D3 | Filtros guardados en bandeja (Solo email, Solo sin vincular, Por vendedor) | Ya parcial en `InboxPage` |
| D4 | Marcar leído / no leído persistente | Endpoint `mark-read` ya existe |
| D5 | Contador de no leídos en menú lateral | `notifications/summary` ya existe |
| D6 | Vista compacta móvil de bandeja | Responsive |

### Checklist de validación — Fase D

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| D-V1 | Regla automática vincula correo de cliente conocido | ☐ | | |
| D-V2 | Firma se agrega al pie de emails salientes | ☐ | | |
| D-V3 | Badge de no leídos visible en menú Comunicaciones | ☐ | | |
| D-V4 | Filtro "Sin vincular" muestra solo conversaciones huérfanas | ☐ | | |
| D-V5 | Plantillas de respuesta insertan texto en composer | ☐ | | |
| D-V6 | Bandeja usable en pantalla 1366×768 sin scroll horizontal | ☐ | | |

**Estado fase D:** ◐ En curso. Bandeja y lector mejorados; reglas, firmas y validación responsive pendientes.

---

## 11. Fase E — OAuth Gmail y Microsoft 365

**Objetivo:** conectar casillas sin contraseña de aplicación (experiencia moderna).

### Tareas técnicas

| # | Tarea | Detalle |
|---|-------|---------|
| E1 | Flujo OAuth2 Google (Gmail API o IMAP XOAUTH2) | Redirect + refresh token cifrado |
| E2 | Flujo OAuth2 Microsoft Graph / Office 365 | Idem |
| E3 | UI "Conectar con Google" / "Conectar con Microsoft" | `MailSettingsPage.tsx` |
| E4 | Renovación automática de token antes de sync/send | Background job |
| E5 | Documentar en UI pasos para admin de dominio (si aplica) | Ayuda contextual |

### Checklist de validación — Fase E

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| E-V1 | Conectar cuenta Gmail vía OAuth sin app password | ☐ | | |
| E-V2 | Sync trae mensajes de Gmail OAuth | ☐ | | |
| E-V3 | Envío SMTP/API funciona con token renovado | ☐ | | |
| E-V4 | Conectar cuenta Microsoft 365 vía OAuth | ☐ | | |
| E-V5 | Token expirado se renueva sin intervención del usuario | ☐ | | |
| E-V6 | Desconectar cuenta revoca acceso en UI | ☐ | | |

**Estado fase E:** ☐ Pendiente. Gmail con contraseña de aplicación es distinto de OAuth; Microsoft OAuth requiere desarrollo.

---

## 12. Fase F — Avanzado (opcional, evaluar después)

Solo si Fases A–D no alcanzan:

| Opción | Cuándo evaluar |
|--------|----------------|
| Carpetas IMAP reales (Sent, Drafts, Trash) | Usuarios piden gestión tipo cliente de correo completo |
| Búsqueda full-text en cuerpo de 10k+ mensajes | Performance de PostgreSQL insuficiente |
| **EmailEngine** embebido | Necesidad de UI rica sin desarrollarla |
| Archivar adjuntos a S3/MinIO | Adjuntos muy pesados en BD |

**Estado fase F:** ☐ No evaluada · ☐ En evaluación · ☐ Descartada · ☐ En curso

---

## 13. Regla de arquitectura (igual que Finanzas)

| Situación | Comportamiento |
|-----------|----------------|
| Cliente **sin** Communications configurado | Ventas, CRM, Finanzas funcionan normal |
| Cliente **usa** correo | Se conecta: envía PDFs, ve historial en fichas |
| WhatsApp / Meta | Mismo módulo, misma bandeja; no obligatorio |

**Communications no bloquea ningún otro módulo.**

---

## 14. Orden de trabajo al retomar

1. **Cierre del piloto en staging:** comprobar adjuntos y ausencia de 409 periódicos con el commit `f4467df`; probar envío/respuesta de correo.
2. **Fase A — confiabilidad:** validar errores IMAP visibles, deduplicación y aislamiento entre tenants; implementar reintentos con backoff si la prueba lo exige.
3. **Fase B — vínculos de negocio:** extender y probar relación de conversaciones con facturas, presupuestos y pedidos; mostrar el historial donde corresponde.
4. **Fase C — PDF adjunto:** enviar documentos desde el ERP con el PDF correcto y trazabilidad del mensaje.
5. **Fases D/E:** reglas, firmas, UX restante y OAuth con Google/Microsoft según necesidad real del piloto.

El circuito del dinero se sigue en `docs/PLAN_MAESTRO_MEJORAS.md`; este documento registra solo Comunicaciones.

---

## 15. Tablero de avance general

**Última actualización:** 26-09-2026

**Ambiente confirmado:** staging (recepción automática y lector de correo)

**Último commit de código publicado:** `f4467df`

**Despliegue de ese commit en staging:** pendiente de confirmar

| Fase | Estado | Siguiente criterio para avanzar |
|------|--------|---------------------------------|
| A — Sync y confiabilidad | ◐ En curso | A-V1, A-V2, A-V4…A-V6; adjuntos y 409 del último commit |
| B — Vínculos de negocio | ◐ Parcial | Vínculo a factura/pedido y vista del historial |
| C — PDF adjunto | ☐ Pendiente | Envío real de factura con PDF |
| D — Bandeja y UX | ◐ Parcial | Reglas, firmas y prueba 1366×768 |
| E — OAuth | ☐ Pendiente | Definir proveedor prioritario |
| F — Avanzado | ☐ Opcional | Evaluar solo si hay necesidad concreta |

**Leyenda:** ☐ pendiente · ◐ parcial/en curso · ✅ implementado y validado en staging.

---

## 16. Checklist de la próxima sesión

- [ ] Confirmar `git rev-parse --short HEAD` en `/opt/lealcontrol-staging` (esperado: `f4467df` o posterior).
- [ ] Abrir y descargar un adjunto de correo; verificar que no haya 401.
- [ ] Dejar la bandeja abierta varios minutos con WhatsApp desconectado; verificar que no reaparezcan 409 periódicos.
- [ ] Enviar y responder un correo de prueba; comprobar recepción externa e historial interno.
- [ ] Marcar los criterios A-V1…A-V6 y D-V1…D-V6 únicamente cuando se prueben.
- [ ] Elegir el primer vínculo de Fase B (factura, presupuesto o pedido) para la siguiente implementación.

---

## 17. Referencia técnica rápida

| Área | Ubicación |
|------|-----------|
| Backend Communications | `src/Modules/Communications/` |
| Endpoints | `CommunicationsEndpoints.cs` |
| Sync IMAP | `MailSyncService.cs` |
| Envío SMTP | `MailTransportService.cs` |
| UI Bandeja | `frontend/src/pages/InboxPage.tsx` |
| UI Cuentas | `frontend/src/pages/MailSettingsPage.tsx` |
| Composer | `frontend/src/components/EmailComposer.tsx` |
| API client | `frontend/src/api/client.ts` |

---

*Documento interno — Leal Control ERP 2.0*  
*Plan de mejora Communications — opción: potenciar lo existente (sin Thunderbird)*
