#!/usr/bin/env bash
# Verificación API de Fases A+B del circuito del dinero (staging/local).
# Requiere JWT de usuario con rol Tesorero/Admin.
#
# Uso:
#   export FINANCE_TEST_JWT="eyJ..."
#   bash scripts/verify-finance-phases-ab.sh 5210
set -euo pipefail

PORT="${1:-5210}"
BASE="http://127.0.0.1:${PORT}"
JWT="${FINANCE_TEST_JWT:-}"

if [[ -z "$JWT" ]]; then
  echo "ERROR: exportá FINANCE_TEST_JWT con un token válido (login en v2 → DevTools → localStorage/cookie)."
  exit 1
fi

auth=(-H "Authorization: Bearer ${JWT}" -H "Content-Type: application/json")

pass=0
fail=0
check() {
  local name="$1"
  shift
  if "$@"; then
    echo "  OK  $name"
    pass=$((pass + 1))
  else
    echo "  FAIL $name"
    fail=$((fail + 1))
  fi
}

echo "=== verify-finance-phases-ab @ ${BASE} ==="

# A-V1 / A-V2: available-movements solo confirmados + importados
check "collections/available-movements responde" \
  curl -sf "${auth[@]}" "${BASE}/api/v1/finance/collections/available-movements" -o /tmp/fin-coll-mov.json

check "collections sin movimientos no confirmados" \
  ! grep -qi '"classificationStatus"[[:space:]]*:[[:space:]]*"Suggested"' /tmp/fin-coll-mov.json 2>/dev/null && \
  ! grep -qi '"classificationStatus"[[:space:]]*:[[:space:]]*"Imported"' /tmp/fin-coll-mov.json 2>/dev/null

check "collections solo origen importado (si hay origin en respuesta)" \
  ! grep -q '"origin"[[:space:]]*:[[:space:]]*"System"' /tmp/fin-coll-mov.json 2>/dev/null || \
  ! grep -q '"origin"' /tmp/fin-coll-mov.json 2>/dev/null

check "payments/available-movements responde" \
  curl -sf "${auth[@]}" "${BASE}/api/v1/finance/payments/available-movements" -o /tmp/fin-pay-mov.json

check "payments sin movimientos no confirmados" \
  ! grep -qi '"classificationStatus"[[:space:]]*:[[:space:]]*"Suggested"' /tmp/fin-pay-mov.json 2>/dev/null

# A-V5: filtro conceptId
FIRST_CONCEPT="$(python3 - <<'PY' 2>/dev/null || true
import json
try:
  rows=json.load(open("/tmp/fin-coll-mov.json"))
  if rows and rows[0].get("conceptId"):
    print(rows[0]["conceptId"])
except Exception:
  pass
PY
)"
if [[ -n "$FIRST_CONCEPT" ]]; then
  check "filtro conceptId en collections" \
    curl -sf "${auth[@]}" "${BASE}/api/v1/finance/collections/available-movements?conceptId=${FIRST_CONCEPT}" \
    | grep -q "$FIRST_CONCEPT"
else
  echo "  SKIP filtro conceptId (sin movimientos confirmados)"
fi

reconciliation_responds() {
  local account_id
  account_id="$(curl -sf "${auth[@]}" "${BASE}/api/v1/finance/accounts" \
    | python3 -c "import json,sys; a=json.load(sys.stdin); print(a[0]['id'] if a else '')" 2>/dev/null || true)"
  [[ -n "$account_id" ]] || return 1
  curl -sf "${auth[@]}" "${BASE}/api/v1/finance/reconciliation?accountId=${account_id}" -o /tmp/fin-recon.json
}
check "reconciliation endpoint responde" reconciliation_responds

check "concepts incluyen usableIn en seeds" \
  curl -sf "${auth[@]}" "${BASE}/api/v1/finance/concepts" -o /tmp/fin-concepts.json && \
  grep -q '"usableIn"[[:space:]]*:[[:space:]]*"MovementOnly"' /tmp/fin-concepts.json && \
  grep -q '"usableIn"[[:space:]]*:[[:space:]]*"Receipt"' /tmp/fin-concepts.json

movement_only_excluded_from_collections() {
  if [[ ! -f /tmp/fin-coll-mov.json ]]; then
    return 0
  fi
  ! grep -qi '"conceptCode"[[:space:]]*:[[:space:]]*"COMISION"' /tmp/fin-coll-mov.json 2>/dev/null &&
  ! grep -qi '"conceptCode"[[:space:]]*:[[:space:]]*"GASTO_BANCARIO"' /tmp/fin-coll-mov.json 2>/dev/null
}
check "collections excluye conceptos MovementOnly" movement_only_excluded_from_collections

echo "---"
echo "Pasaron: $pass | Fallaron: $fail"
echo "UI manual pendiente: A-V6, A-V7, A-V8, B-V5…B-V7 (ver CIRCUITO_DINERO_PROGRESO.md)"

if [[ "$fail" -gt 0 ]]; then
  exit 1
fi

echo "OK verify-finance-phases-ab (API)"
