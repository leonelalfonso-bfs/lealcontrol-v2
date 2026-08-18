using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.Communications.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddCommunicationsModule(this IServiceCollection services, IConfiguration configuration)
    {
        var connection = configuration.GetConnectionString("Database") ?? throw new InvalidOperationException("Falta ConnectionStrings:Database.");
        services.AddDataProtection();
        services.AddDbContext<CommunicationsDbContext>(options => options.UseNpgsql(connection, npgsql =>
            npgsql.MigrationsHistoryTable("__ef_migrations_history", CommunicationsDbContext.Schema)));
        services.AddScoped<MailSecretProtector>(); services.AddScoped<MailTransportService>();
        return services;
    }
}
