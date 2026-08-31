#!/bin/bash
# ==============================================================================
# LEAL Control — backup automático de todas las bases PostgreSQL (Docker)
#
# Uso:
#   ./scripts/backup-lealcontrol.sh staging
#   ./scripts/backup-lealcontrol.sh prod
#   ./scripts/backup-lealcontrol.sh all
#
# Variables opcionales (o en /etc/lealcontrol/backup.env):
#   LEAL_BACKUP_BASE_DIR=/var/backups/lealcontrol
#   LEAL_BACKUP_RETENTION_DAYS=14
#   LEAL_RCLONE_REMOTE=gdrive:LEAL_BACKUPS
# ==============================================================================

set -euo pipefail

STAGING_DIR="${LEAL_STAGING_DIR:-/opt/lealcontrol-staging}"
PROD_DIR="${LEAL_PROD_DIR:-/opt/lealcontrol-v2}"
BACKUP_BASE_DIR="${LEAL_BACKUP_BASE_DIR:-/var/backups/lealcontrol}"
RETENTION_DAYS="${LEAL_BACKUP_RETENTION_DAYS:-14}"
RCLONE_REMOTE="${LEAL_RCLONE_REMOTE:-gdrive:LEAL_BACKUPS}"
CONFIG_FILE="${LEAL_BACKUP_CONFIG:-/etc/lealcontrol/backup.env}"

TARGET="${1:-all}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
TODAY_DIR="$BACKUP_BASE_DIR/$TIMESTAMP"
LOG_FILE="$BACKUP_BASE_DIR/backup.log"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

mkdir -p "$BACKUP_BASE_DIR"
exec >> >(tee -a "$LOG_FILE") 2>&1

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

load_env_file() {
  local env_file="$1"
  POSTGRES_USER=""
  POSTGRES_PASSWORD=""
  POSTGRES_DB=""
  if [[ ! -f "$env_file" ]]; then
    log "ERROR: no existe $env_file"
    return 1
  fi
  POSTGRES_USER="$(grep -E '^POSTGRES_USER=' "$env_file" | head -1 | cut -d= -f2- | tr -d '\r')"
  POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "$env_file" | head -1 | cut -d= -f2- | tr -d '\r')"
  POSTGRES_DB="$(grep -E '^POSTGRES_DB=' "$env_file" | head -1 | cut -d= -f2- | tr -d '\r')"
  if [[ -z "$POSTGRES_USER" || -z "$POSTGRES_PASSWORD" ]]; then
    log "ERROR: POSTGRES_USER o POSTGRES_PASSWORD vacíos en $env_file"
    return 1
  fi
}

backup_stack() {
  local label="$1"
  local app_dir="$2"
  local compose_file="$3"

  log "========== Backup: $label ($app_dir) =========="
  if [[ ! -d "$app_dir" ]]; then
    log "AVISO: carpeta $app_dir no existe, se omite."
    return 0
  fi

  load_env_file "$app_dir/.env" || return 1

  local stack_dir="$TODAY_DIR/$label"
  mkdir -p "$stack_dir"

  cd "$app_dir"

  if ! docker compose -f "$compose_file" exec -T \
    -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
    pg_isready -U "$POSTGRES_USER" >/dev/null 2>&1; then
    log "AVISO: postgres no responde en $label"
    return 0
  fi

  local databases
  databases="$(docker compose -f "$compose_file" exec -T \
    -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
    psql -U "$POSTGRES_USER" -d postgres -t -A -c \
    "SELECT datname FROM pg_database WHERE datistemplate = false AND (datname LIKE 'leal%' OR datname = '$POSTGRES_DB') ORDER BY datname;")"

  local count=0
  while IFS= read -r db; do
    db="$(echo "$db" | xargs)"
    [[ -z "$db" ]] && continue
    if [[ "$db" == "postgres" ]]; then
      continue
    fi

    local file_name="${db}_${TIMESTAMP}.sql.gz"
    local file_path="$stack_dir/$file_name"
    log " -> Dump $db ..."

    docker compose -f "$compose_file" exec -T \
      -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
      pg_dump -U "$POSTGRES_USER" -d "$db" --no-owner --no-privileges \
      | gzip -9 > "$file_path"

    log "    OK $(du -h "$file_path" | awk '{print $1}') $file_name"
    count=$((count + 1))
  done <<< "$databases"

  log "Stack $label: $count base(s) respaldada(s)."
}

log "=========================================================="
log "LEAL BACKUP inicio $TIMESTAMP (target=$TARGET)"
log "=========================================================="
mkdir -p "$TODAY_DIR"

case "$TARGET" in
  staging)
    backup_stack "staging-v2" "$STAGING_DIR" "docker-compose.staging.yml"
    ;;
  prod|erp)
    backup_stack "prod-erp" "$PROD_DIR" "docker-compose.prod.yml"
    ;;
  all)
    backup_stack "staging-v2" "$STAGING_DIR" "docker-compose.staging.yml"
    backup_stack "prod-erp" "$PROD_DIR" "docker-compose.prod.yml"
    ;;
  *)
    echo "Uso: $0 [staging|prod|all]" >&2
    exit 1
    ;;
esac

if command -v rclone >/dev/null 2>&1; then
  log "Sincronizando con $RCLONE_REMOTE/daily/$TIMESTAMP ..."
  if rclone copy "$TODAY_DIR" "$RCLONE_REMOTE/daily/$TIMESTAMP" --transfers 4 --checkers 8; then
    log "Google Drive OK"
    rclone delete --min-age 30d "$RCLONE_REMOTE/daily" 2>/dev/null || true
  else
    log "AVISO: rclone falló; respaldo local conservado en $TODAY_DIR"
  fi
else
  log "AVISO: rclone no instalado. Solo backup local: $TODAY_DIR"
fi

log "Purgando carpetas locales > ${RETENTION_DAYS} días ..."
find "$BACKUP_BASE_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

log "LEAL BACKUP fin OK"
log "=========================================================="
