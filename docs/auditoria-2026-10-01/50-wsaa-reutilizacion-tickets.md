# WSAA: reutilización de tickets y diagnóstico

## Problema y prioridad

Prioridad alta: cada consulta del cliente WSAA generaba y enviaba un nuevo loginCms. Los diagnósticos repetidos o concurrentes podían recibir alreadyAuthenticated después de una autenticación correcta. El resumen presentaba cualquier fallo parcial como falta de permisos y recomendaba esperar aproximadamente un minuto sin fundamento en la respuesta.

## Corrección local

Una caché singleton comparte tickets entre instancias del cliente. La clave incluye la huella del certificado, el servicio y el ambiente. Cada clave tiene un bloqueo asincrónico que evita solicitar tickets simultáneos cuando la primera solicitud obtiene uno válido. Solo se conservan respuestas con token, firma y expirationTime válido y futuro. La renovación se realiza al vencer el ticket según la respuesta de WSAA. Los fallos no se guardan y la cancelación del usuario se propaga y libera el bloqueo.

El diagnóstico parcial indica que no se pudo confirmar el acceso y remite al detalle, sin atribuir automáticamente el fallo a permisos. alreadyAuthenticated sigue siendo un fallo si esta instancia no dispone del ticket, sin inventar credenciales ni un tiempo de espera.

## Alcance y límites

Los tickets permanecen en memoria y no se escriben en archivos ni en informes. Reiniciar la API elimina la caché. Otro proceso, otra réplica o una instalación que use el mismo certificado, servicio y ambiente puede obtener un ticket que esta instancia no tenga; esta corrección no comparte tickets entre servidores. No recupera tickets emitidos antes del despliegue. Un rechazo inicial por un ticket anterior puede continuar hasta que ARCA permita una nueva autenticación.

Este cambio no emite comprobantes. Autenticarse en WSAA no demuestra por sí solo autorización para operar sobre un CUIT representado o punto de venta: eso se verifica mediante consultas de negocio separadas.

## Validación reproducible local

Desde la raíz de la rama:

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj -c Release --filter 'FullyQualifiedName~ArcaWsaa' --verbosity quiet
```

Once casos cubren concurrencia, reutilización entre instancias, vencimiento exacto, separación por certificado/servicio/ambiente, respuestas incompletas o vencidas, cancelación y rechazo alreadyAuthenticated sin tiempo inventado. El transporte HTTP está simulado y los certificados son generados localmente para las pruebas; no se accede a ARCA. La suite completa se ejecuta antes del commit; consultar el resultado de la ejecución, no interpretar esta instrucción como evidencia de éxito.

## Prueba manual pendiente tras un despliegue autorizado

1. En una empresa de homologación, conservar el certificado y la clave ya configurados; no generar un nuevo CSR.
2. Una vez obtenido un diagnóstico correcto, repetirlo varias veces. Debe reutilizar ambos tickets vigentes sin rechazos por pedirlos otra vez.
3. Consultar puntos de venta y último comprobante autorizado de un punto válido; comprobar que el ambiente mostrado sea homologación. Estas consultas no reservan numeración ni solicitan CAE.
4. Consultar un CUIT desde Directorio → Clientes para verificar el permiso de negocio de Constancia de Inscripción.
5. Si el primer diagnóstico informa un ticket anterior que esta instancia no posee, conservar la configuración y revisar el uso del mismo certificado en otras instancias. No concluir que faltan permisos ni garantizar una espera de un minuto.

## Referencia oficial

Manual WSAA, sección sobre solicitudes repetidas de tickets: https://www.arca.gob.ar/ws/WSAA/WSAAmanualDev.pdf. Los tiempos preventivos pueden cambiar; se reutiliza el ticket hasta su expirationTime.

No se realizó publicación, despliegue ni modificación de bases de staging o producción durante esta corrección.
