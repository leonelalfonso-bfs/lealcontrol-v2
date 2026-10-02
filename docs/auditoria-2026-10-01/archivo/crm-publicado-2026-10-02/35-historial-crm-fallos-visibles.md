# Historial de CRM: distinguir vacío de error

Antes, el listado de actividades reintentaba cualquier excepción de base y, si volvía a fallar, devolvía una lista vacía. El handler de historial por cliente también convertía cualquier excepción en éxito con lista vacía. Un usuario podía ver «sin actividades» frente a una falla real.

Ahora el repositorio reintenta solo las fallas de esquema reparables (tabla o columna ausente). Si el reintento falla, o si ocurre otro error, la excepción llega al manejo HTTP y se devuelve un error; una lista vacía queda reservada para la consulta exitosa sin resultados. El cambio alcanza los listados de actividades por cliente, oportunidad y seguimiento porque usan el mismo repositorio. El manejador de producción devuelve un mensaje genérico para errores PostgreSQL y conserva el detalle técnico en el registro del servidor.

Prueba automatizada con PostgreSQL efímero:

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~CustomerTimelineFailureApiTests
```

La prueba crea un cliente ficticio, confirma que el historial sano y vacío responde 200 con `[]`, renombra una columna esencial en la base efímera y confirma que la consulta falla con 500 en vez de responder 200 con `[]`. Usa la configuración `Production` solo dentro de TestServer para comprobar que el cuerpo no expone el nombre de la columna. La base de prueba se elimina al finalizar; no se modifica staging ni producción.

Prueba manual en entorno de desarrollo: crear una actividad para un cliente ficticio y verificar que se muestre en su historial. El cliente debe mostrar el aviso de error si la API no puede consultar el historial; no debe interpretarlo como ausencia de actividades. No provocar errores de esquema en una base compartida.
