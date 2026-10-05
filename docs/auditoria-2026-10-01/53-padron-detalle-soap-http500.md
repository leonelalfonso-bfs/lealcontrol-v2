# Constancia de Inscripción: detalle de SOAP Fault con HTTP 500

## Problema

Tras corregir el endpoint de homologación, la consulta en staging devolvió solamente "Constancia de inscripción HTTP 500". ArcaPadronClient leía el cuerpo, pero devolvía el error HTTP antes de analizar un posible SOAP Fault. El mensaje impedía distinguir rechazo de negocio, autorización y fallo del servicio. La causa concreta del rechazo observado permanece pendiente; no se atribuye automáticamente a certificados ni permisos.

## Corrección

Se extrae faultstring antes de evaluar el estado HTTP. Si existe, se devuelve su motivo con un límite de 400 caracteres y sin copiar el sobre SOAP completo. Si no existe un motivo SOAP, se conserva el error HTTP genérico, sin exponer cuerpos HTML o detalles del proxy. No cambia el endpoint, las credenciales ni la selección de ambiente.

## Validación reproducible

```bash
dotnet test tests/LealControl.Modules.Crm.IntegrationTests/LealControl.Modules.Crm.IntegrationTests.csproj -c Release --filter 'FullyQualifiedName~ArcaPadron' --verbosity quiet
```

Cinco casos cubren selección de endpoint y CUIT representado/consultado, SOAP Fault tanto con HTTP 200 como 500 y HTTP 500 sin motivo SOAP. El transporte está simulado: no consulta ARCA. La suite completa de Release fue ejecutada por el script de cierre antes de escribir este informe y crear el commit; consultar su salida para el conteo y resultado.

## Prueba manual pendiente

Después de un despliegue autorizado en staging, mantener Homologación y repetir la consulta del cliente. Registrar el mensaje concreto de ARCA para decidir el siguiente paso. No generar CSR ni cambiar relaciones basándose solo en HTTP 500. Si persiste el error genérico, puede no existir un faultstring válido en la respuesta; requiere una revisión específica adicional.

No se publicaron cambios, desplegaron versiones ni modificaron bases durante la preparación local. La emisión de la Factura A de servicios en homologación sigue pendiente.
