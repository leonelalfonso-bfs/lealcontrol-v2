using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Api.SuperAdmin;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using LealControl.Modules.Communications.Infrastructure.Services;
using LealControl.Modules.Fleet.Infrastructure;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace LealControl.Api.Notices;

public sealed record DailyNoticeRecipient(string Email, string Name);

public sealed record DailyNoticePreview(
    string? Sender, IReadOnlyList<DailyNoticeRecipient> Recipients, int Expired, int Missing, int DueSoon,
    string? LastDay, string? LastResult, bool Enabled,
    /// <summary>True si los destinatarios se eligieron; false = administradores (por defecto).</summary>
    bool CustomRecipients = false,
    /// <summary>Usuarios activos con correo, para elegir.</summary>
    IReadOnlyList<DailyNoticeRecipient>? Users = null);

public sealed record SaveDailyNoticeRecipientsRequest(string[]? Emails);

public sealed record DailyNoticeResult(bool Sent, string Detail);

/// <summary>
/// Resumen diario por correo (hoy: vencimientos de Flota). Sale desde la casilla principal de la
/// empresa hacia sus administradores, una vez por día, y queda registrado en public.daily_notices.
/// Se arma en el host porque une Flota (qué avisar) con Comunicaciones (cómo enviarlo).
/// </summary>
public sealed class DailyNoticeSender(
    ITenantConnectionProvider connections,
    MailTransportService transport,
    MailOAuthService oauth,
    TimeProvider clock,
    IConfiguration configuration,
    ILogger<DailyNoticeSender> logger)
{
    public const string FleetKind = "fleet-expirations";
    /// <summary>Hora de Argentina desde la que se envía.</summary>
    public const int SendHour = 7;

    public bool Enabled => configuration.GetValue("DailyNotices:Enabled", true);

    private async Task<string> ConnectionAsync(Guid tenantId, CancellationToken ct) =>
        await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);

    private static async Task EnsureLogAsync(NpgsqlConnection db, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            CREATE TABLE IF NOT EXISTS public.daily_notices (
                "Kind" character varying(40) NOT NULL,
                "Day" date NOT NULL,
                "SentAtUtc" timestamp with time zone NOT NULL,
                "Recipients" text,
                "Detail" text,
                PRIMARY KEY ("Kind", "Day")
            );
            """, db);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Usuarios activos con correo (sin repetir correos), con su rol.</summary>
    private static async Task<List<(DailyNoticeRecipient User, bool IsAdmin)>> UsersAsync(NpgsqlConnection db, CancellationToken ct)
    {
        var list = new List<(DailyNoticeRecipient, bool)>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await using var cmd = new NpgsqlCommand("""
            SELECT lower(trim("Email")), "FullName", lower("Role") IN ('admin', 'administrador') FROM public.tenant_users
            WHERE COALESCE("IsActive", true) AND "Email" LIKE '%@%'
            ORDER BY "FullName"
            """, db);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var email = reader.GetString(0);
            if (seen.Add(email)) list.Add((new DailyNoticeRecipient(email, reader.GetString(1)), reader.GetBoolean(2)));
        }
        return list;
    }

    private static async Task EnsureSettingsAsync(NpgsqlConnection db, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            CREATE TABLE IF NOT EXISTS public.daily_notice_settings (
                "Kind" character varying(40) PRIMARY KEY,
                "Recipients" text NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL
            );
            """, db);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<List<string>?> ConfiguredRecipientsAsync(NpgsqlConnection db, CancellationToken ct)
    {
        await EnsureSettingsAsync(db, ct);
        await using var cmd = new NpgsqlCommand("""SELECT "Recipients" FROM public.daily_notice_settings WHERE "Kind" = @kind""", db);
        cmd.Parameters.AddWithValue("kind", FleetKind);
        var raw = await cmd.ExecuteScalarAsync(ct) as string;
        if (string.IsNullOrWhiteSpace(raw)) return null;
        var list = raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
        return list.Count == 0 ? null : list;
    }

    /// <summary>Los elegidos; si no se eligió a nadie, los administradores activos. Siempre sin repetidos.</summary>
    private static async Task<(List<DailyNoticeRecipient> Recipients, bool Custom, List<DailyNoticeRecipient> Users)> RecipientsAsync(NpgsqlConnection db, CancellationToken ct)
    {
        var users = await UsersAsync(db, ct);
        var configured = await ConfiguredRecipientsAsync(db, ct);
        if (configured is null)
            return (users.Where(u => u.IsAdmin).Select(u => u.User).ToList(), false, users.Select(u => u.User).ToList());
        var byEmail = users.ToDictionary(u => u.User.Email, u => u.User, StringComparer.OrdinalIgnoreCase);
        var recipients = configured.Distinct(StringComparer.OrdinalIgnoreCase)
            .Select(e => byEmail.TryGetValue(e, out var u) ? u : new DailyNoticeRecipient(e, e))
            .ToList();
        return (recipients, true, users.Select(u => u.User).ToList());
    }

    private static readonly System.Text.RegularExpressions.Regex EmailPattern =
        new(@"^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$", System.Text.RegularExpressions.RegexOptions.Compiled);

    /// <summary>Guarda los destinatarios elegidos. Vacío = volver a los administradores.</summary>
    public async Task<string?> SaveRecipientsAsync(Guid tenantId, IEnumerable<string>? emails, CancellationToken ct)
    {
        var list = (emails ?? []).Select(e => e.Trim().ToLowerInvariant()).Where(e => e.Length > 0)
            .Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        var invalid = list.FirstOrDefault(e => !EmailPattern.IsMatch(e) || e.Length > 200);
        if (invalid is not null) return $"El correo \"{invalid}\" no es válido.";
        if (list.Count > 20) return "Se pueden elegir hasta 20 destinatarios.";

        await using var db = new NpgsqlConnection(await ConnectionAsync(tenantId, ct));
        await db.OpenAsync(ct);
        await EnsureSettingsAsync(db, ct);
        await using var cmd = new NpgsqlCommand(list.Count == 0
            ? """DELETE FROM public.daily_notice_settings WHERE "Kind" = @kind"""
            : """
              INSERT INTO public.daily_notice_settings ("Kind", "Recipients", "UpdatedAtUtc") VALUES (@kind, @to, @now)
              ON CONFLICT ("Kind") DO UPDATE SET "Recipients" = @to, "UpdatedAtUtc" = @now
              """, db);
        cmd.Parameters.AddWithValue("kind", FleetKind);
        cmd.Parameters.AddWithValue("to", string.Join(",", list));
        cmd.Parameters.AddWithValue("now", clock.GetUtcNow().UtcDateTime);
        await cmd.ExecuteNonQueryAsync(ct);
        return null;
    }

    private static Task<MailAccount?> SenderAsync(CommunicationsDbContext db, Guid tenantId, CancellationToken ct) =>
        db.MailAccounts.Where(x => x.TenantId == tenantId && x.IsActive)
            .OrderByDescending(x => x.IsDefaultSender).ThenBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(ct);

    private static async Task<List<ExpirationItem>> FleetItemsAsync(string connectionString, Guid tenantId, DateOnly today, CancellationToken ct)
    {
        await using var fleet = new FleetDbContext(new DbContextOptionsBuilder<FleetDbContext>().UseNpgsql(connectionString).Options);
        var vehicles = await fleet.Vehicles.AsNoTracking().Where(x => x.TenantId == tenantId && x.Status != VehicleStatus.Sold).ToListAsync(ct);
        if (vehicles.Count == 0) return [];
        var docs = await fleet.VehicleDocuments.AsNoTracking().Where(x => x.TenantId == tenantId && x.IsActive).ToListAsync(ct);
        return FleetModule.Expirations(vehicles, docs, today);
    }

    public async Task<DailyNoticePreview> PreviewAsync(Guid tenantId, CancellationToken ct)
    {
        var cs = await ConnectionAsync(tenantId, ct);
        var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
        var items = await FleetItemsAsync(cs, tenantId, today, ct);
        await using var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options);
        var sender = await SenderAsync(comms, tenantId, ct);
        await using var db = new NpgsqlConnection(cs);
        await db.OpenAsync(ct);
        await EnsureLogAsync(db, ct);
        var (recipients, custom, users) = await RecipientsAsync(db, ct);
        string? lastDay = null, lastResult = null;
        await using (var cmd = new NpgsqlCommand("""
            SELECT "Day", "Detail" FROM public.daily_notices WHERE "Kind" = @kind ORDER BY "Day" DESC LIMIT 1
            """, db))
        {
            cmd.Parameters.AddWithValue("kind", FleetKind);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                lastDay = DateOnly.FromDateTime(reader.GetDateTime(0)).ToString("yyyy-MM-dd");
                lastResult = reader.IsDBNull(1) ? null : reader.GetString(1);
            }
        }
        return new DailyNoticePreview(sender?.EmailAddress, recipients,
            items.Count(i => i.State == ExpirationState.Expired), items.Count(i => i.State == ExpirationState.Missing),
            items.Count(i => i.State == ExpirationState.DueSoon), lastDay, lastResult, Enabled, custom, users);
    }

    /// <summary>
    /// Envía el resumen de hoy si todavía no salió (o siempre, con <paramref name="force"/>).
    /// Sin novedades no manda nada, pero lo registra.
    /// </summary>
    public async Task<DailyNoticeResult> SendFleetAsync(Guid tenantId, bool force, string? baseUrl, CancellationToken ct)
    {
        var cs = await ConnectionAsync(tenantId, ct);
        var now = clock.GetUtcNow();
        var today = FleetRules.TodayInArgentina(now);

        await using var db = new NpgsqlConnection(cs);
        await db.OpenAsync(ct);
        await EnsureLogAsync(db, ct);

        // Se reserva el día antes de enviar: dos procesos a la vez no mandan dos correos.
        await using (var claim = new NpgsqlCommand(force
            ? """
              INSERT INTO public.daily_notices ("Kind", "Day", "SentAtUtc", "Detail") VALUES (@kind, @day, @now, 'enviando')
              ON CONFLICT ("Kind", "Day") DO UPDATE SET "SentAtUtc" = @now, "Detail" = 'enviando'
              """
            : """
              INSERT INTO public.daily_notices ("Kind", "Day", "SentAtUtc", "Detail") VALUES (@kind, @day, @now, 'enviando')
              ON CONFLICT ("Kind", "Day") DO NOTHING
              """, db))
        {
            claim.Parameters.AddWithValue("kind", FleetKind);
            claim.Parameters.AddWithValue("day", today);
            claim.Parameters.AddWithValue("now", now.UtcDateTime);
            if (await claim.ExecuteNonQueryAsync(ct) == 0) return new DailyNoticeResult(false, "Ya se envió hoy.");
        }

        async Task<DailyNoticeResult> Finish(bool sent, string detail, IEnumerable<DailyNoticeRecipient>? to = null)
        {
            await using var update = new NpgsqlCommand("""
                UPDATE public.daily_notices SET "Detail" = @detail, "Recipients" = @to WHERE "Kind" = @kind AND "Day" = @day
                """, db);
            update.Parameters.AddWithValue("detail", detail);
            update.Parameters.AddWithValue("to", (object?)(to is null ? null : string.Join(", ", to.Select(r => r.Email))) ?? DBNull.Value);
            update.Parameters.AddWithValue("kind", FleetKind);
            update.Parameters.AddWithValue("day", today);
            await update.ExecuteNonQueryAsync(ct);
            return new DailyNoticeResult(sent, detail);
        }

        var items = await FleetItemsAsync(cs, tenantId, today, ct);
        if (items.Count == 0) return await Finish(false, "Sin novedades: nada vencido, por vencer ni sin cargar.");

        var (admins, custom, _) = await RecipientsAsync(db, ct);
        if (admins.Count == 0) return await Finish(false, custom
            ? "No hay destinatarios elegidos."
            : "No hay administradores activos con correo. Elegí destinatarios en Flota → Unidades.");

        await using var comms = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(cs).Options);
        var account = await SenderAsync(comms, tenantId, ct);
        if (account is null) return await Finish(false, "La empresa no tiene una casilla de correo activa (Configuración → Comunicaciones).");

        var (subject, html, text) = FleetEmail(items, today, baseUrl);
        try
        {
            await oauth.EnsureFreshAccessTokenAsync(account, ct);
            await comms.SaveChangesAsync(ct);
            await transport.SendAsync(account, new SendEmailRequest(admins.Select(a => a.Email).ToArray(), subject, html, text, null, null, null), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Aviso diario de Flota: no se pudo enviar (tenant {TenantId})", tenantId);
            return await Finish(false, $"No se pudo enviar desde {account.EmailAddress}: {ex.Message}");
        }
        return await Finish(true, $"Enviado desde {account.EmailAddress}: {items.Count} aviso(s).", admins);
    }

    public static (string Subject, string Html, string Text) FleetEmail(IReadOnlyList<ExpirationItem> items, DateOnly today, string? baseUrl)
    {
        var expired = items.Count(i => i.State == ExpirationState.Expired);
        var missing = items.Count(i => i.State == ExpirationState.Missing);
        var due = items.Count(i => i.State == ExpirationState.DueSoon);
        var parts = new[] { expired > 0 ? $"{expired} vencido(s)" : null, missing > 0 ? $"{missing} sin cargar" : null, due > 0 ? $"{due} por vencer" : null }
            .Where(x => x is not null);
        var subject = $"Flota: {string.Join(", ", parts)} — {today:dd/MM/yyyy}";

        static string Doc(FleetDocType t) => t switch
        {
            FleetDocType.VtvRto => "VTV / RTO",
            FleetDocType.InsurancePolicy => "Seguro",
            FleetDocType.Ruta => "RUTA",
            FleetDocType.FireExtinguisher => "Matafuego",
            FleetDocType.ForkliftCertification => "Habilitación autoelevador",
            FleetDocType.GreenCard => "Cédula",
            FleetDocType.GncCard => "Oblea GNC",
            FleetDocType.Senasa => "SENASA",
            _ => "Otro"
        };
        static string When(ExpirationItem i) => i.State switch
        {
            ExpirationState.Missing => "sin cargar",
            ExpirationState.Expired => $"venció el {DateOnly.Parse(i.ExpirationDate!):dd/MM/yyyy} (hace {-(i.DaysRemaining ?? 0)} días)",
            _ => i.DaysRemaining == 0 ? "vence hoy" : $"vence el {DateOnly.Parse(i.ExpirationDate!):dd/MM/yyyy} (en {i.DaysRemaining} días)"
        };

        var html = new StringBuilder();
        var text = new StringBuilder();
        html.Append("<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#1e293b\">");
        html.Append("<p>Resumen de vencimientos de la flota:</p>");
        foreach (var (state, title, color) in new[]
                 {
                     (ExpirationState.Expired, "Vencidos", "#b91c1c"),
                     (ExpirationState.Missing, "Sin cargar", "#b91c1c"),
                     (ExpirationState.DueSoon, "Por vencer", "#b45309")
                 })
        {
            var group = items.Where(i => i.State == state).ToList();
            if (group.Count == 0) continue;
            html.Append($"<h3 style=\"color:{color};margin:16px 0 6px\">{title}</h3><ul style=\"margin:0;padding-left:18px\">");
            text.AppendLine($"{title}:");
            foreach (var i in group)
            {
                var line = $"{i.VehicleLabel} ({i.VehicleName}) — {Doc(i.DocumentType)}: {When(i)}";
                html.Append($"<li>{WebUtility.HtmlEncode(line)}</li>");
                text.AppendLine($"- {line}");
            }
            html.Append("</ul>");
            text.AppendLine();
        }
        if (!string.IsNullOrWhiteSpace(baseUrl))
        {
            var url = $"{baseUrl.TrimEnd('/')}/flota";
            html.Append($"<p style=\"margin-top:16px\"><a href=\"{WebUtility.HtmlEncode(url)}\">Abrir Flota en LealControl</a></p>");
            text.AppendLine(url);
        }
        html.Append("<p style=\"color:#64748b;font-size:12px\">Aviso automático diario de LealControl. No programes trabajos con unidades vencidas.</p></div>");
        return (subject, html.ToString(), text.ToString());
    }
}

