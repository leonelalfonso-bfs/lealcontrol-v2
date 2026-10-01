# CRM · etapas y reapertura: prueba reproducible

Rama local: `codex/crm-completion`, base `5acf972`. Este instructivo corresponde al arreglo de etapas preparado el 1 de octubre de 2026. Ningún paso solicita datos productivos.

## Verificación automática local

1. `dotnet test tests/LealControl.Modules.Crm.UnitTests/LealControl.Modules.Crm.UnitTests.csproj`: comprueba que un retroceso entre etapas abiertas exige motivo y que una oportunidad cerrada solo se reabre con motivo.
2. `dotnet build src/Host/LealControl.Api/LealControl.Api.csproj`: valida el dominio y API.
3. `cd frontend && npm run build`: verifica la traducción de «Relevamiento» a la etapa `Qualified` admitida por API.

## Prueba funcional posterior en staging

Usar una empresa y un cliente de prueba. Crear una oportunidad y un presupuesto de prueba. No desplegar estos cambios hasta revisar la rama.

1. Desde el embudo, pasar de Relevamiento a Propuesta con presupuesto existente y de Propuesta a Negociación. Confirmar que cada etapa aparece en su columna.
2. Arrastrar de Negociación a Propuesta, indicar motivo y confirmar. Debe quedar en Propuesta y registrar el motivo una sola vez en el historial.
3. Arrastrar de Propuesta a Relevamiento con motivo. La API debe guardar `Qualified`; la UI debe seguir mostrando «Relevamiento».
4. Intentar un retroceso sin motivo mediante la API. Debe rechazarlo y conservar la etapa.
5. Marcar una oportunidad de prueba como ganada y reabrirla a Negociación desde la ficha. Repetir con una perdida. Verificar etapa y motivo.
6. Forzar un cambio inválido (por ejemplo, intentar ganar desde Relevamiento). Confirmar que se rechaza y no aparece una actividad falsa en el historial.

## Integridad de la operación

El cambio de etapa y su nota se guardan en una sola operación del servidor. La prueba `OpportunityMoveApiTests` confirma que un cambio rechazado no agrega actividad y que cierre y reapertura agregan una nota cada uno. Antes de publicar, repetir este recorrido en staging con una empresa de prueba.
