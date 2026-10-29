-- =============================================================================
-- BFS (leal_tenant_bfs): limpia Finanzas, Compras y las facturas de venta sin CAE
-- para que administración pruebe el sistema desde cero (pedido del 29/10/2026).
--
-- Borra: cuentas financieras (bancos, cajas, billeteras), movimientos, extractos,
--   recibos, órdenes de pago, cheques/eCheq, retenciones practicadas y sufridas,
--   lotes de pago, fondos comunes, rendiciones; pedidos, cotizaciones, órdenes de
--   compra, recepciones (y el stock que sumaron), facturas de compra, comprobantes
--   de Mis Comprobantes y constataciones; facturas de venta SIN CAE y sin intento
--   fiscal abierto; los asientos y la cola contable de todo eso.
-- Conserva: facturas de venta con CAE (y cualquiera con un intento fiscal Reservado,
--   Pendiente o Desconocido), clientes y proveedores, productos, conceptos y reglas
--   financieras, regímenes y perfiles de retención, CBU de proveedores, topes de
--   viáticos, plan de cuentas y asientos modelo.
--
-- Por defecto NO borra: corre todo en una transacción y la deshace (ROLLBACK),
-- mostrando cuántas filas hay antes y después. Para aplicarlo: -v apply=1
-- =============================================================================
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply 0
\endif

BEGIN;

-- Facturas de venta que se borran: sin CAE y sin intento fiscal que pueda haber quedado autorizado en ARCA.
CREATE TEMP TABLE wipe_invoices ON COMMIT DROP AS
SELECT i."Id" FROM sales.invoices i
WHERE COALESCE(i."Cae", '') = ''
  AND NOT EXISTS (SELECT 1 FROM sales.fiscal_authorization_attempts a WHERE a."InvoiceId" = i."Id" AND a."Status" <> 'Rejected');

