using LealControl.BuildingBlocks.Persistence;
using LealControl.Modules.Accounting.Contracts.Posting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LealControl.Modules.Accounting.Infrastructure;

public static class AccountingDependencyInjection
{
    public static IServiceCollection AddAccountingModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddTenantDbContext<AccountingDbContext>("accounting");
        services.RemoveAll<IAccountingPostingGateway>();
        services.AddScoped<IAccountingPostingGateway, AccountingPostingGateway>();
        return services;
    }

    /// <summary>
    /// Registra NoOp sólo si nadie registró un gateway todavía (Host sin módulo Contabilidad).
    /// </summary>
    public static IServiceCollection AddNoOpAccountingPostingGateway(this IServiceCollection services)
    {
        services.TryAddScoped<IAccountingPostingGateway, NoOpAccountingPostingGateway>();
        return services;
    }
}
