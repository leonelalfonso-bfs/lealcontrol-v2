# Runbook — Restauración de base de datos LEAL Control

## Cuándo usar este procedimiento

- Pérdida de datos o corrupción confirmada
- Rollback de un deploy que dañó el esquema
- Verificación mensual (`scripts/verify-restore.sh`)

## Prerrequisitos

- Acceso SSH al VPS
- Backup reciente en `/var/backups/lealcontrol/` o Google Drive (`rclone`)
- Ventana de mantenimiento (la API debe detenerse)

## Staging (`/opt/lealcontrol-staging`)

```bash
cd /opt/lealcontrol-staging
docker compose -f docker-compose.staging.yml stop api web

# Elegir dump (ejemplo)
DUMP=/var/backups/lealcontrol/20260902_120000/staging-v2/lealcontrol_staging_20260902_120000.sql.gz
gzip -t "$DUMP"

source .env
docker compose -f docker-compose.staging.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();"

docker compose -f docker-compose.staging.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}_old\";"
docker compose -f docker-compose.staging.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "ALTER DATABASE \"$POSTGRES_DB\" RENAME TO \"${POSTGRES_DB}_old\";"

docker compose -f docker-compose.staging.yml exec -T postgres \
  psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$POSTGRES_DB\" OWNER \"$POSTGRES_USER\";"

gzip -dc "$DUMP" | docker compose -f docker-compose.staging.yml exec -T \
  -e PGPASSWORD="$POSTGRES_PASSWORD" postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

docker compose -f docker-compose.staging.yml up -d
bash scripts/smoke-health.sh 5210 9
```

## Producción (`/opt/lealcontrol-v2`)

Mismo flujo sustituyendo `docker-compose.prod.yml` y puerto `5209`.

## Verificación sin tocar producción

Usa el dump más reciente generado por `scripts/backup-lealcontrol.sh` en
`/var/backups/lealcontrol/<timestamp>/staging-v2/` (o `prod-erp/`). **No** uses
dumps legacy de `snapshots/` con sintaxis MySQL.

```bash
# Generar dump pg_dump si no hay uno reciente
bash scripts/backup-lealcontrol.sh staging

./scripts/verify-restore.sh staging
# Cron mensual sugerido:
# 0 4 1 * * /opt/lealcontrol-staging/scripts/verify-restore.sh staging >> /var/backups/lealcontrol/verify-restore.log 2>&1
```

## Post-restauración

1. Confirmar `/health` con 9 DbContexts Healthy
2. Login de prueba con admin
3. Revisar últimos recibos/facturas en UI
4. Documentar incidente y dump usado
