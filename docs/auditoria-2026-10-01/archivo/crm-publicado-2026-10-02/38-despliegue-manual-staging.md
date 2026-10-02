# Despliegue manual de staging

El usuario autorizó adaptar únicamente la ejecución manual de Deploy staging. La rama remota `staging/metrology-2307` impide crear `staging`; el bloque CRM se publicó en `staging/crm-cierre-20261002` y está en la PR 65.

Se conservan los disparadores y el comportamiento de workflow_run. En workflow_dispatch se valida y despliega el SHA seleccionado mediante checkout detached. No se fuerza el checkout ni se descartan cambios del servidor. El workflow de producción queda intacto.

Validación del bloque CRM: 200 pruebas Release aprobadas, API y frontend compilados. El ajuste posterior afecta solo a este workflow y a este informe; su script SSH se comprueba con bash -n sin ejecutarlo.

Esperar CI verde en el nuevo commit. Luego abrir Actions > Deploy staging > Run workflow, seleccionar `staging/crm-cierre-20261002` y ejecutar. El workflow elegido debe mostrar este ajuste. Comprobar el resultado SSH, los contenedores y smoke-health, y realizar las verificaciones funcionales del informe 37 en v2. La PR apunta a main: fusionarla activaría el flujo de producción, por lo que la validación de staging debe completarse primero.

Para una reversión, seleccionar un commit anterior verificado mediante el procedimiento de operación del entorno; el checkout detached no constituye una reversión automática de datos. No ejecutar scripts de borrado ni pruebas de alteración de esquema sobre bases compartidas.
