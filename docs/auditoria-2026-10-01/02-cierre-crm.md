# CRM · estado de la primera tanda

> Actualización 2026-10-02: este informe conserva el alcance de la primera tanda. El estado vigente y los pendientes consolidados están en [CONTINUIDAD](../CONTINUIDAD.md). No repetir el pendiente del historial, ya cerrado. Los recorridos específicos de conversión y etapas siguen pendientes de confirmación explícita.

Base de revisión: `main` en `5acf972`. Rama propuesta: `codex/crm-primera-tanda-20261001`. Este documento describe el código combinado y verificado localmente; falta la prueba funcional en staging.

## Corregido y verificado localmente

- [x] **Conversión de prospectos**: la API respeta la elección de crear o no una oportunidad. La interfaz usa la oportunidad devuelta por la API y evita una segunda alta. Las pruebas de integración cubren ambos casos.
- [x] **Oportunidades por cliente**: los filtros de identificadores fuertes de EF se corrigieron; la prueba de conversión confirma que la oportunidad vinculada aparece en el listado del cliente.
- [x] **Etapas y reapertura**: la interfaz envía `Qualified` para «Relevamiento», permite retrocesos con motivo y usa el contrato de reapertura del servidor.
- [x] **Etapa e historial juntos**: una sola solicitud guarda el movimiento, la nota y la fecha de seguimiento en el mismo contexto de datos. La prueba de integración confirma que una transición rechazada no deja una nota y que cierre/reapertura agregan una nota cada uno.
- [x] **Contrato de movimiento**: el request HTTP ahora transmite probabilidad y campos personalizados además de etapa, motivo, descripción y próxima fecha de seguimiento.
- [x] **Clientes fuera de la primera página**: ficha y embudo cargan todas las páginas del catálogo existente.
- [x] **Exportación Excel de prospectos**: usa `name`, que es el campo expuesto por el DTO.

Verificación de la rama combinada: compilación de API exitosa; 18/18 pruebas unitarias y 15/15 pruebas de integración del CRM aprobadas; compilación del frontend exitosa.

## Pendiente antes de producción

- [ ] Probar en staging los recorridos de `05-prueba-etapas-crm.md`, `06-prueba-clientes-oportunidades.md` y `07-prueba-etapa-historial-atomicos.md`, además de la conversión con y sin oportunidad.
- [x] Fallos del historial y de oportunidades: corregidos, cubiertos por pruebas y publicados en el bloque CRM de la PR #65. La prueba funcional en staging fue confirmada por el usuario.
- [ ] Auditar duplicados de presupuestos por oportunidad antes de añadir una restricción única. El diseño y la consulta de solo lectura están en la rama local `codex/crm-quote-uniqueness`.
- [ ] Acordar la regla comercial de «ganada → presupuesto»: el comportamiento actual exige generar el presupuesto antes de marcar la oportunidad como ganada.
- [ ] Ampliar cobertura de permisos por tenant y vínculos presupuesto–oportunidad.

## Límites

Las pruebas locales no demuestran qué datos de staging o producción podrían estar afectados. Cualquier corrección de datos requiere auditoría de solo lectura y respaldo previos.
