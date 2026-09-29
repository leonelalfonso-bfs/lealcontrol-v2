# Relación comercial — CRM y Comunicaciones

**Versión:** 1.0 — plan único y checklist vivo

**Última actualización:** 29 de septiembre de 2026

**Base de código:** `main` en `5fa05d9`

**Ambiente de prueba:** staging (`https://v2.lealcontrol.com`). Producción no entra en este piloto hasta cerrar las verificaciones de staging.

Este archivo reemplaza el seguimiento partido entre `docs/COMUNICACIONES_PLAN_MEJORA.md`, `docs/CRM_MIGRATION_BACKLOG.md` y `docs/CRM_ODOO_REFERENCE.md`. Esos documentos conservan el detalle histórico. Las marcas de avance se hacen acá.

## Cómo marcar

- `[x]` en **Publicado** significa que el código está en `main`.
- `[x]` en **Comprobado** exige una prueba vista en staging o producción, con fecha en la nota.
- No marcar comprobado solo porque compiló.
- Al cerrar un ítem, anotar fecha y ambiente en la columna o al lado del checkbox.

## 1. Producto

CRM y Comunicaciones son tres vistas de la misma relación con el cliente:

| Vista | Para qué | Ruta |
|---|---|---|
| Ficha del cliente | Quién es, qué negocio hay, qué se habló y cuál es la próxima acción | Ficha de cliente |
| Bandeja | Cola del día: correo, WhatsApp y redes | `/comunicaciones` |
| Embudo | Dinero: prospecto, oportunidad, presupuesto | `/oportunidades` |

Un correo, un WhatsApp o una nota tienen que verse en la ficha. Una oportunidad ganada sigue abriendo un presupuesto en Ventas. Finanzas y Contabilidad funcionan aunque Comunicaciones esté apagado.

Premium, en este ERP, es esa ficha única y una bandeja de tres paneles (lista, hilo, contexto). No es un cliente de correo completo ni un clon de HubSpot.

## 2. Qué no incorporamos como producto

Se mira el comportamiento y se reescribe en los módulos que ya existen. No se embebe otra aplicación (otra base, otro login, otro cliente).

| Referencia | Licencia | Uso |
|---|---|---|
| Chatwoot Community | MIT | Modelo de bandeja: lista, hilo, ficha lateral, asignación, notas, etiquetas, respuestas rápidas. La carpeta `enterprise/` es privativa y no se usa. |
| Atomic CRM | MIT | Patrón breve de empresas, notas y tareas. |
| Twenty | Mayormente AGPL-3.0 | Solo la idea de ficha (empresa, personas, negocio, próxima acción). No se pega código. |
| Odoo Community | LGPL-3.0 | Mapa de circuito comercial, ya resumido en `docs/CRM_ODOO_REFERENCE.md`. No se portan modelos Python. |
| EspoCRM, Frappe, ERPNext | AGPL o GPL | Solo para mirar pantallas. |
| EmailEngine, Thunderbird, Roundcube | Producto o licencia aparte | Fuera de este plan. Se evalúan solo si la bandeja propia no alcanza para el trabajo diario. |

## 3. Publicado hoy

### CRM (código en `main`, menú oculto)

- [x] Clientes fiscales y comerciales, contactos, plantas y equipos.
- [x] Prospectos y conversión a cliente.
- [x] Embudo con etapas, motivo de pérdida, prioridad, responsable y etiquetas.
- [x] Actividades y vista del día (vencidas, hoy, próximas).
- [x] WhatsApp click-to-chat (`wa.me`) con actividad en el historial.
- [x] Oportunidad ganada → borrador de presupuesto en Ventas.
- [x] Ficha de cliente con pestaña Historial y pestaña Comunicaciones (lista de hilos ya vinculados y acceso a la bandeja).
- [ ] El módulo CRM visible en el menú. Hoy `crm` sigue en `temporarilyDisabledUiIds`.

### Comunicaciones (piloto, visible solo si SuperAdmin lo enciende)

