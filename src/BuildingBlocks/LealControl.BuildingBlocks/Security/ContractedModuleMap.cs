using Microsoft.AspNetCore.Http;
namespace LealControl.BuildingBlocks.Security;

public static class ContractedModuleMap
{
    private static readonly (string Prefix, string ModuleKey)[] RoutePrefixes =
    [
        ("/api/v1/accounting", "accounting"),
        ("/api/v1/finance", "finance"),
        ("/api/v1/purchases", "purchases"),
        ("/api/v1/sales", "sales"),
        ("/api/v1/grains", "grains"),
        ("/api/v1/crm", "crm"),
        ("/api/v1/communications", "communications"),
        ("/api/v1/hr", "hr"),
        ("/api/v1/fleet", "fleet"),
        ("/api/v1/metrology", "metrology"),
        ("/api/v1/automation", "automation")
    ];

    public static string? ResolveModuleKey(PathString path)
    {
        var value = path.Value;
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        foreach (var (prefix, moduleKey) in RoutePrefixes)
        {
            if (value.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
            {
                return moduleKey;
            }
        }

        return null;
    }
}
