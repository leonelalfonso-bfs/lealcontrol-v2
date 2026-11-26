using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Api.SuperAdmin;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace LealControl.Api.Ai;

public sealed record AiSettingsRequest(string? ApiKey, decimal MonthlyBudgetUsd, bool MailReadingEnabled, bool AutoOpportunities, string? BusinessDescription, bool SupervisorEnabled = false);

public static class AiEndpoints
{
    private static readonly ConcurrentDictionary<string, bool> Ensured = new();

    /// <summary>Crea las tablas de la IA la primera vez que se usan en cada base.</summary>
    public static async Task<AiDbContext> OpenAsync(string connectionString, CancellationToken ct)
    {
        var db = AiDbContext.Open(connectionString);
        if (!Ensured.ContainsKey(connectionString))
        {
            await db.EnsureTablesCreatedAsync(ct);
            Ensured[connectionString] = true;
        }
        return db;
    }

    public static IServiceCollection AddAi(this IServiceCollection services)
    {
        services.AddSingleton<AiKeyProtector>();
        services.AddSingleton<IAiClient, ClaudeAiClient>();
        services.AddSingleton<AiMailReader>();
        services.AddSingleton<AiSupervisor>();
        services.AddSingleton<LealControl.BuildingBlocks.Notices.INoticeProvider, AiBriefingNotices>();
        services.AddHostedService<AiBackgroundService>();
        return services;
    }

    // Bajo Comunicaciones: ver la configuración pide Ver; guardarla y probarla ("settings") pide Administrar.
    public static IEndpointRouteBuilder MapAiEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/communications/ai/settings").RequireAuthorization();

        group.MapGet("", async (ITenantContext tenant, ITenantConnectionProvider connections, TimeProvider clock, CancellationToken ct) =>
        {
            var cs = await connections.GetConnectionStringAsync(tenant.TenantId, ct);
            await using var db = await OpenAsync(cs, ct);
            var settings = await db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenant.TenantId.Value, ct) ?? AiSettings.For(tenant.TenantId.Value);
            var (spent, calls) = await db.MonthAsync(tenant.TenantId.Value, clock.GetUtcNow().UtcDateTime, ct);
            return Results.Ok(new
            {
                provider = "Claude (Anthropic)",
                readerModel = AiModels.Reader,
                hasKey = settings.ProtectedApiKey is not null,
                settings.KeyHint,
                settings.MonthlyBudgetUsd,
                settings.MailReadingEnabled,
                settings.AutoOpportunities,
                settings.SupervisorEnabled,
                supervisorModel = AiModels.Supervisor,
                settings.BusinessDescription,
                settings.EnabledAtUtc,
                settings.LastError,
                monthSpentUsd = Math.Round(spent, 4),
                monthCalls = calls,
            });
        });

        group.MapPut("", async (AiSettingsRequest body, ITenantContext tenant, ITenantConnectionProvider connections, AiKeyProtector keys, TimeProvider clock, CancellationToken ct) =>
        {
            var now = clock.GetUtcNow().UtcDateTime;
            var cs = await connections.GetConnectionStringAsync(tenant.TenantId, ct);
            await using var db = await OpenAsync(cs, ct);
            var settings = await db.Settings.FirstOrDefaultAsync(s => s.TenantId == tenant.TenantId.Value, ct);
            if (settings is null) db.Settings.Add(settings = AiSettings.For(tenant.TenantId.Value));

            // null: no se toca la clave; "": se borra; texto: se reemplaza.
            if (body.ApiKey is { } key)
            {
                key = key.Trim();
                settings.SetApiKey(key.Length == 0 ? null : keys.Protect(key), key.Length < 8 ? null : key[^4..], now);
            }
            if ((body.MailReadingEnabled || body.SupervisorEnabled) && settings.ProtectedApiKey is null)
                return Results.BadRequest(new { error = "Cargá la clave de la API antes de activar la IA." });
            settings.Update(body.MonthlyBudgetUsd, body.MailReadingEnabled, body.AutoOpportunities, body.SupervisorEnabled, body.BusinessDescription, now);
            await db.SaveChangesAsync(ct);
            return Results.NoContent();
        });

        // Una consulta mínima para comprobar la clave (cuesta una fracción de centavo y queda registrada).
        group.MapPost("/test", async (ITenantContext tenant, ITenantConnectionProvider connections, AiKeyProtector keys, IAiClient ai, TimeProvider clock, CancellationToken ct) =>
        {
            var now = clock.GetUtcNow().UtcDateTime;
            var cs = await connections.GetConnectionStringAsync(tenant.TenantId, ct);
            await using var db = await OpenAsync(cs, ct);
            var settings = await db.Settings.FirstOrDefaultAsync(s => s.TenantId == tenant.TenantId.Value, ct);
            if (settings?.ProtectedApiKey is null) return Results.BadRequest(new { error = "No hay clave cargada." });
            var schema = new Dictionary<string, JsonElement>
            {
                ["type"] = JsonSerializer.SerializeToElement("object"),
                ["properties"] = JsonSerializer.SerializeToElement(new { ok = new { type = "boolean" } }),
                ["required"] = JsonSerializer.SerializeToElement(new[] { "ok" }),
                ["additionalProperties"] = JsonSerializer.SerializeToElement(false),
            };
            try
            {
                var result = await ai.CompleteJsonAsync(keys.Unprotect(settings.ProtectedApiKey), AiModels.Reader,
                    "Respondé ok = true.", "Prueba de conexión.", schema, 50, ct);
                db.Usage.Add(AiUsage.Record(tenant.TenantId.Value, "test", AiModels.Reader, result.InputTokens, result.OutputTokens,
                    AiModels.Cost(AiModels.Reader, result.InputTokens, result.OutputTokens), null, now));
                settings.RecordError(null);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { ok = true, detail = "La clave funciona." });
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                db.Usage.Add(AiUsage.Record(tenant.TenantId.Value, "test", AiModels.Reader, 0, 0, 0m, ex.Message, now));
                settings.RecordError(ex.Message);
                await db.SaveChangesAsync(ct);
                return Results.Ok(new { ok = false, detail = ex.Message });
            }
        });

        return app;
    }
}

