#!/bin/bash
# ==============================================================================
# LEAL Control ERP v2.0 - Script de Respaldo Automático Multi-Bases a Google Drive
# ==============================================================================
# Este script se ejecuta mediante cron cada noche (ej. 02:00 AM)
# Respalda cada base de datos individual (Database-per-Tenant) en formato .sql.gz
# y sincroniza los archivos con Google Drive utilizando rclone.
# ==============================================================================

set -e

# Configuración
PG_HOST="localhost"
PG_PORT="5432"
PG_USER="leal"
PG_PASSWORD="leal"
BACKUP_BASE_DIR="/var/backups/lealcontrol"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
TODAY_DIR="$BACKUP_BASE_DIR/$TIMESTAMP"
RCLONE_REMOTE="gdrive:LEAL_BACKUPS"
RETENTION_DAYS_LOCAL=14

export PGPASSWORD="$PG_PASSWORD"

echo "=========================================================="
echo " [LEAL BACKUP] Iniciando respaldo multi-bases: $TIMESTAMP"
echo "=========================================================="

mkdir -p "$TODAY_DIR"

# 1. Obtener la lista de todas las bases de datos de clientes y la base maestra
DATABASES=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -t -c "
    SELECT datname FROM pg_database 
    WHERE datistemplate = false 
      AND (datname LIKE 'leal_tenant_%' OR datname = 'lealcontrol' OR datname = 'postgres');
")

COUNT=0

for DB in $DATABASES; do
    # Limpiar espacios
    DB=$(echo "$DB" | xargs)
    if [ -n "$DB" ]; then
        FILE_NAME="${DB}_${TIMESTAMP}.sql.gz"
        FILE_PATH="$TODAY_DIR/$FILE_NAME"
        
        echo " -> Respaldando base de datos: $DB ..."
        
        # pg_dump comprimido con gzip
        if command -v pg_dump &> /dev/null; then
            pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$DB" --no-owner --no-privileges | gzip -9 > "$FILE_PATH"
        else
            # Si corre dentro de Docker
            docker exec lealcontrol-postgres pg_dump -U "$PG_USER" -d "$DB" --no-owner --no-privileges | gzip -9 > "$FILE_PATH"
        fi
        
        FILE_SIZE=$(du -h "$FILE_PATH" | cut -f1)
        echo "    ✓ Respaldo generado: $FILE_NAME ($FILE_SIZE)"
        COUNT=$((COUNT + 1))
    fi
done

echo "----------------------------------------------------------"
echo " [LEAL BACKUP] $COUNT bases de datos respaldadas exitosamente."
echo "----------------------------------------------------------"

# 2. Sincronización con Google Drive (si rclone está configurado)
if command -v rclone &> /dev/null; then
    echo " -> Sincronizando con Google Drive ($RCLONE_REMOTE/daily/)..."
    rclone copy "$TODAY_DIR" "$RCLONE_REMOTE/daily/$TIMESTAMP" --transfers 4 --checkers 8
    echo " ✓ Sincronización a Google Drive completada."
    
    # Limpieza en Google Drive de respaldos de más de 30 días
    rclone delete --min-age 30d "$RCLONE_REMOTE/daily" || true
else
    echo " [AVISO] rclone no está instalado en el sistema. Los respaldos se conservan localmente en $TODAY_DIR."
    echo " Para vincular tu Google Drive ejecuta: rclone config"
fi

# 3. Limpieza local de respaldos antiguos
echo " -> Purgando respaldos locales de más de $RETENTION_DAYS_LOCAL días..."
find "$BACKUP_BASE_DIR" -type d -mtime +$RETENTION_DAYS_LOCAL -exec rm -rf {} + 2>/dev/null || true

echo "=========================================================="
echo " [LEAL BACKUP] Proceso completado con éxito: $(date +"%Y-%m-%d %H:%M:%S")"
echo "=========================================================="
