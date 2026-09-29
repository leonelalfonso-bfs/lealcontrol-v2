-- Unifica numeración de presupuestos BFS al formato P-AAAA-NNNN.
-- Uso (prod VPS):
--   cd /opt/lealcontrol-v2
--   docker compose -f docker-compose.prod.yml exec -T postgres \
--     psql -U lealv2 -d leal_tenant_bfs < scripts/one-off/rename-bfs-quote-numbers-to-p-year.sql
--
-- Solo renombra números puramente numéricos (importados). No toca P-2026-0001.
-- El año se toma de QuoteDate; si falta, del año UTC de CreatedAtUtc.

BEGIN;

-- Vista previa
SELECT
  "QuoteNumber" AS old_number,
  'P-' || EXTRACT(YEAR FROM COALESCE("QuoteDate", ("CreatedAtUtc" AT TIME ZONE 'UTC')))::int
    || '-' || "QuoteNumber" AS new_number,
  "Revision",
  left("CustomerName", 50) AS cliente,
  "QuoteDate"
FROM sales.quotes
WHERE "QuoteNumber" ~ '^[0-9]+$'
ORDER BY "QuoteNumber"::int DESC
LIMIT 25;

-- 1) Presupuestos operativos
UPDATE sales.quotes q
SET "QuoteNumber" = 'P-'
  || EXTRACT(YEAR FROM COALESCE(q."QuoteDate", (q."CreatedAtUtc" AT TIME ZONE 'UTC')))::int
  || '-' || q."QuoteNumber",
  "UpdatedAtUtc" = NOW()
WHERE q."QuoteNumber" ~ '^[0-9]+$';

-- 2) Pedidos con número de presupuesto legado: alinear al presupuesto ya renombrado
UPDATE sales.orders o
SET "QuoteNumber" = q."QuoteNumber"
FROM sales.quotes q
WHERE o."QuoteNumber" ~ '^[0-9]+$'
  AND o."TenantId" = q."TenantId"
  AND q."QuoteNumber" ~ ('^P-[0-9]{4}-' || o."QuoteNumber" || '$');

-- 3) Pedidos huérfanos que sigan con número plano
UPDATE sales.orders o
SET "QuoteNumber" = 'P-'
  || EXTRACT(YEAR FROM (o."CreatedAtUtc" AT TIME ZONE 'UTC'))::int
  || '-' || o."QuoteNumber"
WHERE o."QuoteNumber" ~ '^[0-9]+$';

-- 4) Historial de solo lectura (si existe la tabla)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'sales' AND table_name = 'historical_quotes'
  ) THEN
    UPDATE sales.historical_quotes h
    SET "QuoteNumber" = 'P-'
      || EXTRACT(YEAR FROM COALESCE(h."QuoteDate", (h."CreatedAtUtc" AT TIME ZONE 'UTC')))::int
      || '-' || h."QuoteNumber"
    WHERE h."QuoteNumber" ~ '^[0-9]+$';
  END IF;
END $$;

-- Verificación
SELECT "QuoteNumber", "Revision", left("CustomerName", 40) AS cliente, "QuoteDate"
FROM sales.quotes
ORDER BY
  CASE WHEN "QuoteNumber" ~ '[0-9]+$'
       THEN substring("QuoteNumber" from '[0-9]+$')::int
       ELSE 0 END DESC,
  "CreatedAtUtc" DESC
LIMIT 15;

COMMIT;
