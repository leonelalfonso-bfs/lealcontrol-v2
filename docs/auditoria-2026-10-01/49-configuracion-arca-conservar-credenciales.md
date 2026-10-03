# Guardar el ambiente ARCA conservando las credenciales

## Problema y comportamiento corregido

El formulario exigía seleccionar un certificado para guardar el ambiente,
aunque la empresa ya tuviera un par válido. El ambiente parecía cambiar en
pantalla, pero al volver se recuperaba el anterior. Además, la instrucción
del CSR siempre dirigía al portal de producción.

Ahora se puede guardar ambiente y CUIT firmante sin seleccionar archivos,
si ya existe un par válido. Los campos omitidos o vacíos conservan los PEM
guardados. La API valida el par resultante y su vigencia antes de modificar
credenciales o configuración. Un reemplazo incompatible o un PEM inválido
no cambia el ambiente, las credenciales ni la fecha de actualización.

El cliente omite los archivos no seleccionados, borra el diagnóstico anterior
tras guardar y llama al botón Guardar configuración ARCA. La instrucción
de CSR dirige a WSASS para homologación y al Administrador de Certificados
Digitales para producción. Si hay credenciales guardadas, generar otro CSR
requiere confirmar que reemplaza la clave y elimina el certificado local.
Esto no implica revocar un certificado en ARCA.

## Validación automática

Ocho casos de API con PostgreSQL efímero y certificados autofirmados generados
solo para pruebas: archivos omitidos, vacíos, mismo certificado con clave
omitida, reemplazo completo, PEM inválido, certificado incompatible, clave
inválida y ausencia de credenciales iniciales. Se comprueba la persistencia
al recargar y la conservación completa ante rechazo.

La suite Release completa y el frontend compilaron satisfactoriamente antes
de guardar el cambio. No se consultó WSAA ni se emitieron comprobantes.

## Prueba manual reproducible pendiente

1. En una empresa de prueba con certificado y clave guardados, cambiar el
   ambiente sin seleccionar archivos y guardar. Recargar: debe conservar
   el ambiente elegido y ambos indicadores de credenciales.
2. Seleccionar un certificado incompatible y guardar: debe rechazarlo y
   conservar la configuración anterior al recargar.
3. Iniciar generación de CSR y cancelar la confirmación: no debe generar
   ni reemplazar credenciales. Confirmar solo en una empresa de prueba
   destinada a obtener otro certificado.
4. Comprobar que la instrucción del CSR corresponda al ambiente elegido.

## Alcance

Rama local codex/arca-settings-preserve-20261003, creada desde origin/main.
Separada del bloque fiscal codex/arca-cierre-20261002 aún no publicado.
Esta corrección no cambia por sí misma el ambiente de ninguna empresa.
No contiene datos de empresas ni credenciales reales. No se publicó ni desplegó.
