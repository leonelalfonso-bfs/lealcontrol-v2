# Referencia CRM Odoo (Community) → Leal Control 2.0

Odoo es open source. La edición **Community** es gratuita (código en [github.com/odoo/odoo](https://github.com/odoo/odoo), módulo `addons/crm`). Hay extras de la comunidad en [OCA/crm](https://github.com/OCA/crm) (AGPL).

Usamos Odoo como **mapa de capacidades**, no como código a copiar (licencias distintas; Leal tiene su propio dominio AR/CUIT/IIBB).

## Modelo mental de Odoo CRM

| Concepto Odoo | Qué es | En Leal 2.0 hoy |
|---|---|---|
| `res.partner` (Contactos) | Empresa/persona; base de clientes y proveedores | `Customer` (más fiscal: CUIT, IVA, IIBB, plantas) |
| `crm.lead` tipo **Lead** | Prospecto sin calificar | `Lead` |
| `crm.lead` tipo **Opportunity** | Negocio calificado en embudo | `Opportunity` (agregado separado — mejor separación) |
| `crm.stage` | Etapas del kanban | Stages fijos en embudo |
| Activities / next activity | Llamada, mail, reunión, “próxima acción” | `Activity` + WhatsApp click-to-chat |
| Chatter | Hilo interno + mails en la ficha | Timeline (más simple) |
| Sales Team | Equipo / cartera | No aún |
| Tags | Etiquetas de clasificación | No aún |
| Expected revenue + probability | Forecast | Monto en opportunity; sin probabilidad |
| Won → quotation (`sale.order`) | Cierra CRM y abre Ventas | Presupuesto vivirá en módulo Ventas |

En Odoo, lead y opportunity son **el mismo modelo** (`crm.lead`) con `type`. En Leal estánamos agregados: más claro para el dominio argentino y para no mezclar con presupuestos.

## Funcionalidades Community (núcleo útil)

1. **Pipeline kanban** — drag & drop por etapas, monto esperado por columna  
2. **Leads** — alta manual / mail / web form; convertir a opportunity (+ partner)  
3. **Activities** — agenda de seguimiento; semáforo (sin próxima / planificada / vencida)  
4. **Chatter** — notas y mails en el mismo hilo  
5. **Equipos de venta** — asignación y filtros por equipo  
6. **Tags / prioridad** — segmentar  
7. **Lost reasons** — por qué se perdió  
8. **Reportes básicos** — pipeline, ganado/perdido  
9. **Integración Sales** — opportunity → presupuesto  

Enterprise suma (no tomar como “must” inicial): AI lead scoring, mining, dashboards avanzados, VoIP, etc.

## Gap analysis vs Leal 2.0 CRM

| Capacidad Odoo | Leal ahora | Prioridad sugerida |
|---|---|---|
| Kanban con drag & drop | Embudo + drag & drop + totales | Hecho (slice 1) |
| Crear opportunity desde embudo | Formulario en Embudo | Hecho (slice 1) |
| Next activity / Hoy | Agenda vencidas/hoy/próximas | Hecho (slice 2) |
| Convert lead → customer | Hecho | — |
| Tags + prioridad | Hecho (filtros + clasificar) | Slice 3 |
| Lost reason | Obligatorio al pasar a Perdido | Hecho (slice 1) |
| Equipos / owner | Cartera por OwnerName + reporte | Slice 5 |
| Forecast (probabilidad × monto) | No | Baja (post Ventas) |
| Chatter mail | Hilo + tipos + próxima acción (mail API después) | Slice 4 |
| Lead desde web/form | No | Cuando haya catálogo/web |
| Quotation desde CRM | Won → borrador `Quote` (Sales) | Slice 6 |

## Roadmap ordenado (paridad Community útil)

Objetivo: misma **funcionalidad operativa** del CRM Community (no Enterprise, no clonar UI/código Odoo).

| # | Slice | Entrega | Estado |
|---|---|---|---|
| **1** | Embudo usable | Crear opp en kanban, drag & drop, totales por columna, **lost reason** obligatorio | Hecho |
| **2** | Día comercial | “Hoy”: vencidas / hoy / próximas; link a ficha; WA donde haya teléfono | Hecho |
| **3** | Clasificación | Tags, prioridad, owner / filtros | Hecho |
| **4** | Chatter | Notas + canal (mail más adelante); timeline unificado | Hecho |
| **5** | Equipos / reportes | Sales team, pipeline ganado/perdido básico | Hecho |
| **6** | Puente Ventas | Won → borrador de presupuesto (módulo Sales) | Hecho |

Fuera de alcance inicial: AI scoring, VoIP, web lead forms, forecast con probabilidad.

## Cómo mirar el código Odoo (si hace falta)

```text
https://github.com/odoo/odoo/tree/18.0/addons/crm
```

Archivos clave: `models/crm_lead.py`, `models/crm_stage.py`, `models/crm_team.py`, vistas kanban en `views/`.

Regla: extraer **comportamiento de negocio**, reimplementar en Clean Architecture Leal (Domain/Application), no portar modelos Odoo.