CREATE TEMP TABLE wipe_counts (orden int, tabla text, filas bigint, cuando text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.contar(p_cuando text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE t text; n bigint; i int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'finance."FinancialAccounts"', 'finance."FinancialMovements"', 'finance."BankStatementImports"', 'finance."BankImportProfiles"',
    'finance."CollectionReceipts"', 'finance."PaymentOrders"', 'finance."ReceivedCheques"', 'finance."CustomerAdvances"',
    'finance."Withholdings"', 'finance."SufferedTaxJurisdictions"', 'finance."PaymentBatches"', 'finance."InvestmentFunds"',
    'finance."InvestmentFundOperations"', 'finance."ExpenseReports"',
    'purchases.purchase_requests', 'purchases.purchase_quotations', 'purchases.purchase_orders', 'purchases.purchase_receptions',
    'purchases.purchase_invoices', 'purchases.purchase_arca_vouchers', 'purchases.purchase_invoice_arca_checks',
    'sales.invoices', 'accounting.journal_entries', 'accounting.pending_documents'
  ] LOOP
    i := i + 1;
    IF to_regclass(t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT count(*) FROM %s', t) INTO n;
    INSERT INTO wipe_counts VALUES (i, t, n, p_cuando);
  END LOOP;
  INSERT INTO wipe_counts SELECT 100, 'sales.invoices con CAE o intento abierto (se conservan)', count(*), p_cuando
    FROM sales.invoices WHERE "Id" NOT IN (SELECT "Id" FROM wipe_invoices);
  INSERT INTO wipe_counts SELECT 101, 'sales."StockMovements" de recepciones', count(*), p_cuando
    FROM sales."StockMovements" WHERE "MovementType" = 'PurchaseReception';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.borrar(t text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF to_regclass(t) IS NOT NULL THEN EXECUTE format('DELETE FROM %s', t); END IF;
END $$;

SELECT pg_temp.contar('antes');

-- ---------- Contabilidad: asientos y cola de Finanzas, Compras y las facturas de venta que se borran ----------
DELETE FROM accounting.journal_entries
WHERE "SourceModule" IN ('Finance', 'Purchases')
   OR ("SourceModule" = 'Sales' AND "SourceDocumentId" IN (SELECT "Id"::text FROM wipe_invoices));
DELETE FROM accounting.pending_documents
WHERE "SourceModule" IN ('Finance', 'Purchases')
   OR ("SourceModule" = 'Sales' AND "SourceDocumentId" IN (SELECT "Id"::text FROM wipe_invoices));
SELECT pg_temp.borrar('accounting.finance_account_mapping');

-- ---------- Finanzas (hijos primero) ----------
SELECT pg_temp.borrar(t) FROM unnest(ARRAY[
  'finance."ExpenseReportLines"', 'finance."ExpenseReports"',
  'finance."InvestmentFundOperations"', 'finance."InvestmentFunds"',
  'finance."PaymentBatchItems"', 'finance."PaymentBatches"',
  'finance."Withholdings"', 'finance."SufferedTaxJurisdictions"',
  'finance."CollectionReceiptImputations"', 'finance."CollectionReceiptLines"', 'finance."CustomerAdvances"', 'finance."CollectionReceipts"',
  'finance."PaymentOrderImputations"', 'finance."PaymentOrderLines"', 'finance."PaymentOrders"',
  'finance."ReceivedCheques"', 'finance."FinancialMovements"', 'finance."BankStatementImports"', 'finance."BankImportProfiles"',
  'finance."FinancialAccounts"'
]) AS t;
UPDATE finance."DocumentSequences" SET "NextNumber" = 1, "UpdatedAtUtc" = now();

-- ---------- Compras: el stock que sumaron las recepciones vuelve atrás ----------
UPDATE sales."StockItems" s SET "PhysicalStock" = s."PhysicalStock" - m.cantidad
FROM (SELECT "ProductId", "WarehouseId", sum("Quantity") AS cantidad FROM sales."StockMovements"
      WHERE "MovementType" = 'PurchaseReception' GROUP BY "ProductId", "WarehouseId") m
WHERE s."ProductId" = m."ProductId" AND s."WarehouseId" IS NOT DISTINCT FROM m."WarehouseId";
DELETE FROM sales."StockMovements" WHERE "MovementType" = 'PurchaseReception';

SELECT pg_temp.borrar(t) FROM unnest(ARRAY[
  'purchases.purchase_invoice_arca_checks', 'purchases.purchase_invoice_items', 'purchases.purchase_invoices', 'purchases.purchase_arca_vouchers',
  'purchases.purchase_reception_items', 'purchases.purchase_receptions', 'purchases.purchase_order_items', 'purchases.purchase_orders',
  'purchases.purchase_quotations', 'purchases.purchase_request_items', 'purchases.purchase_requests'
]) AS t;

-- ---------- Ventas: facturas sin CAE ----------
DELETE FROM sales.fiscal_authorization_attempts WHERE "InvoiceId" IN (SELECT "Id" FROM wipe_invoices);
DELETE FROM sales.invoice_items WHERE "InvoiceId" IN (SELECT "Id" FROM wipe_invoices);
DELETE FROM sales.invoices WHERE "Id" IN (SELECT "Id" FROM wipe_invoices);

SELECT pg_temp.contar('después');

SELECT a.tabla, a.filas AS antes, d.filas AS despues
FROM wipe_counts a JOIN wipe_counts d ON d.tabla = a.tabla AND d.cuando = 'después'
WHERE a.cuando = 'antes' ORDER BY a.orden;

-- Stock que quedaría negativo (mercadería recibida que ya se vendió o consumió).
SELECT p."Code", p."Name", s."WarehouseName", s."PhysicalStock"
FROM sales."StockItems" s LEFT JOIN sales.products p ON p."Id" = s."ProductId"
WHERE s."PhysicalStock" < 0;

\if :apply
  COMMIT;
  \echo '>>> APLICADO'
\else
  ROLLBACK;
  \echo '>>> PRUEBA: no se borró nada (para aplicar: -v apply=1)'
\endif