/// <summary>Cada 10 minutos: a partir de las 7 de Argentina, envía el resumen del día a cada empresa activa.</summary>
public sealed class DailyNoticesBackgroundService(IServiceProvider services, IConfiguration configuration, ILogger<DailyNoticesBackgroundService> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(10);

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
                logger.LogWarning(ex, "Avisos diarios: error general");
            }
            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var sender = scope.ServiceProvider.GetRequiredService<DailyNoticeSender>();
        if (!sender.Enabled) return;
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        if (clock.GetUtcNow().ToOffset(TimeSpan.FromHours(-3)).Hour < DailyNoticeSender.SendHour) return;

        var master = scope.ServiceProvider.GetRequiredService<MasterDbContext>();
        var tenants = await master.Tenants.AsNoTracking()
            .Where(x => x.IsActive && (x.Status == "Active" || x.Status == "Trial"))
            .Select(x => x.Id)
            .ToListAsync(ct);
        var baseUrl = configuration["FrontendBaseUrl"] ?? Environment.GetEnvironmentVariable("FRONTEND_BASE_URL")
            ?? configuration["PublicBaseUrl"] ?? Environment.GetEnvironmentVariable("PUBLIC_BASE_URL");

        foreach (var tenantId in tenants)
        {
            try
            {
                var result = await sender.SendFleetAsync(tenantId, force: false, baseUrl, ct);
                if (result.Sent) logger.LogInformation("Aviso diario de Flota enviado (tenant {TenantId}): {Detail}", tenantId, result.Detail);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Aviso diario de Flota falló para tenant {TenantId}", tenantId);
            }
        }
    }
}

