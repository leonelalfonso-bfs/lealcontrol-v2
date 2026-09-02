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

movements_only_confirmed() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
path = sys.argv[1]
try:
    rows = json.load(open(path))
except Exception:
    sys.exit(1)
if not isinstance(rows, list):
    sys.exit(1)
bad = {"Suggested", "Imported", "PendingIdentification", "Identified", "Excluded"}
for row in rows:
    status = row.get("classificationStatus") or row.get("ClassificationStatus")
    if status in bad:
        sys.exit(1)
sys.exit(0)
PY
}

movements_no_system_origin() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
path = sys.argv[1]
try:
    rows = json.load(open(path))
except Exception:
    sys.exit(1)
if not isinstance(rows, list):
    sys.exit(1)
for row in rows:
    origin = row.get("origin", row.get("Origin"))
    if origin is not None and str(origin).lower() == "system":
        sys.exit(1)
sys.exit(0)
PY
}

movement_only_excluded_from_collections() {
  local file="$1"
  python3 - "$file" <<'PY'
import json, sys
path = sys.argv[1]
try:
    rows = json.load(open(path))
except Exception:
    sys.exit(1)
blocked = {"COMISION", "GASTO_BANCARIO"}
for row in rows:
    code = row.get("conceptCode") or row.get("ConceptCode") or ""
    if str(code).upper() in blocked:
        sys.exit(1)
sys.exit(0)
PY
}

concepts_have_usable_in() {
  python3 - /tmp/fin-concepts.json <<'PY'
import json, sys
rows = json.load(open(sys.argv[1]))
usable = {
    (r.get("usableIn") or r.get("UsableIn") or "")
    for r in rows
}
needed = {"MovementOnly", "Receipt"}
sys.exit(0 if needed.issubset(usable) else 1)
PY
}

reconciliation_responds() {
  local account_id http_code
  account_id="$(curl -sf "${auth[@]}" "${BASE}/api/v1/finance/accounts" \
    | python3 -c "import json,sys; a=json.load(sys.stdin); print(a[0].get('id') or a[0].get('Id') or '' if a else '')" 2>/dev/null || true)"
  if [[ -z "$account_id" ]]; then
    echo "    (sin cuentas financieras en /api/v1/finance/accounts)" >&2
    return 1
  fi
  http_code="$(curl -s -o /tmp/fin-recon.json -w "%{http_code}" "${auth[@]}" \
    "${BASE}/api/v1/finance/reconciliation?accountId=${account_id}")"
  if [[ "$http_code" != "200" ]]; then
    echo "    (reconciliation HTTP ${http_code} para cuenta ${account_id})" >&2
    head -c 300 /tmp/fin-recon.json >&2 || true
    echo >&2
    return 1
  fi
  python3 - /tmp/fin-recon.json <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
for key in ("imported", "Imported", "system", "System"):
    if key in data:
        sys.exit(0)
sys.exit(1)
PY
}

echo "=== verify-finance-phases-ab @ ${BASE} ==="

# A-V1 / A-V2: available-movements solo confirmados + importados
check "collections/available-movements responde" \
  curl -sf "${auth[@]}" "${BASE}/api/v1/finance/collections/available-movements" -o /tmp/fin-coll-mov.json

check "collections sin movimientos no confirmados" \
  movements_only_confirmed /tmp/fin-coll-mov.json

check "collections solo origen importado (si hay origin en respuesta)" \
  movements_no_system_origin /tmp/fin-coll-mov.json

check "payments/available-movements responde" \
  curl -sf "${auth[@]}" "${BASE}/api/v1/finance/payments/available-movements" -o /tmp/fin-pay-mov.json

check "payments sin movimientos no confirmados" \
  movements_only_confirmed /tmp/fin-pay-mov.json

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
    | python3 -c "import json,sys; rows=json.load(sys.stdin); cid='${FIRST_CONCEPT}'; sys.exit(0 if rows and all(r.get('conceptId')==cid for r in rows) else 1)"
else
  echo "  SKIP filtro conceptId (sin movimientos confirmados)"
fi

check "reconciliation endpoint responde" reconciliation_responds

check "concepts incluyen usableIn en seeds" \
  curl -sf "${auth[@]}" "${BASE}/api/v1/finance/concepts" -o /tmp/fin-concepts.json && \
  concepts_have_usable_in

check "collections excluye conceptos MovementOnly" \
  movement_only_excluded_from_collections /tmp/fin-coll-mov.json

echo "---"
echo "Pasaron: $pass | Fallaron: $fail"
echo "UI manual pendiente: A-V6, A-V7, A-V8, B-V5…B-V7 (ver CIRCUITO_DINERO_PROGRESO.md)"

if [[ "$fail" -gt 0 ]]; then
  exit 1
fi

echo "OK verify-finance-phases-ab (API)"
