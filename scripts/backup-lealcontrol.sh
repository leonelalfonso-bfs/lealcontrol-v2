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
#   LEAL_HC_BACKUP_URL=https://hc-ping.com/<uuid>   (alertas, opcional)
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

# Alertas (Healthchecks.io): LEAL_HC_BACKUP_URL en backup.env. Avisa el inicio y el
# resultado con el código de salida; si el respaldo no corre, Healthchecks avisa igual.
HC_BACKUP_URL="${LEAL_HC_BACKUP_URL:-}"
hc_ping() {
  [[ -z "$HC_BACKUP_URL" ]] && return 0
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "${2:-}" "${HC_BACKUP_URL}/$1" 2>/dev/null || true
}
report_result() {
  local code=$?
  hc_ping "$code" "$(grep -F "$TIMESTAMP" -A 200 "$LOG_FILE" 2>/dev/null | grep -E 'OK |ERROR|AVISO|fin' | tail -40)"
}
trap report_result EXIT
hc_ping start

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
    log "ERROR: postgres no responde en $label"
    return 1
  fi

  local databases
  databases="$(docker compose -f "$compose_file" exec -T \
    -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
    psql -U "$POSTGRES_USER" -d postgres -t -A -c \
    "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres') AND datname NOT LIKE 'leal_restore_verify_%' AND datname NOT LIKE '%\_old' ESCAPE '\\' ORDER BY datname;" \
    | tr -d '\r' | sed '/^$/d')"

  if [[ -n "$POSTGRES_DB" && "$POSTGRES_DB" != "postgres" ]] && ! grep -qx "$POSTGRES_DB" <<< "$databases"; then
    log "AVISO: POSTGRES_DB=$POSTGRES_DB no listada en pg_database; se intentará igualmente."
    databases="${POSTGRES_DB}"$'\n'"${databases}"
  fi

  log "Bases a respaldar:"
  echo "$databases" | sed '/^$/d' | while read -r line; do log "  - $line"; done

  local count=0
  local failed=0
  declare -A backed_up=()
  while IFS= read -r db || [[ -n "${db:-}" ]]; do
    db="$(echo "$db" | xargs)"
    [[ -z "$db" ]] && continue
    if [[ "$db" == "postgres" ]]; then
      continue
    fi
    if [[ -n "${backed_up[$db]:-}" ]]; then
      continue
    fi
    backed_up[$db]=1

    local file_name="${db}_${TIMESTAMP}.sql.gz"
    local file_path="$stack_dir/$file_name"
    log " -> Dump $db ..."

    # </dev/null: sin esto, `docker compose exec` lee la entrada estándar y se come el resto
    # de la lista de bases del while; solo se respaldaba la primera.
    docker compose -f "$compose_file" exec -T \
      -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
      pg_dump -U "$POSTGRES_USER" -d "$db" --no-owner --no-privileges </dev/null \
      | gzip -9 > "$file_path"

    if ! gzip -t "$file_path"; then
      log "AVISO: gzip corrupto en $file_path — se omite $db"
      rm -f "$file_path"
      failed=$((failed + 1))
      continue
    fi

    local size_bytes
    size_bytes="$(wc -c < "$file_path" | tr -d ' ')"
    if [[ "$size_bytes" -lt 10240 ]]; then
      log "AVISO: dump demasiado chico (${size_bytes} bytes) en $db — se omite"
      rm -f "$file_path"
      failed=$((failed + 1))
      continue
    fi

    local copy_count
    copy_count="$(gzip -dc "$file_path" | grep -c '^COPY ' || true)"
    if [[ "$copy_count" -lt 1 ]]; then
      log "AVISO: sin sentencias COPY en $db — se omite"
      rm -f "$file_path"
      failed=$((failed + 1))
      continue
    fi

    log "    OK $(du -h "$file_path" | awk '{print $1}') $file_name ($copy_count tablas COPY)"
    count=$((count + 1))
  done <<< "$databases"

  local expected
  expected="$(sed '/^$/d' <<< "$databases" | grep -vx 'postgres' | sort -u | wc -l | tr -d ' ')"

  if [[ "$count" -lt 1 ]]; then
    log "ERROR: ninguna base respaldada en $label (fallidas/omitidas: $failed)"
    return 1
  fi

  if [[ "$count" -ne "$expected" ]]; then
    log "ERROR: $label respaldó $count de $expected base(s) (fallidas: $failed)."
    return 1
  fi

  log "Stack $label: $count base(s) respaldada(s)."
}

log "=========================================================="
log "LEAL BACKUP inicio $TIMESTAMP (target=$TARGET)"
log "=========================================================="
mkdir -p "$TODAY_DIR"

# Un error en un stack no impide respaldar el otro; el estado final lo informa.
STATUS=0
case "$TARGET" in
  staging)
    backup_stack "staging-v2" "$STAGING_DIR" "docker-compose.staging.yml" || STATUS=1
    ;;
  prod|erp)
    backup_stack "prod-erp" "$PROD_DIR" "docker-compose.prod.yml" || STATUS=1
    ;;
  all)
    backup_stack "prod-erp" "$PROD_DIR" "docker-compose.prod.yml" || STATUS=1
    backup_stack "staging-v2" "$STAGING_DIR" "docker-compose.staging.yml" || STATUS=1
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
    log "ERROR: rclone falló; respaldo local conservado en $TODAY_DIR"
    STATUS=1
  fi
else
  log "ERROR: rclone no instalado. Solo backup local: $TODAY_DIR"
  STATUS=1
fi

log "Purgando carpetas locales > ${RETENTION_DAYS} días ..."
find "$BACKUP_BASE_DIR" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} + 2>/dev/null || true

if [[ "$STATUS" -ne 0 ]]; then
  log "LEAL BACKUP fin CON ERRORES"
  log "=========================================================="
  exit 1
fi
log "LEAL BACKUP fin OK"
log "=========================================================="
