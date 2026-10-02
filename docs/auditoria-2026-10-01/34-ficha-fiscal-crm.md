# Ficha fiscal CRM: edición segura de alícuotas

El formulario de alícuotas ahora carga la tasa de la jurisdicción elegida antes de editarla y envía en el PUT las dos exclusiones, sus vencimientos y el número de certificado. Muestra las ocho jurisdicciones que admite el dominio. El endpoint rechaza jurisdicciones desconocidas y solicitudes que omiten las banderas de exclusión, para evitar que valores predeterminados borren información fiscal.

## Prueba reproducible

En un checkout local con Docker y los SDK instalados:

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj --filter FullyQualifiedName~CustomerFiscalRateApiTests
npm --prefix frontend run build
```

Con una base de pruebas, crear un cliente ficticio y cargar para ARBA una percepción excluida, vencimiento futuro y certificado ficticio. Abrir la pestaña Fiscal de su ficha: al elegir ARBA, el formulario debe mostrar esos valores. Cambiar solo la tasa y guardar; volver a abrir la ficha y confirmar que la exclusión, fecha y certificado siguen iguales. Desactivar la exclusión de forma explícita, guardar y confirmar que se eliminan. Repetir con una jurisdicción adicional, por ejemplo DGR Mendoza. Enviar por API `jurisdiction: "NoExiste"` y luego omitir `hasPerceptionExclusion` y `hasRetentionExclusion`: ambas solicitudes deben devolver 400 sin modificar la tasa ARBA.

No usar clientes ni certificados reales para esta prueba. Al redactar este documento, la terminal de la sesión de Codex no podía iniciar procesos; compilación y pruebas locales quedan pendientes de ejecución.
