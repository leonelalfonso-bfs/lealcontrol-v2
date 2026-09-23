using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Application;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Directory.Contracts.Customers;
using LealControl.Modules.Crm.Contracts.Opportunities;
using LealControl.Modules.Crm.Infrastructure.Arca;
using LealControl.Modules.Crm.Infrastructure.Directory;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using LealControl.Modules.Crm.Infrastructure.Persistence.Repositories;
using LealControl.Modules.Crm.Infrastructure.Tenancy;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.Crm.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddCrmModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddCrmApplication();
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly));
        services.Configure<TenancyOptions>(configuration.GetSection(TenancyOptions.SectionName));
        services.AddHttpContextAccessor();
        services.AddScoped<ITenantContext, HttpTenantContext>();

        services.AddTenantDbContext<CrmDbContext>(CrmDbContext.Schema);

        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<CrmDbContext>());
        services.AddScoped<ICustomerRepository, CustomerRepository>();
        services.AddScoped<ILeadRepository, LeadRepository>();
        services.AddScoped<IOpportunityRepository, OpportunityRepository>();
        services.AddScoped<IActivityRepository, ActivityRepository>();
        services.AddScoped<ICustomerDirectory, CustomerDirectory>();
        services.AddScoped<IOpportunityLookup, OpportunityLookup>();

        services.AddHttpClient("arca", client =>
        {
            client.Timeout = TimeSpan.FromSeconds(30);
        });
        services.AddScoped<ArcaWsaaClient>();
        services.AddScoped<ArcaPadronClient>();
        services.AddScoped<IArcaIntegration, ArcaIntegrationService>();
        return services;
    }
}
