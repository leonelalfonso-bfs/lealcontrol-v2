# Scripts one-off (ya ejecutados o de uso excepcional)

**No volver a correr** salvo indicación explícita del equipo y backup previo.

| Script | Propósito | Estado |
|--------|-----------|--------|
| `migrate-tenant-id.sql` | Reasigna masivamente `TenantId` viejo → canónico en todas las tablas | Ejecutado en migración histórica |
| `migrate-tenant-id-safe.sql` | Igual pero tabla por tabla, tolera errores parciales | Ejecutado en migración histórica |
| `wipe-staging-operational.sql` | Staging: borra datos operativos; **conserva** usuarios + empresa | Solo `/opt/lealcontrol-staging` |

Uso original (referencia):

```bash
psql ... -v old_id='UUID_VIEJO' -v new_id='11111111-1111-1111-1111-111111111111' \
  -f scripts/one-off/migrate-tenant-id.sql
```

Wipe selectivo staging (usuarios/empresa intactos):

```bash
cd /opt/lealcontrol-staging
git fetch origin && git reset --hard origin/main
source <(grep -E '^POSTGRES_' .env | sed 's/\r$//')
docker compose -f docker-compose.staging.yml --env-file .env exec -T postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -f - < scripts/one-off/wipe-staging-operational.sql
```
