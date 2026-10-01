# CRM · pendientes de cierre y verificación

Auditoría de código sobre `main` `5acf972` (1 de octubre de 2026). Estado de implementación local: la rama `codex/crm-lead-conversion` pasó 14 pruebas de integración y la compilación del frontend; no hay publicación ni cambios de datos remotos.

## Prioridad alta

- [x] **Conversión de prospecto (corrección local)**: el backend creaba una oportunidad aun cuando la casilla de la pantalla estaba desmarcada, y el frontend creaba otra cuando estaba marcada. El cambio local hace que la API respete la elección y usa la oportunidad creada por la API. Las dos pruebas nuevas pasaron; la suite del CRM terminó con 14/14. Pendiente prueba funcional en staging después de publicar.
- [ ] **Oportunidades y actividades por cliente**: los filtros de `Guid?` se cambiaron localmente a `CustomerId?`/`OpportunityId?`; la prueba de conversión confirmó que la oportunidad aparece en el listado del cliente. Falta cubrir explícitamente el listado de actividades. El patrón de reintento que devuelve lista vacía tras cualquier excepción debería limitarse a errores de esquema y exponer los demás fallos.
- [x] **Etapas del embudo (corrección local)**: la interfaz traduce «Relevamiento» a `Qualified`; el dominio admite retrocesos entre etapas abiertas con motivo y el handler existente admite reapertura de cerradas. Las pantallas registran la nota después de que la API acepta el cambio, por lo que un rechazo ya no deja una actividad falsa. Pasaron 18 pruebas unitarias y 12 de integración; API y frontend compilaron. Pendiente prueba funcional en staging.
- [ ] **Etapa e historial atómicos**: la nota y el cambio siguen siendo dos solicitudes. Si falla la segunda, la etapa puede quedar cambiada sin su nota. Mover ambas acciones a una transacción del servidor antes de publicar el flujo como auditoría completa.
- [ ] **Presupuesto por oportunidad**: proteger en servidor la unicidad de presupuesto vigente por oportunidad frente a solicitudes simultáneas, con auditoría previa de duplicados existentes antes de agregar un índice único.

## Prioridad media

- [ ] Completar el contrato de `/opportunities/{id}/move`: la aplicación admite probabilidad y campos personalizados, pero el request HTTP solo transmite etapa y motivo.
- [ ] Alinear el flujo «ganada → presupuesto» documentado con la regla actual que exige crear presupuesto antes de cerrar la oportunidad. Confirmar la regla comercial antes de cambiar comportamiento.
- [ ] Corregir exportación Excel de prospectos: usa `companyName`, mientras el DTO expone `name`.
- [ ] **Clientes fuera de la primera página**: ficha y embudo de oportunidades llaman a `listCustomers()` (50 registros); los clientes importados que quedan fuera pueden aparecer sin nombre o no ofrecerse en el selector. Usar la consulta paginada completa existente o búsqueda remota.
- [ ] Ampliar pruebas de integración: prospecto con/sin oportunidad, filtro de oportunidades y actividades por cliente, transiciones y reapertura, vínculo presupuesto–oportunidad, permisos por tenant.

## Instructivo de prueba para el cambio de conversión

En una base de prueba desechable, crear dos prospectos distintos. Convertir el primero con «Crear oportunidad» marcado; debe haber exactamente una oportunidad asociada al cliente y al prospecto y abrirse su ficha. Convertir el segundo con la casilla desmarcada; debe crearse el cliente y ninguna oportunidad. Repetir el GET de oportunidades por cliente y confirmar que no devuelve vacío si existen registros. Si la consulta falla, debe registrarse el error y no presentarse como un CRM sin oportunidades.

## Instructivo de prueba para etapas (pendiente de implementación)

Crear una oportunidad nueva y avanzar por las etapas admitidas con el requisito de presupuesto. Intentar un salto inválido y confirmar rechazo sin actividad falsa en la línea de tiempo. Cerrar como ganada y reabrir con motivo a `Negotiation`; luego hacer lo mismo con perdida. Probar también la opción visual «Relevamiento» y verificar que se traduzca a una etapa aceptada. Confirmar desde ficha y kanban que ambos muestran la misma etapa y que el motivo queda registrado solo cuando el cambio se confirma.

## Límite

Esto es una evaluación de código y pruebas locales. No demuestra por sí sola qué datos de staging o producción están afectados. Para cualquier reparación de datos se requiere primero auditoría de solo lectura y respaldo.
