using LealControl.BuildingBlocks.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public static class FinanceSchema
{
    public static Task EnsureFinanceTablesAsync(this FinanceDbContext db, CancellationToken cancellationToken = default) =>
        SchemaInitializationGate.RunOnceAsync(db, "finance", ct => EnsureFinanceTablesCoreAsync(db, ct));

    private static Task EnsureFinanceTablesCoreAsync(FinanceDbContext db, CancellationToken cancellationToken) => db.Database.ExecuteSqlRawAsync(@"
        CREATE SCHEMA IF NOT EXISTS finance;
        CREATE TABLE IF NOT EXISTS finance.""FinancialAccounts"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Name"" varchar(180) NOT NULL,
          ""Currency"" varchar(8) NOT NULL, ""Type"" integer NOT NULL, ""OpeningBalance"" numeric(18,2) NOT NULL DEFAULT 0,
          ""IsActive"" boolean NOT NULL DEFAULT true, ""CreatedAtUtc"" timestamptz NOT NULL
        );
        ALTER TABLE finance.""FinancialAccounts"" ADD COLUMN IF NOT EXISTS ""BookingMode"" integer NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS finance.""FinancialMovements"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""AccountId"" uuid NOT NULL,
          ""Kind"" integer NOT NULL, ""Amount"" numeric(18,2) NOT NULL, ""Currency"" varchar(8) NOT NULL,
          ""OperationDateUtc"" timestamptz NOT NULL, ""Description"" varchar(500) NOT NULL,
          ""ExternalReference"" varchar(180), ""TransferId"" uuid, ""CreatedAtUtc"" timestamptz NOT NULL
        );
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ReconciliationStatus"" integer NOT NULL DEFAULT 0;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""LinkedEntityType"" varchar(80);
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""LinkedEntityId"" uuid;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ReportedBalance"" numeric(18,2);
        CREATE TABLE IF NOT EXISTS finance.""ReceivedCheques"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""CheckNumber"" varchar(80) NOT NULL,
          ""EcheqId"" varchar(120), ""Cmc7"" varchar(180), ""Amount"" numeric(18,2) NOT NULL,
          ""Currency"" varchar(8) NOT NULL, ""IssueDateUtc"" timestamptz, ""DueDateUtc"" timestamptz,
          ""IssuerName"" varchar(240), ""IssuerTaxId"" varchar(32), ""BankName"" varchar(240),
          ""ReceivedFrom"" varchar(240), ""Status"" integer NOT NULL DEFAULT 0, ""BankAccountId"" uuid,
          ""BankMovementId"" uuid, ""DepositedAtUtc"" timestamptz, ""CreditedAtUtc"" timestamptz,
          ""Notes"" varchar(800), ""CollectionReceiptId"" uuid, ""CreatedAtUtc"" timestamptz NOT NULL
        );
        ALTER TABLE finance.""ReceivedCheques"" ADD COLUMN IF NOT EXISTS ""CollectionReceiptId"" uuid;
        ALTER TABLE finance.""ReceivedCheques"" ADD COLUMN IF NOT EXISTS ""Direction"" integer NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS ""IX_ReceivedCheques_Tenant_Status"" ON finance.""ReceivedCheques"" (""TenantId"", ""Status"");
        CREATE TABLE IF NOT EXISTS finance.""CollectionReceipts"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""AccountId"" uuid NOT NULL,
          ""CustomerId"" uuid, ""InvoiceId"" uuid, ""ReceiptNumber"" varchar(40) NOT NULL,
          ""Amount"" numeric(18,2) NOT NULL, ""Currency"" varchar(8) NOT NULL,
          ""ReceiptDateUtc"" timestamptz NOT NULL, ""Description"" varchar(500) NOT NULL,
          ""Status"" varchar(30) NOT NULL, ""CreatedAtUtc"" timestamptz NOT NULL
        );
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""InvoiceCurrency"" varchar(8);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""InvoiceAmount"" numeric(18,2);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""InvoiceExchangeRate"" numeric(18,6);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""PaymentExchangeRate"" numeric(18,6);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""SuggestedAdjustmentArs"" numeric(18,2);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""SuggestedAdjustmentType"" varchar(32);
        CREATE TABLE IF NOT EXISTS finance.""CollectionReceiptLines"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""ReceiptId"" uuid NOT NULL,
          ""Method"" varchar(32) NOT NULL, ""Amount"" numeric(18,2) NOT NULL, ""Currency"" varchar(8) NOT NULL,
          ""AccountId"" uuid, ""BankMovementId"" uuid, ""ChequeId"" uuid,
          ""RetentionType"" varchar(80), ""RetentionCertificate"" varchar(120), ""Notes"" varchar(500), ""CreatedAtUtc"" timestamptz NOT NULL
        );
        ALTER TABLE finance.""CollectionReceiptLines"" ADD COLUMN IF NOT EXISTS ""ConceptId"" uuid;
        CREATE INDEX IF NOT EXISTS ""IX_CollectionReceiptLines_Receipt"" ON finance.""CollectionReceiptLines"" (""ReceiptId"");

        CREATE TABLE IF NOT EXISTS finance.""CollectionReceiptImputations"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""ReceiptId"" uuid NOT NULL,
          ""InvoiceId"" uuid NOT NULL, ""InvoiceNumber"" varchar(80) NOT NULL,
          ""InvoiceTotal"" numeric(18,2) NOT NULL, ""AmountImputed"" numeric(18,2) NOT NULL,
          ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_CollectionReceiptImputations_Receipt"" ON finance.""CollectionReceiptImputations"" (""ReceiptId"");
        CREATE INDEX IF NOT EXISTS ""IX_CollectionReceiptImputations_Invoice"" ON finance.""CollectionReceiptImputations"" (""InvoiceId"");

        CREATE TABLE IF NOT EXISTS finance.""FinancialConcepts"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Code"" varchar(80) NOT NULL, ""Name"" varchar(180) NOT NULL,
          ""Direction"" integer NOT NULL, ""IsActive"" boolean NOT NULL DEFAULT true, ""RequiresCounterparty"" boolean NOT NULL DEFAULT false,
          ""RequiresInstrument"" boolean NOT NULL DEFAULT false, ""CashFlowCategory"" varchar(120), ""Notes"" varchar(800),
          ""CreatedAtUtc"" timestamptz NOT NULL, ""UpdatedAtUtc"" timestamptz
        );
        ALTER TABLE finance.""FinancialConcepts"" ADD COLUMN IF NOT EXISTS ""UsableIn"" integer NOT NULL DEFAULT 0;
        ALTER TABLE finance.""FinancialConcepts"" ADD COLUMN IF NOT EXISTS ""CounterpartyType"" integer NOT NULL DEFAULT 0;
        ALTER TABLE finance.""FinancialConcepts"" ADD COLUMN IF NOT EXISTS ""JournalTemplateCode"" varchar(80);
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_FinancialConcepts_Tenant_Code"" ON finance.""FinancialConcepts"" (""TenantId"", ""Code"");
        CREATE TABLE IF NOT EXISTS finance.""FinancialConceptRules"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""FinancialConceptId"" uuid NOT NULL, ""AccountId"" uuid,
          ""MovementKind"" integer, ""MatchMode"" varchar(24) NOT NULL, ""Pattern"" varchar(300) NOT NULL, ""Priority"" integer NOT NULL DEFAULT 100,
          ""IsActive"" boolean NOT NULL DEFAULT true, ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_FinancialConceptRules_Tenant_Priority"" ON finance.""FinancialConceptRules"" (""TenantId"", ""Priority"");
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ConceptId"" uuid;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ConceptRuleId"" uuid;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ClassificationStatus"" integer NOT NULL DEFAULT 0;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ClassificationNote"" varchar(500);
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ClassifiedAtUtc"" timestamptz;

        CREATE TABLE IF NOT EXISTS finance.""PaymentOrders"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""SupplierId"" uuid, ""SupplierName"" varchar(240) NOT NULL,
          ""SupplierTaxId"" varchar(32), ""OrderNumber"" varchar(40) NOT NULL, ""Amount"" numeric(18,2) NOT NULL,
          ""Currency"" varchar(8) NOT NULL, ""PaymentDateUtc"" timestamptz NOT NULL, ""Notes"" varchar(500),
          ""Status"" varchar(30) NOT NULL DEFAULT 'Confirmed', ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_PaymentOrders_Tenant_Date"" ON finance.""PaymentOrders"" (""TenantId"", ""PaymentDateUtc"");

        CREATE TABLE IF NOT EXISTS finance.""PaymentOrderLines"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""PaymentOrderId"" uuid NOT NULL,
          ""Method"" varchar(32) NOT NULL, ""Amount"" numeric(18,2) NOT NULL, ""Currency"" varchar(8) NOT NULL,
          ""AccountId"" uuid, ""BankMovementId"" uuid, ""ChequeId"" uuid,
          ""RetentionType"" varchar(80), ""RetentionCertificate"" varchar(120), ""Notes"" varchar(500), ""CreatedAtUtc"" timestamptz NOT NULL
        );
        ALTER TABLE finance.""PaymentOrderLines"" ADD COLUMN IF NOT EXISTS ""ConceptId"" uuid;
        CREATE INDEX IF NOT EXISTS ""IX_PaymentOrderLines_Order"" ON finance.""PaymentOrderLines"" (""PaymentOrderId"");

        CREATE TABLE IF NOT EXISTS finance.""PaymentOrderImputations"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""PaymentOrderId"" uuid NOT NULL,
          ""PurchaseInvoiceId"" uuid NOT NULL, ""InvoiceNumber"" varchar(80) NOT NULL,
          ""InvoiceTotal"" numeric(18,2) NOT NULL, ""AmountImputed"" numeric(18,2) NOT NULL,
          ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_PaymentOrderImputations_Order"" ON finance.""PaymentOrderImputations"" (""PaymentOrderId"");

        CREATE TABLE IF NOT EXISTS finance.""BankStatementImports"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""AccountId"" uuid NOT NULL,
          ""FileName"" varchar(260), ""FileHash"" varchar(64) NOT NULL,
          ""PeriodStart"" timestamptz, ""PeriodEnd"" timestamptz,
          ""DeclaredOpeningBalance"" numeric(18,2), ""DeclaredClosingBalance"" numeric(18,2),
          ""ComputedClosingBalance"" numeric(18,2),
          ""RowsTotal"" integer NOT NULL DEFAULT 0, ""RowsImported"" integer NOT NULL DEFAULT 0,
          ""RowsDuplicated"" integer NOT NULL DEFAULT 0, ""RowsRejected"" integer NOT NULL DEFAULT 0,
          ""Status"" varchar(20) NOT NULL DEFAULT 'Balanced', ""CreatedAtUtc"" timestamptz NOT NULL,
          ""CreatedBy"" varchar(120)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_BankStatementImports_Tenant_Account_Hash"" ON finance.""BankStatementImports"" (""TenantId"", ""AccountId"", ""FileHash"");
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""Origin"" integer NOT NULL DEFAULT 1;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""ImportId"" uuid;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""MatchedMovementId"" uuid;
        CREATE INDEX IF NOT EXISTS ""IX_FinancialMovements_ImportId"" ON finance.""FinancialMovements"" (""ImportId"");
        CREATE INDEX IF NOT EXISTS ""IX_FinancialMovements_MatchedMovementId"" ON finance.""FinancialMovements"" (""MatchedMovementId"");
        -- Backfill: filas de extracto quedaron Origin=System (default 1) al agregar la columna.
        UPDATE finance.""FinancialMovements""
           SET ""Origin"" = 0
         WHERE ""Origin"" = 1
           AND ""ImportId"" IS NOT NULL;
        UPDATE finance.""FinancialMovements""
           SET ""Origin"" = 0
         WHERE ""Origin"" = 1
           AND ""ImportId"" IS NULL
           AND ""TransferId"" IS NULL
           AND ""LinkedEntityType"" IS NULL
           AND ""ClassifiedAtUtc"" IS NOT NULL
           AND ""ReconciliationStatus"" NOT IN (4, 5);

        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""CuitPattern"" varchar(32);
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""AmountMin"" numeric(18,2);
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""AmountMax"" numeric(18,2);
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyId"" uuid;
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyType"" varchar(16);

        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyId"" uuid;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyType"" varchar(16);
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""CounterpartyTaxId"" varchar(11);
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""CounterpartyName"" varchar(160);
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""BankCode"" varchar(20);

        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""AdvanceAmount"" numeric(18,2) NOT NULL DEFAULT 0;
        -- Copia de SuggestedAdjustmentArs que nadie leía: se retira.
        ALTER TABLE finance.""CollectionReceipts"" DROP COLUMN IF EXISTS ""ExchangeDifferenceAmount"";
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""VoidReason"" varchar(500);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""VoidedAtUtc"" timestamptz;
        ALTER TABLE finance.""CollectionReceiptImputations"" ADD COLUMN IF NOT EXISTS ""Status"" varchar(20) NOT NULL DEFAULT 'Active';
        ALTER TABLE finance.""CollectionReceiptImputations"" ADD COLUMN IF NOT EXISTS ""AmountUsd"" numeric(18,2);
        ALTER TABLE finance.""CollectionReceiptImputations"" ADD COLUMN IF NOT EXISTS ""InvoiceExchangeRate"" numeric(18,6);
        ALTER TABLE finance.""CollectionReceiptImputations"" ADD COLUMN IF NOT EXISTS ""PaymentExchangeRate"" numeric(18,6);
        ALTER TABLE finance.""CollectionReceiptImputations"" ADD COLUMN IF NOT EXISTS ""ExchangeDifferenceArs"" numeric(18,2);

        ALTER TABLE finance.""PaymentOrders"" ADD COLUMN IF NOT EXISTS ""AdvanceAmount"" numeric(18,2) NOT NULL DEFAULT 0;
        ALTER TABLE finance.""PaymentOrders"" ADD COLUMN IF NOT EXISTS ""VoidReason"" varchar(500);
        ALTER TABLE finance.""PaymentOrders"" ADD COLUMN IF NOT EXISTS ""VoidedAtUtc"" timestamptz;

        ALTER TABLE finance.""ReceivedCheques"" ADD COLUMN IF NOT EXISTS ""CustomerId"" uuid;
        ALTER TABLE finance.""ReceivedCheques"" ADD COLUMN IF NOT EXISTS ""SupplierId"" uuid;
        ALTER TABLE finance.""ReceivedCheques"" ADD COLUMN IF NOT EXISTS ""PaymentOrderId"" uuid;

        CREATE TABLE IF NOT EXISTS finance.""DocumentSequences"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""DocumentType"" varchar(20) NOT NULL,
          ""Prefix"" varchar(20) NOT NULL, ""NextNumber"" integer NOT NULL DEFAULT 1, ""UpdatedAtUtc"" timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_DocumentSequences_Tenant_Type_Prefix"" ON finance.""DocumentSequences"" (""TenantId"", ""DocumentType"", ""Prefix"");

        CREATE TABLE IF NOT EXISTS finance.""CustomerAdvances"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""CustomerId"" uuid NOT NULL,
          ""CollectionReceiptId"" uuid NOT NULL, ""Amount"" numeric(18,2) NOT NULL,
          ""RemainingAmount"" numeric(18,2) NOT NULL, ""Currency"" varchar(8) NOT NULL,
          ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_CustomerAdvances_Tenant_Customer"" ON finance.""CustomerAdvances"" (""TenantId"", ""CustomerId"");

        CREATE TABLE IF NOT EXISTS finance.""BankImportProfiles"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""AccountId"" uuid NOT NULL,
          ""Name"" varchar(120) NOT NULL, ""ColumnMapJson"" varchar(4000) NOT NULL,
          ""Delimiter"" varchar(4) NOT NULL DEFAULT ';', ""DateFormat"" varchar(40),
          ""CreatedAtUtc"" timestamptz NOT NULL, ""UpdatedAtUtc"" timestamptz
        );
        CREATE INDEX IF NOT EXISTS ""IX_BankImportProfiles_Tenant_Account"" ON finance.""BankImportProfiles"" (""TenantId"", ""AccountId"");

        CREATE TABLE IF NOT EXISTS finance.""WithholdingSettings"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""IsAgent"" boolean NOT NULL DEFAULT false,
          ""AgentSince"" timestamptz, ""UpdatedAtUtc"" timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_WithholdingSettings_Tenant"" ON finance.""WithholdingSettings"" (""TenantId"");
        CREATE TABLE IF NOT EXISTS finance.""WithholdingRegimes"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Code"" varchar(3) NOT NULL, ""Name"" varchar(200) NOT NULL,
          ""NonTaxableAmount"" numeric(18,2) NOT NULL, ""RateRegistered"" numeric(9,4) NOT NULL, ""RateUnregistered"" numeric(9,4) NOT NULL,
          ""MinimumWithholding"" numeric(18,2) NOT NULL, ""Source"" varchar(300) NOT NULL DEFAULT '', ""IsActive"" boolean NOT NULL DEFAULT true
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_WithholdingRegimes_Tenant_Code"" ON finance.""WithholdingRegimes"" (""TenantId"", ""Code"");
        CREATE TABLE IF NOT EXISTS finance.""SupplierWithholdingProfiles"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""SupplierId"" uuid NOT NULL, ""Condition"" varchar(20) NOT NULL,
          ""RegimeCode"" varchar(3) NOT NULL, ""ExcludedUntil"" timestamptz, ""UpdatedAtUtc"" timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_SupplierWithholdingProfiles_Supplier"" ON finance.""SupplierWithholdingProfiles"" (""TenantId"", ""SupplierId"");
        CREATE TABLE IF NOT EXISTS finance.""Withholdings"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""PaymentOrderId"" uuid NOT NULL, ""PaymentOrderNumber"" varchar(40) NOT NULL,
          ""SupplierId"" uuid NOT NULL, ""SupplierName"" varchar(200) NOT NULL, ""SupplierTaxId"" varchar(20) NOT NULL DEFAULT '',
          ""Condition"" varchar(20) NOT NULL, ""RegimeCode"" varchar(3) NOT NULL, ""RegimeName"" varchar(200) NOT NULL,
          ""Date"" timestamptz NOT NULL, ""PaymentAmount"" numeric(18,2) NOT NULL, ""Base"" numeric(18,2) NOT NULL,
          ""PriorBase"" numeric(18,2) NOT NULL, ""PriorWithheld"" numeric(18,2) NOT NULL, ""NonTaxableAmount"" numeric(18,2) NOT NULL,
          ""Rate"" numeric(9,4) NOT NULL, ""Amount"" numeric(18,2) NOT NULL, ""CertificateNumber"" varchar(40),
          ""Status"" varchar(20) NOT NULL DEFAULT 'Active', ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_Withholdings_Supplier_Month"" ON finance.""Withholdings"" (""TenantId"", ""SupplierId"", ""RegimeCode"", ""Date"");
        CREATE INDEX IF NOT EXISTS ""IX_Withholdings_Order"" ON finance.""Withholdings"" (""PaymentOrderId"");

        ALTER TABLE finance.""CollectionReceiptLines"" ADD COLUMN IF NOT EXISTS ""Jurisdiction"" varchar(3);
        ALTER TABLE finance.""WithholdingSettings"" ADD COLUMN IF NOT EXISTS ""DefaultJurisdiction"" varchar(3);
        CREATE TABLE IF NOT EXISTS finance.""SufferedTaxJurisdictions"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""SourceType"" varchar(20) NOT NULL, ""SourceId"" uuid NOT NULL, ""Jurisdiction"" varchar(3) NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_SufferedTaxJurisdictions_Source"" ON finance.""SufferedTaxJurisdictions"" (""TenantId"", ""SourceType"", ""SourceId"");

        ALTER TABLE finance.""FinancialAccounts"" ADD COLUMN IF NOT EXISTS ""Cbu"" varchar(22);
        CREATE TABLE IF NOT EXISTS finance.""SupplierBankAccounts"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""SupplierId"" uuid NOT NULL, ""Cbu"" varchar(22) NOT NULL, ""Alias"" varchar(40), ""UpdatedAtUtc"" timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_SupplierBankAccounts_Supplier"" ON finance.""SupplierBankAccounts"" (""TenantId"", ""SupplierId"");
        CREATE TABLE IF NOT EXISTS finance.""PaymentBatches"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Number"" integer NOT NULL, ""AccountId"" uuid NOT NULL, ""AccountCbu"" varchar(22) NOT NULL,
          ""RequestDate"" timestamptz NOT NULL, ""Consolidated"" boolean NOT NULL, ""Total"" numeric(18,2) NOT NULL, ""Status"" varchar(20) NOT NULL,
          ""CreatedBy"" varchar(120), ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_PaymentBatches_Number"" ON finance.""PaymentBatches"" (""TenantId"", ""Number"");
        CREATE TABLE IF NOT EXISTS finance.""PaymentBatchItems"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""BatchId"" uuid NOT NULL REFERENCES finance.""PaymentBatches"" (""Id"") ON DELETE CASCADE,
          ""MovementId"" uuid NOT NULL, ""PaymentOrderId"" uuid NOT NULL, ""PaymentOrderNumber"" varchar(40) NOT NULL, ""SupplierName"" varchar(200) NOT NULL,
          ""SupplierTaxId"" varchar(11) NOT NULL, ""Cbu"" varchar(22) NOT NULL, ""Amount"" numeric(18,2) NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ""IX_PaymentBatchItems_Movement"" ON finance.""PaymentBatchItems"" (""MovementId"");

        CREATE TABLE IF NOT EXISTS finance.""InvestmentFunds"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Name"" varchar(120) NOT NULL, ""Currency"" varchar(8) NOT NULL, ""AccountId"" uuid,
          ""OpeningUnits"" numeric(20,6) NOT NULL DEFAULT 0, ""OpeningDate"" timestamptz, ""OpeningCost"" numeric(18,2) NOT NULL DEFAULT 0,
          ""LastUnitValue"" numeric(18,6), ""LastUnitValueDate"" timestamptz, ""CreatedAtUtc"" timestamptz NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_InvestmentFunds_Name"" ON finance.""InvestmentFunds"" (""TenantId"", ""Name"", ""Currency"");
        CREATE TABLE IF NOT EXISTS finance.""InvestmentFundOperations"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""FundId"" uuid NOT NULL REFERENCES finance.""InvestmentFunds"" (""Id"") ON DELETE CASCADE,
          ""ExternalId"" varchar(40) NOT NULL, ""Kind"" varchar(20) NOT NULL, ""RequestDate"" timestamptz NOT NULL, ""SettlementDate"" timestamptz NOT NULL,
          ""Amount"" numeric(18,2) NOT NULL, ""Units"" numeric(20,6) NOT NULL, ""UnitValue"" numeric(18,6), ""Status"" varchar(30) NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ""IX_InvestmentFundOperations_External"" ON finance.""InvestmentFundOperations"" (""TenantId"", ""ExternalId"");
        CREATE INDEX IF NOT EXISTS ""IX_InvestmentFundOperations_Fund"" ON finance.""InvestmentFundOperations"" (""FundId"");
        ", cancellationToken);
}
