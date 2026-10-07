#!/usr/bin/env bash
# Deploy de LealControl en el VPS. Lo ejecuta GitHub Actions por SSH con una clave restringida:
# en authorized_keys la clave tiene command="/usr/local/bin/leal-deploy",restrict, así que
# quien tenga la clave solo puede pedir "prod <sha>" o "staging <sha>", nunca abrir una consola.
#
# Instalación (una vez, como root):
#   install -m 755 /opt/lealcontrol-v2/deploy/vps-deploy.sh /usr/local/bin/leal-deploy
#
# Uso manual: leal-deploy prod <sha40> | leal-deploy staging <sha40>
set -euo pipefail

REQUEST="${SSH_ORIGINAL_COMMAND:-$*}"
read -r TARGET SHA EXTRA <<<"$REQUEST" || true

if [[ -n "${EXTRA:-}" ]]; then
  echo "Uso: prod|staging <sha de 40 caracteres>" >&2
  exit 2
fi

case "${TARGET:-}" in
  prod)
    APP_DIR=/opt/lealcontrol-v2
    COMPOSE=docker-compose.prod.yml
    API_PORT=5209
    ;;
  staging)
    APP_DIR=/opt/lealcontrol-staging
    COMPOSE=docker-compose.staging.yml
    API_PORT=5210
    ;;
  *)
    echo "Uso: prod|staging <sha de 40 caracteres>" >&2
    exit 2
    ;;
esac

if [[ ! "${SHA:-}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Commit inválido: se espera el SHA completo de 40 caracteres." >&2
  exit 2
fi

# Un deploy por entorno a la vez.
exec 9>"/var/lock/leal-deploy-${TARGET}.lock"
if ! flock -n 9; then
  echo "Ya hay un deploy de ${TARGET} en curso." >&2
  exit 3
fi

cd "$APP_DIR"
compose() { docker compose -f "$COMPOSE" --env-file .env "$@"; }

PREVIOUS="$(git rev-parse HEAD)"
echo "$PREVIOUS" > "/root/${TARGET}-sha-previo.txt"
echo "== ${TARGET}: versión actual $(git log -1 --format='%h %s' "$PREVIOUS")"

git fetch --quiet origin
if ! git cat-file -e "${SHA}^{commit}" 2>/dev/null; then
  echo "El commit ${SHA} no existe en origin." >&2
  exit 2
fi

# Producción solo recibe código que ya está en main (revisado y fusionado).
if [[ "$TARGET" == "prod" ]] && ! git merge-base --is-ancestor "$SHA" origin/main; then
  echo "En producción solo se despliegan commits de main." >&2
  exit 2
fi

if [[ "$SHA" == "$PREVIOUS" ]]; then
  echo "== ${TARGET} ya está en ${SHA:0:7}; se reconstruye igual por si cambió la configuración."
fi

# Backup de la base antes de tocar producción (se conservan los últimos 10).
if [[ "$TARGET" == "prod" ]]; then
  mkdir -p /root/backups/pre-deploy
  BACKUP="/root/backups/pre-deploy/prod-$(date +%F-%H%M%S)-${PREVIOUS:0:7}.sql.gz"
  compose exec -T postgres sh -c 'pg_dumpall -U "$POSTGRES_USER"' | gzip > "$BACKUP"
  echo "== Backup: $BACKUP ($(du -h "$BACKUP" | cut -f1))"
  ls -1t /root/backups/pre-deploy/prod-*.sql.gz | tail -n +11 | xargs -r rm -f --
fi

deploy_version() {
  git checkout --quiet --detach "$1"
  compose up -d --build
  bash scripts/smoke-health.sh "$API_PORT" 9
}

echo "== Desplegando $(git log -1 --format='%h %s' "$SHA")"
if deploy_version "$SHA"; then
  echo "== OK: ${TARGET} en $(git log -1 --format='%h %s')"
  compose ps --format "table {{.Name}}\t{{.Status}}"
  exit 0
fi

echo "== El deploy falló: volviendo a ${PREVIOUS:0:7}" >&2
if deploy_version "$PREVIOUS"; then
  echo "== Se restauró la versión anterior. Revisá el log de este deploy." >&2
else
  echo "== ATENCIÓN: tampoco levantó la versión anterior. Revisar el VPS a mano." >&2
fi
exit 1
