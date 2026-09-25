# PG01-R02: documentos externos

Desde Calidad → PG01-R02 se pueden crear documentos externos con código, nombre,
organismo, URL y periodicidad de revisión. El PDF original es opcional al crear el
registro y puede cargarse después desde la fila. Los documentos nuevos se crean en
borrador; su revisión y aprobación siguen disponibles en la ficha documental.

Cada fila permite cargar/reemplazar y descargar el PDF original (máximo 20 MiB).
La carga valida extensión, tamaño y cabecera PDF en el servidor. El original se
almacena como fuente de la versión actual, sin modificar su aprobación ni el PDF
publicado. El reemplazo queda auditado y conserva el archivo anterior. Los PDF ya
publicados siguen disponibles cuando no hay un original adjunto.

«Descargar listado PDF» abre una vista previa con el logo y nombre de la empresa,
el código PG01-R02, la versión del registro y fecha de emisión. El botón «Descargar
PDF» de esa vista genera el archivo. La exportación Excel se mantiene.

## Primer despliegue: conservar adjuntos existentes

Los Compose de producción y staging ahora montan `./storage` en
`/tmp/lealcontrol-storage`, con una carpeta independiente en cada instalación.
Antes de reconstruir la API por primera vez, copiar sus archivos actuales:

```bash
# Staging: luego de git pull, ANTES de docker compose up
cd /opt/lealcontrol-staging
bash scripts/prepare-document-storage.sh staging
docker compose -f docker-compose.staging.yml --env-file .env up -d --build api web
```

```bash
# Producción: luego de validar staging y hacer git pull, ANTES de docker compose up
cd /opt/lealcontrol-v2
bash scripts/prepare-document-storage.sh prod
docker compose -f docker-compose.prod.yml --env-file .env up -d --build api web
```

El script aborta si no encuentra una API en ejecución y es seguro repetirlo cuando
el montaje ya está configurado. Durante la primera copia evitar nuevas cargas de
archivos hasta finalizar el despliegue. Incluir `storage/` junto con el respaldo de
la base de datos; los archivos no se incluyen en Git ni en las imágenes Docker.
No se necesita una migración de esquema para esta mejora.

## Verificación

```bash
npm ci --prefix frontend
npm run build --prefix frontend
dotnet test tests/LealControl.Modules.Quality.Tests/LealControl.Modules.Quality.Tests.csproj
```

Las pruebas de integración requieren Docker y crean una base PostgreSQL temporal.
Cubren alta, originales en documentos vigentes, reemplazo auditado, descarga,
rechazo de archivos inválidos/excesivos, permisos e aislamiento entre empresas.
