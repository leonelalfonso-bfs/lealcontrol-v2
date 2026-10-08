# Respaldos (8 de octubre de 2026)

## Cómo funciona

- **Cron diario a las 3:00** (root): `/usr/local/bin/leal-backup.sh all`, con `LEAL_BACKUP_CONFIG=/etc/lealcontrol/backup.env`. Log en `/var/backups/lealcontrol/backup.log`.
- **Qué respalda:** `pg_dump` de cada base de producción (`/opt/lealcontrol-v2`) y de staging (`/opt/lealcontrol-staging`). Cada archivo se verifica: gzip válido, más de 10 KB y con sentencias `COPY`.
- **Dónde queda:**
  - local, en `/var/backups/lealcontrol/<fecha>/{prod-erp,staging-v2}`, 14 días;
  - Google Drive **cifrado** con rclone, remoto `gdrive-crypt:lealcontrol/daily/<fecha>` (sobre `gdrive:LealControl-Backups/encrypted`), 30 días.
- **Contraseñas del cifrado:** en `/root/.config/rclone/rclone.conf` y, desde el 8/10/2026, también en el gestor de contraseñas del dueño. Sin ellas, lo que hay en Drive no se puede leer.
- **El script no se actualiza con el deploy.** Después de cambiar `scripts/backup-lealcontrol.sh`, hay que reinstalarlo:

  ```bash
  install -m 755 scripts/backup-lealcontrol.sh /usr/local/bin/leal-backup.sh
  ```

## Bug corregido (#91)

`docker compose exec` dentro del `while read` consumía la lista de bases. Hasta el 8/10/2026 solo se respaldaba **la primera base de cada servidor**: en producción, `leal_tenant_ambalanzas`. El log igual decía OK.

Ahora:
- `pg_dump` lee de `/dev/null`;
- el script compara las bases respaldadas con las listadas;
- si falta alguna o falla rclone, termina con código 1 y el log dice "fin CON ERRORES".

## Prueba de restauración (8/10/2026)

1. Respaldo de las 10:17, con las 6 bases de producción.
2. Se descargó de Drive con descifrado y se restauró `leal_tenant_bfs` en una base temporal.
3. Resultado: igual a producción (148 tablas, 1 factura, 1 usuario). Después se borró la base temporal.

Comandos: pasos 1 a 4 en la conversación del 8/10. Para restaurar de verdad: `docs/RUNBOOK_RESTORE.md`.

## Alertas (Healthchecks.io)

| Check | Quién lo avisa | Período / gracia |
|---|---|---|
| Respaldo diario | `leal-backup.sh`: `/start` al empezar y el código de salida al terminar. Variable `LEAL_HC_BACKUP_URL` en `backup.env` | 1 día / 3 h |
| Sistema | `/usr/local/bin/leal-monitor.sh`, cron cada 5 minutos: API de producción `Healthy`, disco por debajo del 85% y certificado HTTPS con más de 14 días. Variable `LEAL_HC_SYSTEM_URL` en `/etc/lealcontrol/monitor.env` | 5 min / 10 min |

- Si el VPS se cae, los pings dejan de llegar y Healthchecks avisa igual.
- El `/health` público devuelve la página web, no el estado de la API: por eso el chequeo corre desde el VPS.

## Disco

- El 8/10/2026 el disco estaba al 80%: 24 GB eran caché de compilación de Docker de los deploys. Se limpió con `docker builder prune -af` y `docker image prune -f`, sin `-a`, para conservar la imagen de vuelta atrás. Quedó en 29%.
- Cron semanal, domingos 4:30: `docker builder prune -af --filter until=168h`.

## Cron de root en el VPS

```
0 3 * * *    respaldo (leal-backup.sh all)
*/5 * * * *  monitor (leal-monitor.sh)
30 4 * * 0   limpieza de caché de Docker
```

## Pendiente

- Probar el descifrado desde una máquina que no sea el VPS, usando solo las contraseñas guardadas.
- Drive no impide que alguien con acceso al VPS borre los respaldos. Para vender el sistema, evaluar Backblaze B2 con Object Lock.
