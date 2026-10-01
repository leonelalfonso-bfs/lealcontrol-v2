# ARCA · evitar exposición de credenciales en configuración

## Hallazgo

`GET /api/v1/company/settings` devolvía el PEM del certificado y, más grave, la clave privada a cualquier usuario autenticado de la empresa. La pantalla de configuración los cargaba en el estado del navegador. La clave privada da acceso a servicios ARCA para los que ese certificado está autorizado.

## Cambio

- Las respuestas habituales de configuración no incluyen ni el certificado ni la clave; solo indican si están guardados.
- La generación del CSR entrega la clave privada una sola vez al administrador para descargar su respaldo.
- El administrador puede subir el certificado firmado sin volver a cargar la clave: el servidor utiliza la clave ya guardada y verifica que corresponda al certificado antes de actualizar.
- La pantalla distingue «guardado en servidor» de un archivo recién seleccionado y borra el contenido del archivo de su estado después de la carga.
- No hay migración ni cambio de datos existentes.

## Prueba en staging

1. Con una empresa de prueba, generar CSR como administrador. Descargar los archivos y verificar que Configuración indique «clave privada guardada en el servidor» tras recargar.
2. Subir el `.crt` correspondiente sin seleccionar `.key` nuevamente. Debe guardarse y el diagnóstico debe seguir pudiendo obtener el ticket WSAA.
3. Desde una sesión de administración y otra sin ese rol, consultar `GET /api/v1/company/settings`: `arcaCertificateKey` y `arcaCertificateCrt` deben ser `null`; las banderas `hasArcaCertificateKey` y `hasArcaCertificateCrt` deben reflejar el estado.
4. Intentar subir un `.crt` que no corresponda a la clave guardada: debe fallar sin sustituir el certificado existente.

Nunca pegar certificados, claves ni respuestas completas de configuración en chats o logs. Esta mejora no habilita la emisión fiscal; WSFEv1 se integra en otra rama.
