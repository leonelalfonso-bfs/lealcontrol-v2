#!/usr/bin/env bash
# Test de listo-para-operar ARCA / AFIP (antes de que el usuario empiece).
#
# Uso A — con token de sesión (recomendado si ya estás logueado en el ERP):
#   1) En el navegador (erp.lealcontrol.com), F12 → Application → Local Storage → copiá "leal_token"
#   2) TOKEN='eyJ...' bash scripts/test-arca-readiness.sh
#
# Uso B — con email/password de un usuario ACTIVO del tenant:
#   API_URL=https://erp.lealcontrol.com \
#   EMAIL=admin@empresa.com \
#   PASSWORD='***' \
#   TENANT_ID='uuid-opcional' \
#   bash scripts/test-arca-readiness.sh
#
# Uso C — solo inspección PEM en Postgres:
#   bash scripts/test-arca-readiness.sh --db-only
#
# Uso D — listar usuarios por DB (para ver el email correcto):
#   bash scripts/test-arca-readiness.sh --list-users
#
set -euo pipefail

API_URL="${API_URL:-https://erp.lealcontrol.com}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
PG_USER="${POSTGRES_USER:-lealv2}"
MODE="${1:-}"

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
header() { printf '\n==> %s\n' "$*"; }

list_users() {
  header "Usuarios activos por base tenant"
  mapfile -t DBS < <(docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$PG_USER" -d postgres -Atc \
    "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');")

  for db in "${DBS[@]}"; do
    [[ -z "$db" ]] && continue
    local has_users
    has_users=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -U "$PG_USER" -d "$db" -Atc \
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenant_users' LIMIT 1;" || true)
    [[ "$has_users" != "1" ]] && continue

    local company
    company=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -U "$PG_USER" -d "$db" -Atc \
      "SELECT COALESCE(\"LegalName\",'(sin nombre)') FROM public.tenant_settings LIMIT 1;" 2>/dev/null || echo "(sin settings)")

    echo "--- DB: $db | Empresa: $company"
    docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -U "$PG_USER" -d "$db" -c \
      "SELECT \"Email\", \"FullName\", \"Role\", \"IsActive\"
       FROM public.tenant_users
       ORDER BY \"IsActive\" DESC, \"Email\";" 2>/dev/null || yellow "  (no se pudo leer tenant_users)"
  done
}

