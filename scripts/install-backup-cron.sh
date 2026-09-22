#!/bin/bash
# Instala cron diario para backup LEAL Control (ejecutar como root en el VPS).
set -euo pipefail

SCRIPT_SRC="${1:-/opt/lealcontrol-staging/scripts/backup-lealcontrol.sh}"
SCRIPT_DST="/usr/local/bin/leal-backup.sh"
CRON_TIME="${LEAL_BACKUP_CRON:-0 3 * * *}"

if [[ ! -f "$SCRIPT_SRC" ]]; then
  echo "No se encontró $SCRIPT_SRC"
  echo "Uso: $0 [/ruta/a/backup-lealcontrol.sh]"
  exit 1
fi

install -m 755 "$SCRIPT_SRC" "$SCRIPT_DST"
mkdir -p /etc/lealcontrol /var/backups/lealcontrol

if [[ ! -f /etc/lealcontrol/backup.env ]]; then
  cat > /etc/lealcontrol/backup.env <<'EOF'
LEAL_STAGING_DIR=/opt/lealcontrol-staging
LEAL_PROD_DIR=/opt/lealcontrol-v2
LEAL_BACKUP_BASE_DIR=/var/backups/lealcontrol
LEAL_BACKUP_RETENTION_DAYS=14
EOF
  chmod 600 /etc/lealcontrol/backup.env
  echo "Creado /etc/lealcontrol/backup.env (editá si hace falta)."
fi

CRON_LINE="$CRON_TIME LEAL_BACKUP_CONFIG=/etc/lealcontrol/backup.env $SCRIPT_DST all >> /var/backups/lealcontrol/cron.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'leal-backup.sh' || true; echo "$CRON_LINE" ) | crontab -

echo "Instalado: $SCRIPT_DST"
echo "Cron: $CRON_TIME (todos los días)"
echo "Probar ahora: LEAL_BACKUP_CONFIG=/etc/lealcontrol/backup.env $SCRIPT_DST all"
