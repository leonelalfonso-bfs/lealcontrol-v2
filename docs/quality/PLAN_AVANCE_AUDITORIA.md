# Plan de avance - Calidad ISO/IEC 17025

**Estado inicial:** 07/09/2026.  
**Ambito:** staging. No habilita cambios en produccion.

## Reglas permanentes

- Calidad y Metrologia Legal son modulos independientes.
- Los codigos y titulos aprobados por la consultoria se preservan como `DisplayCode` y nombre visible.
- Los registros nacen en el ERP; un escaneado firmado se adjunta como evidencia y no sustituye el registro.
- Un dato, documento o version aprobados no se eliminan ni se alteran: se corrigen mediante una nueva revision trazable.

## Tablero de implementacion

| Etapa | Entregable | Estado | Criterio de cierre |
|---|---|---|---|
| 1 | Inventario y correspondencia documental | En curso | Cada elemento de Drive tiene codigo, version, destino y estado de carga en ERP. |
| 2 | Integridad y trazabilidad | Pendiente | Versiones aprobadas inmutables; correcciones/anulaciones y auditoria recuperables. |
| 3 | Biblioteca documental | Pendiente | Documentos internos, externos y sus PDFs vigentes disponibles desde Calidad. |
| 4 | Registros de gestion SGC | Pendiente | Cada registro se crea, valida, emite y conserva desde el ERP. |
| 5 | Registros tecnicos e integracion | Pendiente | Calidad consulta Metrologia sin duplicar el dato tecnico. |
| 6 | Firma y auditoria simulada | Pendiente | Recorrido completo documento -> registro -> evidencia -> historial validado en staging. |

## Etapa 1 - Inventario y correspondencia documental

### Hecho

- [x] Se identifico el arbol de la consultoria: MC, PG01-PG17, IT, certificados y normas externas.
- [x] Se relevo `mapping.json`: 53 entradas documentales.
- [x] Se confirmo que PG01-R01 y PG01-R02 son listados generados por el sistema, no archivos a subir.
- [x] Se identificaron los seis registros operativos actualmente expuestos en Calidad.
- [x] Se verifico PG01 y PG02 contra los documentos de Drive.
- [x] Se corrigio el inventario: PG09 v1 esta disponible en Drive; quedaba marcado como faltante por error.

### Pendiente de cerrar

- [ ] Descargar/copiar a `tools/quality-seed/input/` los archivos aprobados disponibles en Drive.
- [ ] Ejecutar carga controlada de documentos fuente y PDFs publicados en staging.
- [ ] Confirmar con la consultoria o Direccion los faltantes detectados: MC01-R05, PG05, PG09-R01/R02/R03, IT01-IT04.
- [ ] Comparar el listado maestro de codigos y la matriz ISO con el `mapping.json` para detectar codigos, nombres o versiones discordantes.
- [ ] Marcar en cada registro si su destino es `Generated`, `Linked`, `Structured` o `Attachment`.

### Decisiones verificadas

- PG01 define MC, PG, IT y registros asociados como estructura de la informacion documentada; exige codigo, version y elaboracion/revision/aprobacion.
- PG02 exige conservar registros tecnicos por al menos ocho anos y preservar el dato original ante una correccion.
- PG02 aun menciona el historial de Google Drive para registros digitales. Antes de declararlo vigente en el ERP, ese texto debe ser reemplazado por el mecanismo de historial del sistema y aprobado como nueva version.

## Proxima accion

Terminar el inventario con la matriz de codigos y preparar el lote documental de staging. No se marcara un documento como "cargado" hasta comprobar su archivo, version y estado en el arbol del ERP.

## Etapa 2 - Integridad y trazabilidad

### Hecho en este corte

- [x] Una nueva version en borrador ya no desplaza la version vigente hasta que se aprueba.
- [x] Las versiones vigentes, aprobadas u obsoletas no permiten editar metadatos ni reemplazar archivos.
- [x] La aprobacion solo admite borradores o versiones en revision.
- [x] Los valores de indicadores no se eliminan desde la API.
- [x] Se creo la tabla de eventos de auditoria, con estado anterior, posterior, usuario y fecha.
- [x] Se registran altas y correcciones de indicadores; creacion, adjuntos, cambios de metadatos y aprobacion de versiones.
- [x] Se agrego una consulta protegida de historial por entidad.
- [x] Compilacion de API y modulo Calidad sin errores.

### Pendiente de esta etapa

- [ ] Mostrar el historial de auditoria dentro de la interfaz del documento y del registro.
- [ ] Reemplazar la correccion en sitio de indicadores por una pantalla que explique y muestre el historial.
- [ ] Extender el mismo patron a los futuros registros estructurados: quejas, NC, auditorias, personal y proveedores.
- [ ] Definir y probar el respaldo/restauracion de archivos y base de datos para la retencion requerida.
