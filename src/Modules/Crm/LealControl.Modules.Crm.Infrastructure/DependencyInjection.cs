using LealControl.BuildingBlocks.Persistence;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Application;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Contracts.Customers;
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
        services.Configure<TenancyOptions>(configuration.GetSection(TenancyOptions.SectionName));
        services.AddHttpContextAccessor();
        services.AddScoped<ITenantContext, HttpTenantContext>();

        var connectionString = configuration.GetConnectionString("Database")
            ?? throw new InvalidOperationException("Falta ConnectionStrings:Database.");

        services.AddDbContext<CrmDbContext>(options =>
            options.UseNpgsql(connectionString, npgsql =>
                npgsql.MigrationsHistoryTable("__ef_migrations_history", CrmDbContext.Schema)));

        services.AddScoped<IUnitOfWork>(sp => sp.GetRequiredService<CrmDbContext>());
        services.AddScoped<ICustomerRepository, CustomerRepository>();
        services.AddScoped<ILeadRepository, LeadRepository>();
        services.AddScoped<IOpportunityRepository, OpportunityRepository>();
        services.AddScoped<IActivityRepository, ActivityRepository>();
        services.AddScoped<ICustomerDirectory, CustomerDirectory>();
        return services;
    }
}
