#!/usr/bin/env bash
# Restaura el dump más reciente en una base TEMPORAL y valida filas clave.
# Uso: ./scripts/verify-restore.sh staging|prod
set -euo pipefail

TARGET="${1:-staging}"
BACKUP_BASE="${LEAL_BACKUP_BASE_DIR:-/var/backups/lealcontrol}"
STAGING_DIR="${LEAL_STAGING_DIR:-/opt/lealcontrol-staging}"
PROD_DIR="${LEAL_PROD_DIR:-/opt/lealcontrol-v2}"
LOG_FILE="${BACKUP_BASE}/verify-restore.log"

case "$TARGET" in
  staging) APP_DIR="$STAGING_DIR"; COMPOSE="docker-compose.staging.yml" ;;
  prod|erp) APP_DIR="$PROD_DIR"; COMPOSE="docker-compose.prod.yml" ;;
  *) echo "Uso: $0 [staging|prod]" >&2; exit 1 ;;
esac

exec >> >(tee -a "$LOG_FILE") 2>&1
echo "=== verify-restore $TARGET $(date -Is) ==="

LATEST="$(find "$BACKUP_BASE" -mindepth 2 -name '*.sql.gz' -type f 2>/dev/null | sort | tail -1)"
if [[ -z "$LATEST" ]]; then
  echo "ERROR: no hay dumps en $BACKUP_BASE"
  exit 1
fi

echo "Dump: $LATEST"
gzip -t "$LATEST"

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

echo "OK verify-restore $TARGET"
