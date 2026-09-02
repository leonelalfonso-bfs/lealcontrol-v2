namespace LealControl.Modules.Finance.Infrastructure;

internal static class FinanceSystemMovementHelper
{
    public static FinancialReconciliationStatus ReconciliationForAccount(FinancialAccount account) =>
        account.Type == FinancialAccountType.Bank
            ? FinancialReconciliationStatus.PendingBank
            : FinancialReconciliationStatus.Reconciled;

    public static void ApplySystemDefaults(FinancialMovement movement, FinancialAccount account)
    {
        movement.Origin = FinancialMovementOrigin.System;
        movement.ClassificationStatus = FinancialClassificationStatus.Confirmed;
        movement.ClassifiedAtUtc ??= DateTime.UtcNow;
        movement.ReconciliationStatus = ReconciliationForAccount(account);
    }
}
