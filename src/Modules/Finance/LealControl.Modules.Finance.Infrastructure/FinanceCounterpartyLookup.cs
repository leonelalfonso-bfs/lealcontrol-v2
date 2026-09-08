using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

internal static partial class FinanceCounterpartyLookup
{
    [GeneratedRegex(@"(?:CUIT|C\.U\.I\.T\.?)[:\s]*(\d{2}[-\s]?\d{8}[-\s]?\d)", RegexOptions.IgnoreCase)]
    private static partial Regex CuitRegex();

    public static string? ExtractCuit(string description)
    {
        var m = CuitRegex().Match(description ?? "");
        if (!m.Success) return null;
        var digits = new string(m.Groups[1].Value.Where(char.IsDigit).ToArray());
        return digits.Length == 11 ? digits : null;
    }

    public static async Task<(Guid? Id, string Type)?> TryResolveUniqueAsync(
        FinanceDbContext db, Guid tenantId, string cuit, FinancialMovementKind kind, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(cuit)) return null;
        try
        {
            if (kind == FinancialMovementKind.Credit)
            {
                var ids = await db.Database.SqlQueryRaw<Guid>(
                    @"SELECT ""Id"" FROM crm.""Customers"" WHERE ""TenantId"" = {0} AND REPLACE(REPLACE(""TaxId"", '-', ''), ' ', '') = {1} LIMIT 2",
                    tenantId, cuit).ToListAsync(ct);
                if (ids.Count == 1) return (ids[0], "Customer");
            }
            else
            {
                var ids = await db.Database.SqlQueryRaw<Guid>(
                    @"SELECT ""Id"" FROM crm.""Suppliers"" WHERE ""TenantId"" = {0} AND REPLACE(REPLACE(""TaxId"", '-', ''), ' ', '') = {1} LIMIT 2",
                    tenantId, cuit).ToListAsync(ct);
                if (ids.Count == 1) return (ids[0], "Supplier");
            }
        }
        catch
        {
            // CRM no instalado o tablas distintas — ignorar
        }
        return null;
    }
}
