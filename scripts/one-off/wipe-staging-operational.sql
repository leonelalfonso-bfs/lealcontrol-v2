-- =============================================================================
-- Wipe SELECTIVO de datos operativos (staging)
-- Conserva: tenants, usuarios, empresa (tenant_settings), SuperAdmin, planes,
--           configs de módulo, plantillas SGC (quality.documents*), cuentas mail/WA,
--           plan de cuentas / plantillas contables, conceptos finance/HR.
-- Borra: clientes, proveedores, facturas, movimientos, productos, metrología,
--        compras, producción, flota, liquidaciones HR, mensajes, etc.
--
-- USAR SOLO EN STAGING (/opt/lealcontrol-staging). NUNCA en producción.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.wipe_table(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass(format('%I.%I', p_schema, p_table)) IS NULL THEN
    RAISE NOTICE 'skip (no existe): %.%', p_schema, p_table;
    RETURN;
  END IF;
  EXECUTE format('DELETE FROM %I.%I', p_schema, p_table);
  RAISE NOTICE 'wiped: %.% (% rows)', p_schema, p_table, ROW_COUNT;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'skip (undefined): %.%', p_schema, p_table;
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'skip (permiso): %.%', p_schema, p_table;
END;
$$;

-- ---------- Finance (hijos primero) ----------
SELECT pg_temp.wipe_table('finance', 'CollectionReceiptImputations');
SELECT pg_temp.wipe_table('finance', 'CollectionReceiptLines');
SELECT pg_temp.wipe_table('finance', 'CollectionReceipts');
SELECT pg_temp.wipe_table('finance', 'CustomerAdvances');
SELECT pg_temp.wipe_table('finance', 'PaymentOrderImputations');
SELECT pg_temp.wipe_table('finance', 'PaymentOrderLines');
SELECT pg_temp.wipe_table('finance', 'PaymentOrders');
SELECT pg_temp.wipe_table('finance', 'ReceivedCheques');
SELECT pg_temp.wipe_table('finance', 'FinancialMovements');
SELECT pg_temp.wipe_table('finance', 'BankStatementImports');
SELECT pg_temp.wipe_table('finance', 'FinancialAccounts');
-- Reset numeradores (si existe)
DO $$
BEGIN
  IF to_regclass('finance."DocumentSequences"') IS NOT NULL THEN
    UPDATE finance."DocumentSequences" SET "NextNumber" = 1;
  END IF;
END $$;

-- ---------- Accounting operacional ----------
SELECT pg_temp.wipe_table('accounting', 'journal_entry_lines');
SELECT pg_temp.wipe_table('accounting', 'journal_entries');
SELECT pg_temp.wipe_table('accounting', 'bank_statement_lines');
SELECT pg_temp.wipe_table('accounting', 'bank_statements');
SELECT pg_temp.wipe_table('accounting', 'pending_documents');
SELECT pg_temp.wipe_table('accounting', 'batch_runs');
SELECT pg_temp.wipe_table('accounting', 'finance_account_mapping');
-- KEEP: accounts, cost_centers, journal_templates*, mappings, tenant_settings, periods (opcional)
SELECT pg_temp.wipe_table('accounting', 'periods');

-- ---------- Purchases ----------
SELECT pg_temp.wipe_table('purchases', 'purchase_invoice_items');
SELECT pg_temp.wipe_table('purchases', 'purchase_invoices');
SELECT pg_temp.wipe_table('purchases', 'purchase_arca_vouchers');
SELECT pg_temp.wipe_table('purchases', 'purchase_reception_items');
SELECT pg_temp.wipe_table('purchases', 'purchase_receptions');
SELECT pg_temp.wipe_table('purchases', 'purchase_order_items');
SELECT pg_temp.wipe_table('purchases', 'purchase_orders');
SELECT pg_temp.wipe_table('purchases', 'purchase_request_items');
SELECT pg_temp.wipe_table('purchases', 'purchase_requests');
SELECT pg_temp.wipe_table('purchases', 'purchase_quotations');

-- ---------- Sales / stock / producción / granos ----------
SELECT pg_temp.wipe_table('sales', 'invoice_items');
SELECT pg_temp.wipe_table('sales', 'invoices');
SELECT pg_temp.wipe_table('sales', 'remito_items');
SELECT pg_temp.wipe_table('sales', 'remitos');
SELECT pg_temp.wipe_table('sales', 'order_lines');
SELECT pg_temp.wipe_table('sales', 'orders');
SELECT pg_temp.wipe_table('sales', 'quote_lines');
SELECT pg_temp.wipe_table('sales', 'quotes');

SELECT pg_temp.wipe_table('sales', 'StockTransferItems');
SELECT pg_temp.wipe_table('sales', 'StockTransfers');
SELECT pg_temp.wipe_table('sales', 'StockMovements');
SELECT pg_temp.wipe_table('sales', 'StockItems');
SELECT pg_temp.wipe_table('sales', 'ProductSuppliers');
SELECT pg_temp.wipe_table('sales', 'Warehouses');

SELECT pg_temp.wipe_table('sales', 'ProductionExecutionEntries');
SELECT pg_temp.wipe_table('sales', 'ProductionOperations');
SELECT pg_temp.wipe_table('sales', 'ProductionRoutes');
SELECT pg_temp.wipe_table('sales', 'ProductionBomLines');
SELECT pg_temp.wipe_table('sales', 'ProductionBoms');
SELECT pg_temp.wipe_table('sales', 'ProductionOrders');
SELECT pg_temp.wipe_table('sales', 'ProductionVariants');
SELECT pg_temp.wipe_table('sales', 'ProductionWorkCenters');

SELECT pg_temp.wipe_table('sales', 'GrainSettlements');
SELECT pg_temp.wipe_table('sales', 'GrainDeliveries');
SELECT pg_temp.wipe_table('sales', 'GrainPriceFixations');
SELECT pg_temp.wipe_table('sales', 'GrainContracts');
SELECT pg_temp.wipe_table('sales', 'GrainMarketPrices');

SELECT pg_temp.wipe_table('sales', 'products');
SELECT pg_temp.wipe_table('sales', 'product_categories');

-- ---------- CRM ----------
SELECT pg_temp.wipe_table('crm', 'activities');
SELECT pg_temp.wipe_table('crm', 'opportunities');
SELECT pg_temp.wipe_table('crm', 'leads');
SELECT pg_temp.wipe_table('crm', 'customer_equipments');
SELECT pg_temp.wipe_table('crm', 'customer_contacts');
SELECT pg_temp.wipe_table('crm', 'customer_fiscal_rates');
SELECT pg_temp.wipe_table('crm', 'customer_locations');
SELECT pg_temp.wipe_table('crm', 'customers');
SELECT pg_temp.wipe_table('crm', 'suppliers');

-- ---------- Metrology ----------
SELECT pg_temp.wipe_table('metrology', 'calibration_reports');
SELECT pg_temp.wipe_table('metrology', 'instruments');
SELECT pg_temp.wipe_table('metrology', 'standard_weights');
SELECT pg_temp.wipe_table('metrology', 'equipments');
-- KEEP: metrology.tenant_settings

-- ---------- Quality registros (KEEP documents / versions / files / relations) ----------
SELECT pg_temp.wipe_table('quality', 'indicator_values');
SELECT pg_temp.wipe_table('quality', 'indicators');
SELECT pg_temp.wipe_table('quality', 'distribution_acks');
SELECT pg_temp.wipe_table('quality', 'confidentiality_commitments');
SELECT pg_temp.wipe_table('quality', 'complaints');
SELECT pg_temp.wipe_table('quality', 'non_conformities');
SELECT pg_temp.wipe_table('quality', 'internal_audits');
SELECT pg_temp.wipe_table('quality', 'training_plan_items');
SELECT pg_temp.wipe_table('quality', 'personnel_authorizations');
SELECT pg_temp.wipe_table('quality', 'competence_reviews');
SELECT pg_temp.wipe_table('quality', 'role_assignments');
SELECT pg_temp.wipe_table('quality', 'supplier_performance_reviews');
SELECT pg_temp.wipe_table('quality', 'supplier_evaluations');
SELECT pg_temp.wipe_table('quality', 'management_reviews');
SELECT pg_temp.wipe_table('quality', 'satisfaction_surveys');
SELECT pg_temp.wipe_table('quality', 'intermediate_checks');
SELECT pg_temp.wipe_table('quality', 'maintenance_plan_items');
SELECT pg_temp.wipe_table('quality', 'equipment_log_entries');
SELECT pg_temp.wipe_table('quality', 'equipments');
SELECT pg_temp.wipe_table('quality', 'audit_events');
SELECT pg_temp.wipe_table('quality', 'presentation_sessions');
SELECT pg_temp.wipe_table('quality', 'method_validations');
SELECT pg_temp.wipe_table('quality', 'institutional_notes');

-- ---------- Communications (KEEP cuentas / conexiones / templates) ----------
SELECT pg_temp.wipe_table('communications', 'email_attachments');
SELECT pg_temp.wipe_table('communications', 'email_messages');
SELECT pg_temp.wipe_table('communications', 'conversations');
SELECT pg_temp.wipe_table('communications', 'stored_media');

-- ---------- Fleet ----------
SELECT pg_temp.wipe_table('fleet', 'VehicleFuelLogs');
SELECT pg_temp.wipe_table('fleet', 'VehicleMaintenances');
SELECT pg_temp.wipe_table('fleet', 'VehicleDocuments');
SELECT pg_temp.wipe_table('fleet', 'Vehicles');
SELECT pg_temp.wipe_table('fleet', 'VehicleDrivers');

-- ---------- HR operacional (KEEP conceptos, organigrama, manuals) ----------
SELECT pg_temp.wipe_table('hr', 'PayrollSlipLines');
SELECT pg_temp.wipe_table('hr', 'PayrollSlips');
SELECT pg_temp.wipe_table('hr', 'PayrollPeriods');
SELECT pg_temp.wipe_table('hr', 'TimeTrackings');
SELECT pg_temp.wipe_table('hr', 'EppDeliveries');
SELECT pg_temp.wipe_table('hr', 'EmployeeDocuments');
SELECT pg_temp.wipe_table('hr', 'Employees');

COMMIT;

-- Verificación (ignora tablas que no existan)
DO $$
DECLARE
  checks text[][] := ARRAY[
    ARRAY['crm','customers'],
    ARRAY['sales','invoices'],
    ARRAY['sales','products'],
    ARRAY['finance','FinancialMovements'],
    ARRAY['metrology','equipments'],
    ARRAY['public','tenant_users'],
    ARRAY['public','tenant_settings']
  ];
  i int;
  sch text;
  tbl text;
  n bigint;
BEGIN
  FOR i IN 1..array_length(checks, 1) LOOP
    sch := checks[i][1];
    tbl := checks[i][2];
    IF to_regclass(format('%I.%I', sch, tbl)) IS NULL THEN
      RAISE NOTICE '% — (tabla ausente)', format('%s.%s', sch, tbl);
    ELSE
      EXECUTE format('SELECT COUNT(*) FROM %I.%I', sch, tbl) INTO n;
      RAISE NOTICE '% → % filas', format('%s.%s', sch, tbl), n;
    END IF;
  END LOOP;
END $$;