- [x] Interruptor global de SuperAdmin y acceso por tenant.
- [x] Bandeja de correo, WhatsApp, Instagram y Facebook.
- [x] Notas internas, etiquetas e historial de asignación y estado.
- [x] Credenciales de Meta protegidas por tenant y webhooks duplicados reconocidos.
- [x] Salud de la casilla, recepción automática opt-in (cada 5 minutos) y sync IMAP aislado por tenant.
- [x] Lector de correo amplio.
- [x] Descarga autenticada de adjuntos y omisión del sync de WhatsApp desconectado.
- [x] Vínculo de conversación a cliente o prospecto.
- [x] Composer de correo desde cliente, factura, presupuesto, pedido y remito.

### Comprobado en staging

- [x] 26-09-2026 — SuperAdmin pudo habilitar Comunicaciones y el tenant lo vio.
- [x] 26-09-2026 — El lector de correo quedó cómodo.
- [x] 26-09-2026 — Con «Automático» activo, entró un correo sin pulsar «Recibir».
- [ ] Adjunto de correo se abre o descarga sin error 401 (commit `f4467df` o posterior).
- [ ] Con WhatsApp desconectado, la bandeja no genera 409 periódicos.
- [ ] Envío y respuesta de un correo real, con el mensaje saliente en el historial.
- [ ] Notas, etiquetas, asignación y vínculo a cliente o prospecto con un usuario real.
- [ ] Dos tenants no ven los correos del otro.
- [ ] El mismo recorrido, repetido en producción. No hacerlo hasta cerrar staging.

## 4. Fases

El orden es el de la sección 5. Una fase no se saltea porque la siguiente «se ve más premium».

### Fase 0 — Cerrar el piloto de bandeja

Objetivo: lo que ya está en `main` queda probado en staging.

- [ ] Confirmar en `/opt/lealcontrol-staging` un `HEAD` igual o posterior a `f4467df`.
- [ ] Descargar un adjunto sin 401.
- [ ] Dejar la bandeja abierta con WhatsApp desconectado y verificar que no reaparezcan 409.
- [ ] Enviar y responder un correo de prueba.
- [ ] Contraseña IMAP incorrecta muestra un error claro en Cuentas de correo.
- [ ] Sincronizar dos veces no duplica mensajes.
- [ ] Reintentos con espera si IMAP falla (`MailSyncService`). Solo si la prueba de staging lo pide.

### Fase 1 — Un solo lugar de trabajo

Objetivo: el equipo comercial entra al CRM y a la bandeja sin menús ocultos ni dos manuales.

- [ ] Volver a mostrar el módulo CRM en el menú.
- [ ] Recorrido manual escrito en una página: prospecto → cliente → oportunidad → presupuesto → bandeja.
- [ ] La ayuda de CRM y la de Comunicaciones apuntan a este plan, sin pasos que contradigan el menú real.
- [ ] Comprobar en staging que un usuario comercial ve CRM y, si el piloto está activo, Comunicaciones.

### Fase 2 — Una sola historia en la ficha

Objetivo: llamadas, notas, correos y WhatsApp se leen en la ficha del cliente, con la próxima acción a la vista.

Hoy el historial de actividades y la pestaña Comunicaciones están separados. El enlace de un hilo vuelve a la bandeja general, no al hilo.

- [ ] La ficha muestra actividades y conversaciones en una línea de tiempo, ordenada por fecha.
- [ ] Desde un hilo de la ficha se abre esa conversación en la bandeja.
- [ ] La ficha muestra la próxima acción (vencida, hoy o próxima) sin entrar al embudo.
- [ ] Una actividad cargada en el CRM no genera un segundo hilo paralelo en Comunicaciones.
- [ ] Comprobar en staging con un cliente que tenga una nota, un correo vinculado y una oportunidad.

### Fase 3 — El documento comercial dentro de la conversación

Objetivo: presupuesto, pedido y factura quedan atados al hilo, y el envío lleva el PDF.

