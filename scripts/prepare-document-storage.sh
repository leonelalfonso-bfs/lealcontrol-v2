#!/usr/bin/env bash
# Run BEFORE the first deployment that adds ./storage to the API container.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
case "${1:-}" in
  prod|staging) compose_file="docker-compose.$1.yml" ;;
  *) echo "Uso: bash scripts/prepare-document-storage.sh prod|staging" >&2; exit 2 ;;
esac
mkdir -p storage
container_id=$(docker compose -f "$compose_file" --env-file .env ps -q api)
if [[ -z "$container_id" ]]; then
  echo "No hay API en ejecución. Si hay un contenedor anterior con adjuntos, iniciarlo y repetir antes de desplegar." >&2
  exit 1
fi
mounted_source=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/tmp/lealcontrol-storage"}}{{.Source}}{{end}}{{end}}' "$container_id")
if [[ "$mounted_source" == "$(pwd)/storage" ]]; then
  echo "Almacenamiento persistente ya configurado."
  exit 0
fi
# docker exec must succeed; do not silently deploy if the container is inaccessible.
has_storage=$(docker exec "$container_id" sh -c 'if [ -d /tmp/lealcontrol-storage ]; then echo yes; else echo no; fi')
if [[ "$has_storage" == "yes" ]]; then
  docker cp "$container_id:/tmp/lealcontrol-storage/." ./storage/
  echo "Adjuntos existentes copiados a $(pwd)/storage."
else
  echo "La API todavía no tiene archivos almacenados. Carpeta persistente preparada."
fi
