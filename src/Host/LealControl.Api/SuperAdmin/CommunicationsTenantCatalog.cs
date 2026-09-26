using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Api.SuperAdmin;

public sealed class CommunicationsTenantCatalog(MasterDbContext masterDb) : ICommunicationsTenantCatalog
{
    public async Task<IReadOnlyList<Guid>> ListEnabledTenantIdsAsync(CancellationToken cancellationToken = default)
    {
        var tenants = await masterDb.Tenants.AsNoTracking()
            .Where(x => x.IsActive && (x.Status == "Active" || x.Status == "Trial"))
            .Select(x => new { x.Id, x.EnabledModulesJson })
            .ToListAsync(cancellationToken);

        return tenants
            .Where(x => HasCommunications(x.EnabledModulesJson))
            .Select(x => x.Id)
            .ToList();
    }

    private static bool HasCommunications(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            var modules = JsonSerializer.Deserialize<string[]>(json);
            return modules?.Any(x => string.Equals(x, "communications", StringComparison.OrdinalIgnoreCase)) == true;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
