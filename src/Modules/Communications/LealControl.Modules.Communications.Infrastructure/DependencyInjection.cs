using LealControl.BuildingBlocks.Persistence;
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
        services.AddDataProtection();
        services.AddTenantDbContext<CommunicationsDbContext>(CommunicationsDbContext.Schema);
        services.AddScoped<MailSecretProtector>(); services.AddScoped<MailTransportService>();
        services.AddScoped<MetaChannelSecretProtector>();
        services.AddScoped<ConversationService>();
        services.AddScoped<MailSyncService>();
        services.AddHostedService<CommunicationsSyncBackgroundService>();
        services.AddHttpClient<WhatsAppGatewayService>();
        services.AddHttpClient<MetaGraphApiService>();
        return services;
    }
}
