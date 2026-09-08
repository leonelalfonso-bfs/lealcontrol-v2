# Leal Control ERP 2.0
## Plan de mejora del módulo Communications (correo y canales)

**Versión:** borrador 1.0 — plan de trabajo  
**Fecha:** septiembre 2026  
**Estado:** pendiente de implementación (retomar mañana)  
**Relacionado con:** `docs/CIRCUITO_DINERO_FINANZAS.md`, `docs/SIMULACION_CIRCUITO_DINERO_COMPLETA.md`

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
| Sync automático (cron) | ⚠️ | Manual hoy; falta programar |
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
| 1 | Sync solo manual ("Recibir") | Correos llegan tarde; usuario debe acordarse | **Alta** |
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
| A1 | Job/cron de sync por tenant (cada 5–15 min) | `MailSyncService.cs`, `Program.cs` o hosted service |
| A2 | Registrar `LastSyncAtUtc`, `LastError`, contador de mensajes | `MailAccount`, endpoints |
| A3 | Reintentos con backoff si falla IMAP | `MailSyncService.cs` |
| A4 | Alerta en UI si cuenta lleva >24h sin sync o con error | `MailSettingsPage.tsx` |
| A5 | Logs estructurados (tenant, cuenta, mensajes nuevos) | Serilog |

### Checklist de validación — Fase A

| # | Criterio | OK | Fecha | Notas |
|---|----------|:--:|-------|-------|
| A-V1 | Cuenta IMAP conecta con "Probar" | ☐ | | |
| A-V2 | Sync manual trae mensajes nuevos | ☐ | | |
| A-V3 | Sync automático corre sin intervención (ver logs o `LastSyncAtUtc`) | ☐ | | |
| A-V4 | Si la contraseña es incorrecta, se muestra error claro en Config | ☐ | | |
| A-V5 | No se duplican mensajes al sincronizar dos veces | ☐ | | |
| A-V6 | Multi-tenant: cuenta de empresa A no ve correos de empresa B | ☐ | | |

**Estado fase A:** ☐ No iniciada · ☐ En curso · ☐ Completada

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

**Estado fase B:** ☐ No iniciada · ☐ En curso · ☐ Completada

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

**Estado fase C:** ☐ No iniciada · ☐ En curso · ☐ Completada

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

**Estado fase D:** ☐ No iniciada · ☐ En curso · ☐ Completada

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

**Estado fase E:** ☐ No iniciada · ☐ En curso · ☐ Completada

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

## 14. Roadmap conjunto con Circuito del Dinero

Para referencia al retomar mañana:

| Prioridad | Iniciativa | Documento | Estado |
|-----------|------------|----------|--------|
| 1 | Circuito del dinero — Fase A+B (carteras estrictas) | `CIRCUITO_DINERO_FINANZAS.md` | ✅ OK contable — pendiente implementar |
| 2 | Communications — Fase A (sync automático) | Este documento | ☐ Pendiente |
| 3 | Communications — Fase B+C (vínculos + PDF) | Este documento | ☐ Pendiente |
| 4 | Circuito del dinero — Fase C (reglas enriquecidas) | `CIRCUITO_DINERO_FINANZAS.md` | ☐ Pendiente |
| 5 | Communications — Fase D+E (UX + OAuth) | Este documento | ☐ Pendiente |

---

## 15. Tablero de avance general (actualizar cada sesión)

**Última actualización:** _______________  
**Responsable:** _______________

| Fase | Estado | % estimado | Bloqueos |
|------|--------|------------|----------|
| Circuito dinero A+B | ☐ | | |
| Comunicaciones A | ☐ | | |
| Comunicaciones B | ☐ | | |
| Comunicaciones C | ☐ | | |
| Comunicaciones D | ☐ | | |
| Comunicaciones E | ☐ | | |
| Comunicaciones F | ☐ | N/A | |

### Leyenda de estado
- ☐ No iniciada
- ◐ En curso
- ✅ Completada y validada en staging

---

## 16. Próxima sesión (mañana) — sugerencia de arranque

1. **Confirmar prioridad:** ¿Circuito del dinero A+B primero, o Communications A en paralelo?
2. Si circuito primero → ver checklist en `CIRCUITO_DINERO_FINANZAS.md` §7 (Fases A–B).
3. Si correo primero → empezar por **Fase A** (sync automático); es el mayor dolor operativo hoy.
4. Probar en staging con casilla real (Gmail app password o corporativo IMAP).
5. Marcar checklists de este documento a medida que se valida cada ítem.

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
