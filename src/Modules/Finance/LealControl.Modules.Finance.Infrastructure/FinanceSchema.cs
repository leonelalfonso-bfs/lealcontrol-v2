using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

public static class FinanceSchema
{
    public static Task EnsureFinanceTablesAsync(this FinanceDbContext db, CancellationToken cancellationToken = default) => db.Database.ExecuteSqlRawAsync(@"
        CREATE SCHEMA IF NOT EXISTS finance;
        CREATE TABLE IF NOT EXISTS finance.""FinancialAccounts"" (
          ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Name"" varchar(180) NOT NULL,
          ""Currency"" varchar(8) NOT NULL, ""Type"" integer NOT NULL, ""OpeningBalance"" numeric(18,2) NOT NULL DEFAULT 0,
          ""IsActive"" boolean NOT NULL DEFAULT true, ""CreatedAtUtc"" timestamptz NOT NULL
        );
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

        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""CuitPattern"" varchar(32);
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""AmountMin"" numeric(18,2);
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""AmountMax"" numeric(18,2);
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyId"" uuid;
        ALTER TABLE finance.""FinancialConceptRules"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyType"" varchar(16);

        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyId"" uuid;
        ALTER TABLE finance.""FinancialMovements"" ADD COLUMN IF NOT EXISTS ""SuggestedCounterpartyType"" varchar(16);

        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""AdvanceAmount"" numeric(18,2) NOT NULL DEFAULT 0;
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""ExchangeDifferenceAmount"" numeric(18,2);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""VoidReason"" varchar(500);
        ALTER TABLE finance.""CollectionReceipts"" ADD COLUMN IF NOT EXISTS ""VoidedAtUtc"" timestamptz;
        ALTER TABLE finance.""CollectionReceiptImputations"" ADD COLUMN IF NOT EXISTS ""Status"" varchar(20) NOT NULL DEFAULT 'Active';

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
        ", cancellationToken);
}
