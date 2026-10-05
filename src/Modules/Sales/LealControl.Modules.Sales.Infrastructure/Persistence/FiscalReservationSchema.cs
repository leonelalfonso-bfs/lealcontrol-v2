namespace LealControl.Modules.Sales.Infrastructure.Persistence;

internal static class FiscalReservationSchema
{
    // Conserva los intentos históricos: un conflicto existente exige revisión, no borrado.
    internal const string UpgradeSql = """
        ALTER TABLE sales.fiscal_authorization_attempts
            DROP CONSTRAINT IF EXISTS "fiscal_authorization_attempts_Status_check";
        ALTER TABLE sales.fiscal_authorization_attempts
            DROP CONSTRAINT IF EXISTS "CK_fiscal_attempt_status";
        ALTER TABLE sales.fiscal_authorization_attempts
            ADD CONSTRAINT "CK_fiscal_attempt_status"
            CHECK ("Status" IN ('Reserved','Pending','Unknown','Confirmed','Rejected'));
        CREATE UNIQUE INDEX IF NOT EXISTS "UX_fiscal_attempt_unresolved_series"
            ON sales.fiscal_authorization_attempts ("TenantId", "PointOfSale", "VoucherType")
            WHERE "Status" IN ('Reserved','Pending','Unknown');
        """;
}
