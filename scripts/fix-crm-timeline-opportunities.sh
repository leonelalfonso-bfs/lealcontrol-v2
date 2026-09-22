#!/usr/bin/env bash
# Hotfix: columnas CRM faltantes (timeline / opportunities 500).
# Uso en VPS prod:
#   cd /opt/lealcontrol-v2 && bash scripts/fix-crm-timeline-opportunities.sh
# Opcional: TENANT_DB=nombre_db bash scripts/fix-crm-timeline-opportunities.sh

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
PG_USER="${POSTGRES_USER:-lealv2}"

SQL=$(cat <<'EOSQL'
CREATE SCHEMA IF NOT EXISTS crm;
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS "OwnerName" character varying(120);
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS "Priority" character varying(20) DEFAULT 'Normal';
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS "Probability" integer DEFAULT 10;
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS "RottingDays" integer;
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS "ExpectedCloseDate" timestamp with time zone;
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS "CustomFields" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE crm.opportunities ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}'::text[];
ALTER TABLE crm.activities ADD COLUMN IF NOT EXISTS "DueDate" timestamp with time zone;
ALTER TABLE crm.activities ADD COLUMN IF NOT EXISTS "IsDone" boolean DEFAULT false;
ALTER TABLE crm.activities ADD COLUMN IF NOT EXISTS "CompletedAtUtc" timestamp with time zone;
UPDATE crm.opportunities SET "Priority" = 'Normal' WHERE "Priority" IS NULL OR btrim("Priority") = '';
UPDATE crm.opportunities SET "Probability" = 10 WHERE "Probability" IS NULL;
UPDATE crm.opportunities SET "CustomFields" = '{}'::jsonb WHERE "CustomFields" IS NULL;
UPDATE crm.opportunities SET tags = '{}'::text[] WHERE tags IS NULL;
UPDATE crm.activities SET "IsDone" = false WHERE "IsDone" IS NULL;
EOSQL
)

run_on_db() {
  local db="$1"
  echo "==> Aplicando hotfix CRM en DB: $db"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$PG_USER" -d "$db" -v ON_ERROR_STOP=1 -c "$SQL"
}

if [[ -n "${TENANT_DB:-}" ]]; then
  run_on_db "$TENANT_DB"
  exit 0
fi

# Todas las bases excepto templates/system
mapfile -t DBS < <(docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$PG_USER" -d postgres -Atc \
  "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');")

for db in "${DBS[@]}"; do
  [[ -z "$db" ]] && continue
  # Solo DBs que ya tienen schema crm
  has_crm=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$PG_USER" -d "$db" -Atc \
    "SELECT 1 FROM information_schema.schemata WHERE schema_name = 'crm' LIMIT 1;" || true)
  if [[ "$has_crm" == "1" ]]; then
    run_on_db "$db" || echo "WARN: fallo en $db (se continúa)"
  else
    echo "-- skip $db (sin schema crm)"
  fi
done

echo "Listo."
