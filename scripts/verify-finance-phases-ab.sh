#!/usr/bin/env bash
# Verificación API de Fases A+B del circuito del dinero (staging/local).
# Requiere JWT de usuario con rol Tesorero/Admin.
#
# Uso:
#   export FINANCE_TEST_JWT="eyJ..."
#   bash scripts/verify-finance-phases-ab.sh 5210
set -uo pipefail

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
skip=0
coll_ok=0
pay_ok=0

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

skip_check() {
  local name="$1"
  local reason="$2"
  echo "  SKIP $name ($reason)"
  skip=$((skip + 1))
}

fetch_json() {
  local url="$1" out="$2"
  local http_code
  http_code="$(curl -s -o "$out" -w "%{http_code}" "${auth[@]}" "$url")"
  if [[ "$http_code" != "200" ]]; then
    echo "    HTTP ${http_code}: $(head -c 160 "$out" 2>/dev/null | tr '\n' ' ')" >&2
    return 1
  fi
  if ! python3 - "$out" <<'PY' 2>/dev/null
import json, sys
json.load(open(sys.argv[1]))
PY
  then
    echo "    respuesta no es JSON válido" >&2
    return 1
  fi
  return 0
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

concept_filter_works() {
  local concept_id="$1"
  fetch_json "${BASE}/api/v1/finance/collections/available-movements?conceptId=${concept_id}" /tmp/fin-coll-filter.json || return 1
  python3 - "$concept_id" /tmp/fin-coll-filter.json <<'PY'
import json, sys
cid, path = sys.argv[1], sys.argv[2]
rows = json.load(open(path))
if not rows:
    sys.exit(0)
sys.exit(0 if all((r.get("conceptId") or r.get("ConceptId")) == cid for r in rows) else 1)
PY
}

reconciliation_responds() {
  local account_id http_code
  fetch_json "${BASE}/api/v1/finance/accounts" /tmp/fin-accounts.json || return 1
  account_id="$(python3 - /tmp/fin-accounts.json <<'PY'
import json, sys
a = json.load(open(sys.argv[1]))
print(a[0].get("id") or a[0].get("Id") or "" if a else "")
PY
)"
  if [[ -z "$account_id" ]]; then
    echo "    (sin cuentas financieras)" >&2
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

rm -f /tmp/fin-coll-mov.json /tmp/fin-pay-mov.json /tmp/fin-concepts.json /tmp/fin-recon.json /tmp/fin-coll-filter.json /tmp/fin-accounts.json

echo "=== verify-finance-phases-ab @ ${BASE} ==="

# A-V1 / A-V2: available-movements solo confirmados + importados
if fetch_json "${BASE}/api/v1/finance/collections/available-movements" /tmp/fin-coll-mov.json; then
  check "collections/available-movements responde" true
  coll_ok=1
  check "collections sin movimientos no confirmados" movements_only_confirmed /tmp/fin-coll-mov.json
  check "collections solo origen importado (si hay origin en respuesta)" movements_no_system_origin /tmp/fin-coll-mov.json
else
  check "collections/available-movements responde" false
  skip_check "collections sin movimientos no confirmados" "sin respuesta válida"
  skip_check "collections solo origen importado (si hay origin en respuesta)" "sin respuesta válida"
fi

if fetch_json "${BASE}/api/v1/finance/payments/available-movements" /tmp/fin-pay-mov.json; then
  check "payments/available-movements responde" true
  pay_ok=1
  check "payments sin movimientos no confirmados" movements_only_confirmed /tmp/fin-pay-mov.json
else
  check "payments/available-movements responde" false
  skip_check "payments sin movimientos no confirmados" "sin respuesta válida"
fi

# A-V5: filtro conceptId
if [[ "$coll_ok" -eq 1 ]]; then
  FIRST_CONCEPT="$(python3 - /tmp/fin-coll-mov.json <<'PY' 2>/dev/null || true
import json, sys
rows = json.load(open(sys.argv[1]))
if rows and rows[0].get("conceptId"):
    print(rows[0]["conceptId"])
PY
)"
  if [[ -n "$FIRST_CONCEPT" ]]; then
    check "filtro conceptId en collections" concept_filter_works "$FIRST_CONCEPT"
  else
    skip_check "filtro conceptId en collections" "sin movimientos confirmados"
  fi
else
  skip_check "filtro conceptId en collections" "collections no respondió"
fi

check "reconciliation endpoint responde" reconciliation_responds

if fetch_json "${BASE}/api/v1/finance/concepts" /tmp/fin-concepts.json; then
  check "concepts incluyen usableIn en seeds" concepts_have_usable_in
else
  check "concepts incluyen usableIn en seeds" false
fi

if [[ "$coll_ok" -eq 1 ]]; then
  check "collections excluye conceptos MovementOnly" movement_only_excluded_from_collections /tmp/fin-coll-mov.json
else
  skip_check "collections excluye conceptos MovementOnly" "collections no respondió"
fi

echo "---"
echo "Pasaron: $pass | Fallaron: $fail | Omitidos: $skip"
echo "UI manual pendiente: A-V6, A-V7, A-V8, B-V5…B-V7 (ver CIRCUITO_DINERO_PROGRESO.md)"

if [[ "$fail" -gt 0 ]]; then
  echo ""
  echo "Tip: si ves HTTP 401, renová el token:"
  echo "  curl -s -X POST ${BASE}/api/v1/auth/login -H 'Content-Type: application/json' \\"
  echo "    -d '{\"email\":\"TU_EMAIL\",\"password\":\"TU_PASSWORD\"}' | python3 -c \"import json,sys; print(json.load(sys.stdin).get('token',''))\""
  exit 1
fi

echo "OK verify-finance-phases-ab (API)"
