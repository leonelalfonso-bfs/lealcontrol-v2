#!/usr/bin/env bash
# ==============================================================================
# LEAL Control — chequeo de salud para alertas (cron cada 5 minutos, root).
#
# Revisa la API de producción (/health), el espacio en disco y el vencimiento del
# certificado HTTPS. Avisa a Healthchecks.io: ping OK si todo está bien, /fail con
# el motivo si algo falla. Si el VPS se cae, los pings dejan de llegar y
# Healthchecks también avisa.
#
# Configuración en /etc/lealcontrol/monitor.env (chmod 600):
#   LEAL_HC_SYSTEM_URL=https://hc-ping.com/<uuid>   (obligatorio)
#   LEAL_API_HEALTH_URL=http://127.0.0.1:5209/health
#   LEAL_DISK_MAX_PERCENT=85
#   LEAL_TLS_HOST=erp.lealcontrol.com
#   LEAL_TLS_MIN_DAYS=14
# ==============================================================================
set -uo pipefail

CONFIG_FILE="${LEAL_MONITOR_CONFIG:-/etc/lealcontrol/monitor.env}"
# shellcheck disable=SC1090
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE"

HC_URL="${LEAL_HC_SYSTEM_URL:-}"
API_URL="${LEAL_API_HEALTH_URL:-http://127.0.0.1:5209/health}"
DISK_MAX="${LEAL_DISK_MAX_PERCENT:-85}"
TLS_HOST="${LEAL_TLS_HOST:-erp.lealcontrol.com}"
TLS_MIN_DAYS="${LEAL_TLS_MIN_DAYS:-14}"

problems=()

# 1. API de producción y sus bases
health="$(curl -s -m 20 "$API_URL" 2>/dev/null || true)"
if ! grep -q '^{"status":"Healthy"' <<< "$health"; then
  problems+=("API no saludable en $API_URL: $(head -c 300 <<< "${health:-sin respuesta}")")
fi

# 2. Disco
used="$(df -P / | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ -n "$used" && "$used" -ge "$DISK_MAX" ]]; then
  problems+=("Disco al ${used}% (límite ${DISK_MAX}%)")
fi

# 3. Certificado HTTPS
if [[ -n "$TLS_HOST" ]]; then
  not_after="$(echo | timeout 15 openssl s_client -servername "$TLS_HOST" -connect "$TLS_HOST:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
  if [[ -z "$not_after" ]]; then
    problems+=("No se pudo leer el certificado HTTPS de $TLS_HOST")
  else
    days_left=$(( ( $(date -d "$not_after" +%s) - $(date +%s) ) / 86400 ))
    if [[ "$days_left" -lt "$TLS_MIN_DAYS" ]]; then
      problems+=("El certificado HTTPS de $TLS_HOST vence en $days_left días")
    fi
  fi
fi

if [[ "${#problems[@]}" -eq 0 ]]; then
  summary="OK: API Healthy, disco ${used}%${days_left:+, certificado ${days_left} días}"
  status=0
else
  summary="$(printf '%s\n' "${problems[@]}")"
  status=1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] $summary"

if [[ -n "$HC_URL" ]]; then
  suffix=""
  [[ "$status" -ne 0 ]] && suffix="/fail"
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "$summary" "${HC_URL}${suffix}" || true
fi

exit "$status"
