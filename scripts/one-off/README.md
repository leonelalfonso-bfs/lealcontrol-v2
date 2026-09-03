# Scripts one-off (ya ejecutados o de uso excepcional)

**No volver a correr** salvo indicación explícita del equipo y backup previo.

| Script | Propósito | Estado |
|--------|-----------|--------|
| `migrate-tenant-id.sql` | Reasigna masivamente `TenantId` viejo → canónico en todas las tablas | Ejecutado en migración histórica |
| `migrate-tenant-id-safe.sql` | Igual pero tabla por tabla, tolera errores parciales | Ejecutado en migración histórica |

Uso original (referencia):

```bash
psql ... -v old_id='UUID_VIEJO' -v new_id='11111111-1111-1111-1111-111111111111' \
  -f scripts/one-off/migrate-tenant-id.sql
```