check_db_pem() {
  header "Inspección de certificados en bases tenant (openssl)"
  mapfile -t DBS < <(docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$PG_USER" -d postgres -Atc \
    "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres');")

  local any=0
  for db in "${DBS[@]}"; do
    [[ -z "$db" ]] && continue
    local has_settings
    has_settings=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -U "$PG_USER" -d "$db" -Atc \
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='tenant_settings' LIMIT 1;" || true)
    [[ "$has_settings" != "1" ]] && continue

    any=1
    echo "--- DB: $db"
    local row
    row=$(docker compose -f "$COMPOSE_FILE" exec -T postgres \
      psql -U "$PG_USER" -d "$db" -Atc \
      "SELECT
         COALESCE(\"LegalName\",'(sin nombre)'),
         COALESCE(\"ArcaEnvironment\",'?'),
         COALESCE(\"ArcaSignerCuit\",'(sin cuit)'),
         CASE WHEN \"ArcaCertificateCrt\" IS NULL OR btrim(\"ArcaCertificateCrt\")='' THEN 'SIN_CRT' ELSE 'CRT_OK' END,
         CASE WHEN \"ArcaCertificateKey\" IS NULL OR btrim(\"ArcaCertificateKey\")='' THEN 'SIN_KEY' ELSE 'KEY_OK' END
       FROM public.tenant_settings
       LIMIT 1;" || true)
    [[ -z "$row" ]] && { yellow "  (sin filas en tenant_settings)"; continue; }

    IFS='|' read -r name env cuit crt key <<<"$row"
    echo "  Empresa: $name"
    echo "  Ambiente: $env | CUIT firmante: $cuit | $crt | $key"

    if [[ "$crt" == "CRT_OK" && "$key" == "KEY_OK" ]]; then
      local tmp
      tmp=$(mktemp -d)
      docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql -U "$PG_USER" -d "$db" -Atc 'SELECT "ArcaCertificateCrt" FROM public.tenant_settings LIMIT 1;' >"$tmp/cert.crt"
      docker compose -f "$COMPOSE_FILE" exec -T postgres \
        psql -U "$PG_USER" -d "$db" -Atc 'SELECT "ArcaCertificateKey" FROM public.tenant_settings LIMIT 1;' >"$tmp/cert.key"
      if openssl x509 -in "$tmp/cert.crt" -noout -subject -dates 2>/dev/null; then
        if openssl rsa -in "$tmp/cert.key" -check -noout 2>/dev/null \
          || openssl pkey -in "$tmp/cert.key" -check -noout 2>/dev/null; then
          green "  ✓ PEM certificado/clave parseables con openssl"
        else
          red "  ✗ Clave privada inválida"
        fi
      else
        red "  ✗ Certificado .crt inválido"
      fi
      rm -rf "$tmp"
    else
      yellow "  ⚠ Falta CRT y/o KEY — el botón ARCA de clientes y la FE no van a andar."
    fi
  done

  if [[ "$any" -eq 0 ]]; then
    yellow "No se encontraron tenant_settings en las DBs visibles."
  fi
}

print_diag() {
  local diag="$1"
  local py
  py=$(mktemp)
  cat >"$py" <<'PY'
import json, sys
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except json.JSONDecodeError:
    print("Respuesta no-JSON del diagnóstico:")
    print(raw)
    raise SystemExit(1)

print("Resumen:", d.get("summary"))
print("Ambiente:", d.get("environment"), "| CUIT:", d.get("signerCuit"))
print("Listo facturación:", d.get("readyForInvoicing"))
print("Listo consulta CUIT:", d.get("readyForCuitLookup"))
for c in d.get("checks") or []:
    mark = "OK" if c.get("ok") else "FAIL"
    print("  [%s] %s: %s" % (mark, c.get("label"), c.get("detail")))

ok = bool(d.get("readyForInvoicing")) and bool(d.get("readyForCuitLookup"))
raise SystemExit(0 if ok else 2)
PY
  set +e
  printf '%s' "$diag" | python3 "$py"
  local py_code=$?
  set -e
  rm -f "$py"
  return "$py_code"
}

check_api() {
  header "Diagnóstico vía API (WSAA real contra ARCA)"
  local token="${TOKEN:-}"

  if [[ -n "$token" ]]; then
    green "✓ Usando TOKEN de entorno (sin login)"
  else
    if [[ -z "${EMAIL:-}" || -z "${PASSWORD:-}" ]]; then
      red "Necesitás TOKEN=... (desde el navegador) o EMAIL+PASSWORD de un usuario activo."
      echo ""
      echo "Opción rápida (recomendado):"
      echo "  1) Entrá a $API_URL con el usuario de Fraile Mariano"
      echo "  2) F12 → Application → Local Storage → copiá el valor de 'leal_token'"
      echo "  3) TOKEN='eyJ...' bash scripts/test-arca-readiness.sh"
      echo ""
      echo "Para ver emails válidos en la DB:"
      echo "  bash scripts/test-arca-readiness.sh --list-users"
      return 1
    fi

    local body
    if [[ -n "${TENANT_ID:-}" ]]; then
      body=$(printf '{"email":"%s","password":"%s","tenantId":"%s"}' "$EMAIL" "$PASSWORD" "$TENANT_ID")
    else
      body=$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASSWORD")
    fi

    local login_json
    login_json=$(curl -sS -X POST "$API_URL/api/v1/auth/login" \
      -H 'Content-Type: application/json' \
      -d "$body" || true)

    if printf '%s' "$login_json" | grep -q 'requiresTenantSelection'; then
      yellow "El usuario pertenece a varias empresas. Pasá TENANT_ID=... y reintentá."
      echo "$login_json"
      return 1
    fi

    token=$(printf '%s' "$login_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("token") or "")' 2>/dev/null || true)
    if [[ -z "$token" ]]; then
      red "Login falló. Respuesta: $login_json"
      yellow "Tip: el email/password debe ser de un usuario ACTIVO del tenant (no SuperAdmin)."
      yellow "Listá usuarios: bash scripts/test-arca-readiness.sh --list-users"
      yellow "O usá TOKEN del navegador (Local Storage → leal_token)."
      return 1
    fi
    green "✓ Login OK"
  fi

  local diag
  diag=$(curl -sS "$API_URL/api/v1/company/settings/arca-diagnostics" \
    -H "Authorization: Bearer $token" \
    -H 'Accept: application/json')

  print_diag "$diag"
}

header "LealControl — test ARCA readiness"
case "$MODE" in
  --db-only)
    check_db_pem
    exit 0
    ;;
  --list-users)
    list_users
    exit 0
    ;;
esac

check_db_pem || true
check_api
code=$?
if [[ $code -eq 0 ]]; then
  green "Todo OK para operar (facturación + botón ARCA de clientes)."
else
  yellow "Revisá los ítems en rojo. Si falla la consulta de CUIT, asociá ws_sr_constancia_inscripcion (Constancia de Inscripción) en Administrador de Relaciones ARCA."
fi
exit "$code"
