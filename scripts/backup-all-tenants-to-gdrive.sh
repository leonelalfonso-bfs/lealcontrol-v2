#!/bin/bash
# ==============================================================================
# LEAL Control ERP v2.0 - Backup multi-tenant a Google Drive
#
# Este script no contiene credenciales. Lee configuración desde:
#   1) variables de entorno ya exportadas, y/o
#   2) LEAL_BACKUP_CONFIG, por defecto /etc/lealcontrol/backup.env, y/o
#   3) LEAL_APP_ENV_FILE, por defecto ./.env
#
# Uso:
#   LEAL_APP_ENV_FILE=/opt/lealcontrol-v2/.env ./scripts/backup-all-tenants-to-gdrive.sh
#   LEAL_BACKUP_CONFIG=/etc/lealcontrol/backup.env ./scripts/backup-all-tenants-to-gdrive.sh
# ==============================================================================

set -euo pipefail

CONFIG_FILE="${LEAL_BACKUP_CONFIG:-/etc/lealcontrol/backup.env}"
APP_ENV_FILE="${LEAL_APP_ENV_FILE:-.env}"

if [[ -f "$CONFIG_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

if [[ -f "$APP_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$APP_ENV_FILE"
  set +a
fi

PG_HOST="${PG_HOST:-${POSTGRES_HOST:-localhost}}"
PG_PORT="${PG_PORT:-${POSTGRES_PORT:-5432}}"
PG_USER="${PG_USER:-${POSTGRES_USER:-}}"
PG_PASSWORD="${PG_PASSWORD:-${POSTGRES_PASSWORD:-}}"
BACKUP_BASE_DIR="${LEAL_BACKUP_BASE_DIR:-/var/backups/lealcontrol}"
RCLONE_REMOTE="${LEAL_RCLONE_REMOTE:-gdrive:LEAL_BACKUPS}"
RETENTION_DAYS_LOCAL="${LEAL_BACKUP_RETENTION_DAYS:-14}"
TIMESTAMP="$(date +"%Y%m%d_%H%M%S")"
TODAY_DIR="$BACKUP_BASE_DIR/$TIMESTAMP"

usage() {
  cat <<'USAGE'
Uso: backup-all-tenants-to-gdrive.sh [--dry-run]

Variables requeridas, vía entorno, LEAL_BACKUP_CONFIG o LEAL_APP_ENV_FILE:
  POSTGRES_USER o PG_USER
  POSTGRES_PASSWORD o PG_PASSWORD

Variables opcionales:
  PG_HOST / POSTGRES_HOST              default: localhost
  PG_PORT / POSTGRES_PORT              default: 5432
  LEAL_BACKUP_BASE_DIR                 default: /var/backups/lealcontrol
  LEAL_BACKUP_RETENTION_DAYS           default: 14
  LEAL_RCLONE_REMOTE                   default: gdrive:LEAL_BACKUPS
USAGE
}

DRY_RUN=0
case "${1:-}" in
  "") ;;
  --dry-run) DRY_RUN=1 ;;
  -h|--help) usage; exit 0 ;;
  *) usage >&2; exit 1 ;;
esac

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

require_config() {
  if [[ -z "$PG_USER" || -z "$PG_PASSWORD" ]]; then
    log "ERROR: faltan POSTGRES_USER/PG_USER o POSTGRES_PASSWORD/PG_PASSWORD."
    log "       Configurá $CONFIG_FILE, $APP_ENV_FILE o variables de entorno."
    exit 1
  fi
}

run_psql() {
  PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" "$@"
}

run_pg_dump() {
  local db="$1"
  PGPASSWORD="$PG_PASSWORD" pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$db" --no-owner --no-privileges
}

require_config

log "=========================================================="
log "[LEAL BACKUP] Iniciando respaldo multi-bases: $TIMESTAMP"
log "=========================================================="

if [[ "$DRY_RUN" -eq 1 ]]; then
  log "Modo dry-run: no se crearán dumps ni se sincronizará con rclone."
else
  mkdir -p "$TODAY_DIR"
fi

DATABASES="$(run_psql -d postgres -t -A -c "
    SELECT datname FROM pg_database
    WHERE datistemplate = false
      AND (datname LIKE 'leal_tenant_%' OR datname LIKE 'leal%' OR datname = current_database())
    ORDER BY datname;
")"

COUNT=0
while IFS= read -r DB; do
  DB="$(echo "$DB" | xargs)"
  [[ -z "$DB" || "$DB" == "postgres" ]] && continue

  FILE_NAME="${DB}_${TIMESTAMP}.sql.gz"
  FILE_PATH="$TODAY_DIR/$FILE_NAME"

  if [[ "$DRY_RUN" -eq 1 ]]; then
    log " -> Se respaldaría: $DB"
  else
    log " -> Respaldando base de datos: $DB ..."
    run_pg_dump "$DB" | gzip -9 > "$FILE_PATH"
    log "    OK $FILE_NAME ($(du -h "$FILE_PATH" | awk '{print $1}'))"
  fi
  COUNT=$((COUNT + 1))
done <<< "$DATABASES"

log "[LEAL BACKUP] $COUNT base(s) detectada(s)."

if [[ "$DRY_RUN" -eq 0 ]]; then
  if command -v rclone >/dev/null 2>&1; then
    log "Sincronizando con Google Drive ($RCLONE_REMOTE/daily/$TIMESTAMP) ..."
    if rclone copy "$TODAY_DIR" "$RCLONE_REMOTE/daily/$TIMESTAMP" --transfers 4 --checkers 8; then
      log "Sincronización a Google Drive completada."
      rclone delete --min-age 30d "$RCLONE_REMOTE/daily" 2>/dev/null || true
    else
      log "AVISO: rclone falló; respaldo local conservado en $TODAY_DIR"
    fi
  else
    log "AVISO: rclone no está instalado. Backup local conservado en $TODAY_DIR"
  fi

  log "Purgando respaldos locales de más de $RETENTION_DAYS_LOCAL días..."
  find "$BACKUP_BASE_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS_LOCAL" -exec rm -rf {} + 2>/dev/null || true
fi

log "[LEAL BACKUP] Proceso completado."
log "=========================================================="