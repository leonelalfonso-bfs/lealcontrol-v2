# Padrón: errores de negocio cuando faltan datos generales

## Evidencia y problema

Tras la corrección del endpoint y la lectura de SOAP Fault, staging devolvió "sin razón social" para dos CUIT que el usuario confirmó consultables en producción. Eso no demuestra CUIT inválidos ni fallo del certificado. El cliente no leía errorConstancia, errorRegimenGeneral ni errorMonotributo antes de devolver su mensaje genérico. El motivo concreto de las respuestas de homologación sigue pendiente de obtener.

## Corrección local

Cuando no se obtiene nombre o razón social, se extraen los elementos error dentro de los tres bloques de negocio definidos en el contrato. Se muestran motivos únicos, limitados en conjunto a 400 caracteres, sin copiar todo el XML. La lectura XML prohíbe DTD y usa XmlResolver nulo. Si hay datos generales disponibles, un error de sección tributaria opcional no los descarta. Si no hay motivos de negocio, se conserva el mensaje genérico existente.

No se modifican los certificados, las relaciones, los CUIT ni los endpoints. Esta corrección mejora la evidencia del rechazo: no afirma que los datos de homologación coincidan con producción ni que resuelva por sí misma la consulta.

## Validación reproducible

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj -c Release --filter 'FullyQualifiedName~ArcaPadron' --verbosity quiet
```

Nueve casos del padrón aprobados en la ejecución focalizada. Cuatro casos nuevos verifican motivos de cada bloque cuando faltan datos y conservación de datos disponibles ante error de una sección opcional. El transporte es simulado, sin consultas a ARCA. La suite completa se ejecuta antes de guardar el commit: consultar su salida para el resultado y el conteo.

## Prueba manual pendiente

Después de publicación y despliegue autorizados en staging, repetir las consultas que devolvieron "sin razón social" y registrar el motivo concreto. Si ARCA indica ausencia de persona en ese ambiente, distinguirlo de validez del CUIT en producción. Si devuelve otro error, corregir su causa con esa evidencia. Si no trae bloques de error, revisar específicamente el esquema de la respuesta antes de cambiar configuración. La prueba de emisión fiscal en homologación continúa pendiente.

Contrato oficial: https://www.arca.gob.ar/ws/WSCI/manual_ws_sr_ws_constancia_inscripcion.pdf, respuesta de getPersona_v2 y bloques errorConstancia, errorRegimenGeneral y errorMonotributo.

Rescatada el 14/10/2026: había quedado en una rama local sin PR (6/10).
