#!/usr/bin/env bash
# Espera a que /health responda Healthy (post-deploy).
set -euo pipefail

PORT="${1:-8080}"
MIN_HEALTHY="${2:-8}"
URL="http://127.0.0.1:${PORT}/health"

echo "Smoke test: $URL (mínimo ${MIN_HEALTHY} checks Healthy)"

for attempt in $(seq 1 30); do
  if response="$(curl -sf "$URL" 2>/dev/null)"; then
    if [[ "$response" == "Healthy" ]]; then
      echo "OK — respuesta plain-text Healthy en intento $attempt"
      exit 0
    fi

    if echo "$response" | grep -q '"status"[[:space:]]*:[[:space:]]*"Healthy"'; then
      healthy_count="$(echo "$response" | grep -o '"status"[[:space:]]*:[[:space:]]*"Healthy"' | wc -l | tr -d ' ')"
      if [[ "$healthy_count" -ge "$MIN_HEALTHY" ]]; then
        echo "OK — $healthy_count checks Healthy en intento $attempt"
        exit 0
      fi
      echo "Intento $attempt: status Healthy pero solo $healthy_count/$MIN_HEALTHY checks"
    else
      echo "Intento $attempt: respuesta sin status Healthy"
      echo "  preview: $(echo "$response" | tr -d '\n' | head -c 240)"
    fi
  else
    echo "Intento $attempt: sin respuesta"
  fi
  sleep 5
done

echo "ERROR: /health no pasó el smoke test tras 30 intentos"
exit 1
