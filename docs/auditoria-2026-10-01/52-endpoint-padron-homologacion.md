# Endpoint de Constancia de Inscripción en homologación

La consulta de clientes fallaba antes de enviar el SOAP por resolución DNS de awshomo.arca.gob.ar. Desde el contenedor de staging, awshomo.arca.gob.ar y awshomo.arca.gov.ar no resolvieron; awshomo.afip.gov.ar resolvió y devolvió HTTP 200 al descargar el WSDL público. Esa comprobación no usó credenciales ni consultó contribuyentes.

Se corrige exclusivamente el endpoint de homologación de ArcaPadronClient a https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5. Se mantiene ws_sr_constancia_inscripcion como servicio de autenticación y el endpoint de producción existente. No se implementa conmutación entre ambientes ni se desactiva la validación TLS.

Prueba reproducible local:

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj -c Release --filter FullyQualifiedName~ArcaPadronEndpointTests --verbosity quiet
```

Dos casos de transporte HTTP simulado verifican la selección de endpoint por ambiente y que el CUIT representado y el CUIT consultado permanezcan separados en el SOAP. No acceden a ARCA. La suite completa debe aprobar antes de publicar; consultar el resultado de la ejecución.

Prueba manual pendiente: tras desplegar esta corrección en staging autorizado, confirmar Homologación y consultar un CUIT desde Directorio → Clientes. Verificar que desaparece el fallo DNS y evaluar por separado cualquier respuesta de negocio de ARCA. No cambiar el certificado, la clave ni las relaciones como solución al fallo DNS.

Referencias oficiales: el manual actual https://www.arca.gob.ar/ws/WSCI/manual_ws_sr_ws_constancia_inscripcion.pdf indica un nombre que no resolvió en la comprobación. El endpoint utilizado está documentado en https://www.afip.gob.ar/ws/WSCI/manual-ws-sr-ws-constancia-inscripcion-v3.2.pdf y su disponibilidad actual fue comprobada desde staging mediante GET del WSDL. El estado DNS puede cambiar; esta evidencia describe la prueba realizada.
