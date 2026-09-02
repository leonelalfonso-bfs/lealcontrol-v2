#!/usr/bin/env bash
# Crea el usuario admin de desarrollo local. Ejecutar manualmente (no en CI/prod).
set -euo pipefail

EMAIL="${DEV_ADMIN_EMAIL:-admin@lealcontrol.com}"
PASSWORD="${DEV_ADMIN_PASSWORD:-admin123}"
TENANT_ID="${DEV_TENANT_ID:-11111111-1111-1111-1111-111111111111}"
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-lealcontrol}"
PGUSER="${PGUSER:-leal}"
PGPASSWORD="${PGPASSWORD:-leal}"

export PGPASSWORD

HASH=$(python3 - <<PY
import base64, hashlib, os
password = "${PASSWORD}"
salt = os.urandom(16)
dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)
print(f"{base64.b64encode(salt).decode()}.{base64.b64encode(dk).decode()}")
PY
)

psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -v ON_ERROR_STOP=1 <<SQL
DELETE FROM public.tenant_users
WHERE lower("Email") = lower('${EMAIL}') AND "TenantId" = '${TENANT_ID}'::uuid;

INSERT INTO public.tenant_users (
  "Id", "TenantId", "FullName", "Email", "Role", "PasswordHash", "IsActive", "AllowedModulesJson", "CreatedAtUtc"
)
VALUES (
  gen_random_uuid(),
  '${TENANT_ID}'::uuid,
  'Administrador Leal',
  lower('${EMAIL}'),
  'Admin',
  '${HASH}',
  true,
  '["sales","crm","purchases","inventory","finance","fleet","hr","grains","accounting","metrology","communications"]',
  now()
);
SQL

echo "Admin de desarrollo listo: ${EMAIL} (tenant ${TENANT_ID})"