- [ ] Vincular una conversación a presupuesto, pedido y factura (además de cliente y prospecto).
- [ ] La bandeja muestra a qué documento está vinculada.
- [ ] Desde la ficha del presupuesto, del pedido y de la factura se ve el historial de esa pieza.
- [ ] «Enviar» adjunta el PDF del documento, marcado por defecto.
- [ ] El envío queda registrado en el historial del documento.
- [ ] Si SMTP falla, la pantalla dice el error y no marca el envío como hecho.
- [ ] Tope de adjunto con mensaje claro (10 MB).
- [ ] Comprobar en staging: enviar un presupuesto de prueba y ver el PDF en el destinatario y en la ficha.

### Fase 4 — Bandeja y ficha fáciles de usar

Objetivo: la sensación de producto terminado, reescrita en Leal a partir de Chatwoot (bandeja) y de la ficha de Twenty (próxima acción). Sin copiar su código AGPL ni su edición enterprise.

- [ ] Bandeja en tres zonas: lista, lectura y panel de contexto (vínculo, etiqueta, asignación, nota).
- [ ] Si el remitente coincide con el correo de un cliente, la bandeja propone el vínculo.
- [ ] Firma simple por cuenta, al pie del correo saliente.
- [ ] Filtro «Sin vincular».
- [ ] Contador de no leídos en el menú de Comunicaciones.
- [ ] Plantilla de respuesta que inserta texto en el compositor.
- [ ] Usable en 1366×768 sin scroll horizontal.
- [ ] Comprobar el recorrido completo en staging con un usuario que no armó la pantalla.

### Fase 5 — Casillas modernas

Objetivo: conectar Gmail o Microsoft sin contraseña de aplicación, cuando una casilla real del piloto lo necesite.

- [ ] Elegir el primer proveedor según la casilla que use el equipo (Google o Microsoft).
- [ ] Conexión OAuth, token cifrado y renovación antes del sync o del envío.
- [ ] Botón «Conectar con Google» o «Conectar con Microsoft» en Cuentas de correo.
- [ ] Desconectar revoca el acceso en la pantalla.
- [ ] Comprobar sync y envío con esa casilla real.

Queda fuera hasta que las fases 0 a 4 estén comprobadas: carpetas IMAP (Enviados, Borradores, Papelera), búsqueda full-text masiva y un motor de correo externo.

## 5. Orden de la próxima sesión

1. Cerrar la Fase 0 en staging y marcar solo lo que se vio.
2. Fase 1: mostrar el CRM.
3. Fase 2: una historia en la ficha.
4. Fase 3: vínculo a presupuesto, pedido y factura, y PDF al enviar.
5. Fase 4 y, si hace falta, Fase 5.

## 6. Dónde está el código

| Área | Ubicación |
|---|---|
| CRM | `src/Modules/Crm/` |
| Comunicaciones | `src/Modules/Communications/` |
| Bandeja | `frontend/src/pages/InboxPage.tsx` |
| Cuentas de correo | `frontend/src/pages/MailSettingsPage.tsx` |
| Composer | `frontend/src/components/EmailComposer.tsx` |
| Ficha de cliente | `frontend/src/pages/CustomerDetailPage.tsx` |
| Embudo | `frontend/src/pages/OpportunitiesPage.tsx` |
| Menú y visibilidad | `frontend/src/app/moduleRegistry.ts` |

## 7. Tablero

**Última actualización:** 29-09-2026

| Fase | Estado | Siguiente marca |
|---|---|---|
| 0 — Cierre del piloto | Parcial | Adjuntos, 409, envío y respuesta |
| 1 — CRM visible | Pendiente | Sacar `crm` del menú oculto |
| 2 — Una historia en la ficha | Pendiente | Línea de tiempo única |
| 3 — Documento y PDF | Pendiente | Vínculo a presupuesto y PDF adjunto |
| 4 — Bandeja y ficha | Pendiente | Tres zonas y próxima acción |
| 5 — OAuth | Pendiente | Elegir proveedor cuando haya una casilla real |

Leyenda: Pendiente · Parcial · Hecho cuando todos los ítems de la fase están en Publicado y los de prueba están en Comprobado.
