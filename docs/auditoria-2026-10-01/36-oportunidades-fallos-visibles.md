# Consultas de oportunidades: fallos visibles

Prioridad: alta. El repositorio devolvía una colección vacía tras un segundo fallo de consulta. La lista general, las oportunidades del cliente y el tablero podían mostrar ausencia de negocios aunque la base de datos estuviera fallando.

Se conserva un único reintento para tabla o columna faltante. Si falla otra vez, la excepción llega al manejador de la API, con el mensaje genérico de producción incorporado en el cambio de historial. Otros errores y cancelaciones se propagan sin intentar reparar el esquema.

## Prueba reproducible

Ejecutar `dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~OpportunityQueryFailureApiTests` desde este worktree, con Docker disponible.

La prueba crea un cliente ficticio en PostgreSQL efímero. Comprueba respuestas correctas sin oportunidades; luego renombra una columna solo en ese contenedor y verifica HTTP 500 en las tres consultas, sin detalles SQL en la respuesta de producción simulada.

La rama parte del commit local de historial `5e9b93c`, necesario para devolver errores de base de datos sin exponer sus detalles. No se modifican bases reales.

El handler de oportunidades del cliente también capturaba cualquier excepción y devolvía éxito con una lista vacía. Se eliminó esa captura para que un error persistente alcance al manejador de errores de la API.