public static class DailyNoticesEndpoints
{
    public static IServiceCollection AddDailyNotices(this IServiceCollection services)
    {
        services.AddScoped<DailyNoticeSender>();
        services.AddHostedService<DailyNoticesBackgroundService>();
        return services;
    }

    public static IEndpointRouteBuilder MapDailyNotices(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/notices/daily").WithTags("Avisos diarios").RequireAuthorization("RequireAdmin");

        group.MapGet("/fleet", async (ITenantContext tenant, DailyNoticeSender sender, CancellationToken ct) =>
            Results.Ok(await sender.PreviewAsync(tenant.TenantId.Value, ct)));

        // "Enviar ahora": manda el resumen aunque ya haya salido hoy (para probar o reenviar).
        group.MapPut("/fleet/recipients", async (SaveDailyNoticeRecipientsRequest req, ITenantContext tenant, DailyNoticeSender sender, CancellationToken ct) =>
        {
            var error = await sender.SaveRecipientsAsync(tenant.TenantId.Value, req.Emails, ct);
            return error is null
                ? Results.Ok(await sender.PreviewAsync(tenant.TenantId.Value, ct))
                : Results.BadRequest(new { detail = error });
        });

        group.MapPost("/fleet/send-now", async (HttpContext http, ITenantContext tenant, DailyNoticeSender sender, CancellationToken ct) =>
        {
            var baseUrl = $"{http.Request.Scheme}://{http.Request.Host}";
            var result = await sender.SendFleetAsync(tenant.TenantId.Value, force: true, baseUrl, ct);
            return Results.Ok(result);
        });

        return endpoints;
    }
}
