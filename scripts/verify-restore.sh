#!/usr/bin/env bash
# Restaura el dump pg_dump más reciente en una base TEMPORAL y valida filas clave.
# Uso: ./scripts/verify-restore.sh staging|prod
set -euo pipefail

TARGET="${1:-staging}"
BACKUP_BASE="${LEAL_BACKUP_BASE_DIR:-/var/backups/lealcontrol}"
STAGING_DIR="${LEAL_STAGING_DIR:-/opt/lealcontrol-staging}"
PROD_DIR="${LEAL_PROD_DIR:-/opt/lealcontrol-v2}"
LOG_FILE="${BACKUP_BASE}/verify-restore.log"

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

exec >> >(tee -a "$LOG_FILE") 2>&1
echo "=== verify-restore $TARGET $(date -Is) ==="

LATEST="$(find "$BACKUP_BASE" -path "*/${DUMP_LABEL}/*.sql.gz" -type f 2>/dev/null | sort | tail -1 || true)"
if [[ -z "$LATEST" ]]; then
  echo "ERROR: no hay dumps pg_dump en $BACKUP_BASE/*/${DUMP_LABEL}/"
  echo "Ejecutá primero: bash scripts/backup-lealcontrol.sh $TARGET"
  exit 1
fi

echo "Dump: $LATEST"
gzip -t "$LATEST"

HEAD_SAMPLE="$(gzip -dc "$LATEST" | head -n 50)"
if echo "$HEAD_SAMPLE" | grep -q '`'; then
  echo "ERROR: el dump usa backticks (formato MySQL). Se espera pg_dump de backup-lealcontrol.sh."
  exit 1
fi
if ! echo "$HEAD_SAMPLE" | grep -Eqi 'PostgreSQL database dump|^COPY |^SET '; then
  echo "ERROR: el archivo no parece un dump de pg_dump."
  exit 1
fi

cd "$APP_DIR"
# shellcheck disable=SC1091
source <(grep -E '^POSTGRES_' .env | sed 's/\r$//')
TEMP_DB="leal_restore_verify_$(date +%s)"

docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"${TEMP_DB}\";"

gzip -dc "$LATEST" | docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d "$TEMP_DB" -v ON_ERROR_STOP=1 >/dev/null

echo "--- Conteo filas clave ---"
docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d "$TEMP_DB" -c "
    SELECT 'tenant_users' AS tabla, COUNT(*) FROM public.tenant_users
    UNION ALL SELECT 'invoices', COUNT(*) FROM sales.invoices
    UNION ALL SELECT 'financial_accounts', COUNT(*) FROM finance.\"FinancialAccounts\"
    UNION ALL SELECT 'journal_entries', COUNT(*) FROM accounting.journal_entries
    UNION ALL SELECT 'master_tenants', COUNT(*) FROM public.master_tenants;
  "

docker compose -f "$COMPOSE" exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE \"${TEMP_DB}\";"

TEMP_DB=""
trap - EXIT

echo "OK verify-restore $TARGET"
