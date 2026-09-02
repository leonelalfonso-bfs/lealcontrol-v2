#!/usr/bin/env bash
# Restaura el dump pg_dump más reciente en una base TEMPORAL y valida filas clave.
# Uso: ./scripts/verify-restore.sh staging|prod
set -euo pipefail

TARGET="${1:-staging}"
BACKUP_BASE="${LEAL_BACKUP_BASE_DIR:-/var/backups/lealcontrol}"
STAGING_DIR="${LEAL_STAGING_DIR:-/opt/lealcontrol-staging}"
PROD_DIR="${LEAL_PROD_DIR:-/opt/lealcontrol-v2}"
LOG_FILE="${BACKUP_BASE}/verify-restore.log"
MIN_DUMP_BYTES=10240

case "$TARGET" in
  staging)
    APP_DIR="$STAGING_DIR"
    COMPOSE="docker-compose.staging.yml"
    DUMP_LABEL="staging-v2"
    ;;
  prod|erp)
    APP_DIR="$PROD_DIR"
    COMPOSE="docker-compose.prod.yml"
    DUMP_LABEL="prod-erp"
    ;;
  *)
    echo "Uso: $0 [staging|prod]" >&2
    exit 1
    ;;
esac

TEMP_DB=""
cleanup_temp_db() {
  if [[ -z "$TEMP_DB" ]]; then
    return 0
  fi
  if [[ -d "$APP_DIR" ]]; then
    (
      cd "$APP_DIR"
      # shellcheck disable=SC1091
      source <(grep -E '^POSTGRES_' .env | sed 's/\r$//')
      docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
        psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"${TEMP_DB}\";" \
        >/dev/null 2>&1 || true
    )
  fi
}
trap cleanup_temp_db EXIT

is_valid_pg_dump() {
  local file="$1"
  local size_bytes
  size_bytes="$(wc -c < "$file" | tr -d ' ')"
  if [[ "$size_bytes" -lt "$MIN_DUMP_BYTES" ]]; then
    return 1
  fi
  if [[ "$file" == *leal_restore_verify* ]]; then
    return 1
  fi
  if ! gzip -t "$file" 2>/dev/null; then
    return 1
  fi

  local head_sample copy_count
  head_sample="$(gzip -dc "$file" | head -n 50)"
  if echo "$head_sample" | grep -q '`'; then
    return 1
  fi
  if ! echo "$head_sample" | grep -Eqi 'PostgreSQL database dump|^COPY |^SET '; then
    return 1
  fi
  copy_count="$(gzip -dc "$file" | grep -c '^COPY ' || true)"
  [[ "$copy_count" -ge 1 ]]
}

find_latest_valid_dump() {
  local candidate
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    if is_valid_pg_dump "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done < <(find "$BACKUP_BASE" -path "*/${DUMP_LABEL}/*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null \
    | sort -rn \
    | cut -d' ' -f2-)
  return 1
}

cleanup_orphan_verify_databases() {
  local orphan
  while IFS= read -r orphan; do
    orphan="$(echo "$orphan" | xargs)"
    [[ -z "$orphan" ]] && continue
    echo "Limpiando base huérfana de verificación: $orphan"
    docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
      psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"${orphan}\";" >/dev/null
  done < <(docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
    psql -U "$POSTGRES_USER" -d postgres -t -A -c \
    "SELECT datname FROM pg_database WHERE datname LIKE 'leal_restore_verify_%' ORDER BY datname;")
}

exec >> >(tee -a "$LOG_FILE") 2>&1
echo "=== verify-restore $TARGET $(date -Is) ==="

cd "$APP_DIR"
# shellcheck disable=SC1091
source <(grep -E '^POSTGRES_' .env | sed 's/\r$//')

cleanup_orphan_verify_databases

LATEST=""
if ! LATEST="$(find_latest_valid_dump)"; then
  echo "ERROR: no hay dumps pg_dump válidos (>= ${MIN_DUMP_BYTES} bytes, con COPY) en $BACKUP_BASE/*/${DUMP_LABEL}/"
  echo "Ejecutá primero: bash scripts/backup-lealcontrol.sh $TARGET"
  exit 1
fi

echo "Dump: $LATEST"
TEMP_DB="leal_restore_verify_$(date +%s)"

docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"${TEMP_DB}\";"

gzip -dc "$LATEST" | docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d "$TEMP_DB" -v ON_ERROR_STOP=1 >/dev/null

echo "--- Conteo filas clave (tenant) ---"
docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d "$TEMP_DB" -c "
    SELECT 'tenant_users' AS tabla, COUNT(*) FROM public.tenant_users
    UNION ALL SELECT 'invoices', COUNT(*) FROM sales.invoices
    UNION ALL SELECT 'financial_accounts', COUNT(*) FROM finance.\"FinancialAccounts\"
    UNION ALL SELECT 'journal_entries', COUNT(*) FROM accounting.journal_entries;
  "

if docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d "$TEMP_DB" -t -A -c \
  "SELECT to_regclass('public.master_tenants') IS NOT NULL;" | grep -qx 't'; then
  echo "--- Conteo master_tenants ---"
  docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
    psql -U "$POSTGRES_USER" -d "$TEMP_DB" -c \
    "SELECT 'master_tenants' AS tabla, COUNT(*) FROM public.master_tenants;"
else
  echo "master_tenants: N/A (dump de base tenant; verificar también dump de POSTGRES_DB)"
fi

docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"${TEMP_DB}\";"

TEMP_DB=""
trap - EXIT

echo "OK verify-restore $TARGET"
