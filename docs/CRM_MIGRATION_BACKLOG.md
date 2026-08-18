# CRM 2.0 — alcance de migración y backlog

## Propósito

Este documento traduce las capacidades del CRM de Leal Control (Laravel) a decisiones explícitas para Leal Control 2.0. El sistema anterior es referencia de reglas y uso real; no se migra su código ni se modifica.

Cada capacidad se incorpora únicamente cuando tiene dueño de módulo, contrato público, pruebas y una experiencia de uso simple.

## Estado de partida en 2.0

El núcleo CRM ya cubre:

- clientes fiscales/comerciales con contactos, plantas, equipos y alícuotas;
- leads y conversión real a cliente;
- oportunidades con kanban, clasificación, prioridad, responsable, motivo de pérdida y reporte básico;
- actividades y agenda de seguimiento;
- puente oportunidad ganada → presupuesto del módulo Sales;
- WhatsApp click-to-chat con registro de actividad.

## Capacidades del legado y decisión

| Capacidad | Estado en 2.0 | Decisión |
|---|---|---|
| Cliente, contactos y ficha comercial | Implementado | Consolidar y probar con datos reales |
| Lead → cliente → oportunidad | Implementado | Consolidar y probar el recorrido completo |
| Embudo, prioridad, responsable y pérdida | Implementado | Consolidar; agregar probabilidad después de Ventas |
| Actividades, próxima acción y agenda | Implementado | Mejorar UX de seguimiento antes de canales externos |
| Presupuesto desde oportunidad | Implementado | Mantener como contrato con Sales, sin dependencia de Infrastructure |
| Bandeja IMAP y asociación de correos | Pendiente | Slice CRM-2: integración de email entrante |
| Envío de correo y documentos | Pendiente | Slice CRM-3: canal email saliente y plantillas |
| WhatsApp con bandeja/webhooks | Pendiente | Slice CRM-4, después de validar click-to-chat; Meta API no entra al núcleo |
| Plantillas por canal y documento | Pendiente | Slice CRM-3; servicio compartible, contenido por tenant |
| Equipos comerciales y cuotas | Parcial | Slice CRM-5, cuando exista Identity y usuarios reales |
| Captura web/catálogo | Pendiente | Slice CRM-6, como contrato de entrada de leads |
| Forecast por probabilidad | Pendiente | Posterior a Sales estable |

## Primer corte funcional: CRM-1 “operación diaria confiable”

Objetivo: un vendedor puede registrar y seguir un cliente, prospecto u oportunidad sin salir del CRM; cada acción relevante queda en la línea de tiempo y el equipo puede priorizar el día.

Incluye:

1. clientes, contactos, ubicaciones y equipos;
2. alta, conversión y archivo de leads;
3. oportunidades y kanban con motivo de pérdida;
4. actividades de seguimiento (nota, llamada, reunión y WhatsApp);
5. vista “Hoy”: vencidas, hoy y próximas;
6. link de WhatsApp con plantilla y actividad registrada;
7. creación de borrador de presupuesto desde oportunidad ganada;
8. pruebas unitarias e integración de los flujos anteriores.

No incluye:

- inbox IMAP;
- envío SMTP;
- Meta WhatsApp Cloud API;
- automatizaciones comerciales;
- IA, scoring o forecast;
- autenticación/roles definitivos: se diseñarán en la Fundación 2.0 y reemplazarán el tenant de desarrollo.

## Criterios de aceptación CRM-1

- ningún dato de cliente, lead u oportunidad cruza tenants;
- una oportunidad perdida siempre tiene motivo;
- una oportunidad ganada puede originar un único presupuesto borrador;
- toda interacción manual genera una actividad consultable en la ficha;
- la agenda clasifica de forma consistente actividades vencidas, de hoy y próximas;
- la UI y la API compilan, y los flujos tienen pruebas automatizadas;
- el módulo CRM no referencia internals de Sales: usa sólo Contracts.

## Orden de implementación

1. Recuperar el build del frontend y alinear sus tipos con la API actual.
2. Completar pruebas de integración para CRM-1, incluyendo actividades, pipeline y puente a Sales.
3. Validar CRM-1 con datos de prueba y una guía de recorrido manual.
4. Diseñar Foundation 2.0: usuarios, roles, permisos, planes y tenant desde identidad autenticada.
5. Avanzar con CRM-2 (email entrante) solo después de estabilizar Foundation.

## Regla de migración de datos

La migración de clientes, contactos, leads y actividades se diseña al finalizar CRM-1. Será repetible, validable y con conciliación de conteos; no se ejecutará contra un modelo que todavía esté cambiando.