/// <summary>Cada 5 minutos, lee con IA los mails nuevos y, desde las 6 de cada día hábil, arma el informe del supervisor comercial.</summary>
public sealed class AiBackgroundService(IServiceProvider services, TimeProvider clock, ILogger<AiBackgroundService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunOnceAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "IA: error general");
            }
            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var master = scope.ServiceProvider.GetRequiredService<MasterDbContext>();
        var connections = scope.ServiceProvider.GetRequiredService<ITenantConnectionProvider>();
        var reader = scope.ServiceProvider.GetRequiredService<AiMailReader>();
        var supervisor = scope.ServiceProvider.GetRequiredService<AiSupervisor>();
        var tenants = await master.Tenants.AsNoTracking()
            .Where(x => x.IsActive && (x.Status == "Active" || x.Status == "Trial")).Select(x => x.Id).ToListAsync(ct);
        foreach (var tenantId in tenants)
        {
            try
            {
                var cs = await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
                await (await AiEndpoints.OpenAsync(cs, ct)).DisposeAsync();
                var read = await reader.ReadPendingAsync(cs, tenantId, clock.GetUtcNow().UtcDateTime, ct);
                if (read > 0) logger.LogInformation("IA: {Count} conversaciones leídas (empresa {TenantId})", read, tenantId);
                if (await supervisor.GenerateAsync(cs, tenantId, clock.GetUtcNow().UtcDateTime, ct))
                    logger.LogInformation("IA: informe del supervisor comercial listo (empresa {TenantId})", tenantId);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogWarning(ex, "IA: falló la lectura de mails de la empresa {TenantId}", tenantId);
            }
        }
    }
}
