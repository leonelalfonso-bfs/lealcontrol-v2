# CRM · etapa e historial en una operación

Rama local: `codex/crm-completion`. Este cambio une el movimiento de etapa con el alta de su nota en el mismo `CrmDbContext` y una llamada a `SaveChangesAsync`. La API conserva compatibilidad con clientes que envían solo etapa y motivo: en ese caso genera una descripción breve.

## Pruebas automáticas

- Compilar API y frontend.
- Ejecutar `OpportunityMoveApiTests`: intento inválido de `Lead` a `Won` no modifica etapa ni historial; cierre como `Lost` crea una nota; reapertura a `Qualified` con motivo crea una segunda nota y ambas son visibles por `/timeline`.
- Ejecutar la suite completa de integración del CRM antes de publicar la rama.

## Prueba posterior en staging

Usar una oportunidad de prueba. Avanzar etapa desde embudo y desde ficha, indicando un texto único y fecha de seguimiento. Confirmar que cada cambio aparece una sola vez en el historial y que se conserva la fecha. Repetir con reapertura y retroceso. Forzar un salto inválido y verificar que no aparece ninguna nota nueva. Interrumpir la conexión durante la solicitud y revisar el estado real antes de reintentar.

## Dependencia entre ramas

La consulta de actividades por oportunidad usa identificadores fuertes de EF. La rama de conversión de prospectos ya corrige ese filtro; para probar este flujo en una rama autónoma se incluye la misma corrección de consulta. Antes de publicar, integrar ambas ramas sobre una base común y resolver la superposición de manera explícita.
