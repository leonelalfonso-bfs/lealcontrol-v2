using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Api.Security;
using LealControl.Api.SuperAdmin;
using LealControl.BuildingBlocks.Notices;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Settings;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using MimeKit;
using Npgsql;

namespace LealControl.Api.Notices;

public sealed record NoticeGroup(string Code, string Module, string Label, IReadOnlyList<NoticeItem> Items);

public sealed record NoticeSetting(string Code, string Module, string Label, string Description, bool Enabled);

public sealed record NoticeSettings(bool EmailDigest, bool SystemMailConfigured, string? Email, IReadOnlyList<NoticeSetting> Notices);

public sealed record SaveNoticeSettingRequest(string? Code, bool? Enabled, bool? EmailDigest);

/// <summary>
/// Casilla del sistema (opción A): los avisos salen de una cuenta de LealControl (por ejemplo
/// avisos@lealcontrol.com por un servicio SMTP transaccional), a nombre de la empresa, con
/// respuesta a la empresa. Configuración: Notices:Smtp:* (NOTICES_SMTP_*).
/// </summary>
public sealed class SystemMailer(IConfiguration configuration)
{
    private string? Host => configuration["Notices:Smtp:Host"];
    private string? From => configuration["Notices:Smtp:From"];

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(From);

    public async Task SendAsync(string to, string toName, string companyName, string? replyTo, string subject, string html, string text, CancellationToken ct)
    {
        if (!IsConfigured) throw new InvalidOperationException("La casilla del sistema para avisos no está configurada.");
        var message = new MimeMessage();
        var fromName = string.IsNullOrWhiteSpace(companyName) ? "LealControl" : $"LealControl · {companyName}";
        message.From.Add(new MailboxAddress(fromName, From!));
        message.To.Add(new MailboxAddress(toName, to));
        if (!string.IsNullOrWhiteSpace(replyTo)) message.ReplyTo.Add(MailboxAddress.Parse(replyTo));
        message.Subject = subject;
        message.Body = new BodyBuilder { HtmlBody = html, TextBody = text }.ToMessageBody();

        using var smtp = new SmtpClient();
        var port = configuration.GetValue("Notices:Smtp:Port", 587);
        await smtp.ConnectAsync(Host!, port, port == 465 ? SecureSocketOptions.SslOnConnect : SecureSocketOptions.StartTls, ct);
        var user = configuration["Notices:Smtp:User"];
        if (!string.IsNullOrWhiteSpace(user)) await smtp.AuthenticateAsync(user, configuration["Notices:Smtp:Password"] ?? "", ct);
        await smtp.SendAsync(message, ct);
        await smtp.DisconnectAsync(true, ct);
    }
}

/// <summary>
/// Avisos personales: cada usuario ve y recibe solo los avisos de los módulos que su perfil le
/// deja ver (y con el permiso sensible que pidan), entre los que eligió.
/// </summary>
public sealed class NoticeCenter(
    IEnumerable<INoticeProvider> providers,
    ITenantConnectionProvider connections,
    SystemMailer mailer,
    TimeProvider clock,
    ILogger<NoticeCenter> logger)
{
    public const string EmailDigestCode = "__email__";
    private static readonly TimeSpan ItemsTtl = TimeSpan.FromMinutes(5);
    private static readonly ConcurrentDictionary<(Guid Tenant, string Database, string Code), (DateTime Expires, IReadOnlyList<NoticeItem> Items)> ItemsCache = new();

    public IReadOnlyList<INoticeProvider> Providers { get; } = providers.OrderBy(p => p.Module).ThenBy(p => p.Label).ToList();

    public DateOnly Today => FleetToday(clock.GetUtcNow());

    private static DateOnly FleetToday(DateTimeOffset utc) => DateOnly.FromDateTime(utc.ToOffset(TimeSpan.FromHours(-3)).DateTime);

    public static bool Allows(UserPermissions permissions, INoticeProvider provider) =>
        permissions.LevelOf(provider.Module) >= (PermissionLevel)provider.MinimumLevel && provider.Sensitivity switch
        {
            NoticeSensitivity.Amounts => permissions.IsSuperAdmin || permissions.Sensitive.Amounts,
            NoticeSensitivity.Costs => permissions.IsSuperAdmin || permissions.Sensitive.Costs,
            NoticeSensitivity.Salaries => permissions.IsSuperAdmin || permissions.Sensitive.Salaries,
            _ => true
        };

    private static async Task EnsureTablesAsync(NpgsqlConnection db, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            CREATE TABLE IF NOT EXISTS public.notice_subscriptions (
                "UserId" uuid NOT NULL,
                "Code" character varying(60) NOT NULL,
                "Enabled" boolean NOT NULL,
                "UpdatedAtUtc" timestamp with time zone NOT NULL,
                PRIMARY KEY ("UserId", "Code")
            );
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

    private static async Task<Dictionary<string, bool>> SubscriptionsAsync(NpgsqlConnection db, Guid userId, CancellationToken ct)
    {
        var result = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        await using var cmd = new NpgsqlCommand("""SELECT "Code", "Enabled" FROM public.notice_subscriptions WHERE "UserId" = @user""", db);
        cmd.Parameters.AddWithValue("user", userId);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) result[reader.GetString(0)] = reader.GetBoolean(1);
        return result;
    }

    private IEnumerable<INoticeProvider> Chosen(UserPermissions permissions, Dictionary<string, bool> subscriptions) =>
        Providers.Where(p => Allows(permissions, p) && subscriptions.GetValueOrDefault(p.Code, p.DefaultOn));

    private async Task<IReadOnlyList<NoticeItem>> ItemsAsync(INoticeProvider provider, Guid tenantId, string connectionString, CancellationToken ct)
    {
        var key = (tenantId, connectionString, provider.Code);
        if (ItemsCache.TryGetValue(key, out var cached) && cached.Expires > DateTime.UtcNow) return cached.Items;
        IReadOnlyList<NoticeItem> items;
        try
        {
            items = await provider.GetAsync(new NoticeContext(tenantId, connectionString, Today), ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Un módulo sin sus tablas (o con un error) no frena el resto de los avisos.
            logger.LogWarning(ex, "Aviso {Code} falló para la empresa {TenantId}", provider.Code, tenantId);
            items = [];
        }
        ItemsCache[key] = (DateTime.UtcNow.Add(ItemsTtl), items);
        return items;
    }

    public async Task<IReadOnlyList<NoticeGroup>> MineAsync(Guid tenantId, Guid userId, UserPermissions permissions, CancellationToken ct)
    {
        var cs = await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
        await using var db = new NpgsqlConnection(cs);
        await db.OpenAsync(ct);
        await EnsureTablesAsync(db, ct);
        var subscriptions = await SubscriptionsAsync(db, userId, ct);
        var groups = new List<NoticeGroup>();
        foreach (var provider in Chosen(permissions, subscriptions))
        {
            var items = await ItemsAsync(provider, tenantId, cs, ct);
            if (items.Count > 0) groups.Add(new NoticeGroup(provider.Code, provider.Module, provider.Label, items));
        }
        return groups;
    }

    public async Task<NoticeSettings> SettingsAsync(Guid tenantId, Guid userId, string? email, UserPermissions permissions, CancellationToken ct)
    {
        var cs = await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
        await using var db = new NpgsqlConnection(cs);
        await db.OpenAsync(ct);
        await EnsureTablesAsync(db, ct);
        var subscriptions = await SubscriptionsAsync(db, userId, ct);
        var list = Providers.Where(p => Allows(permissions, p))
            .Select(p => new NoticeSetting(p.Code, p.Module, p.Label, p.Description, subscriptions.GetValueOrDefault(p.Code, p.DefaultOn)))
            .ToList();
        return new NoticeSettings(subscriptions.GetValueOrDefault(EmailDigestCode, true), mailer.IsConfigured, email, list);
    }

    public async Task<string?> SaveSettingAsync(Guid tenantId, Guid userId, UserPermissions permissions, SaveNoticeSettingRequest request, CancellationToken ct)
    {
        var cs = await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
        await using var db = new NpgsqlConnection(cs);
        await db.OpenAsync(ct);
        await EnsureTablesAsync(db, ct);

        async Task Upsert(string code, bool enabled)
        {
            await using var cmd = new NpgsqlCommand("""
                INSERT INTO public.notice_subscriptions ("UserId", "Code", "Enabled", "UpdatedAtUtc") VALUES (@user, @code, @enabled, now())
                ON CONFLICT ("UserId", "Code") DO UPDATE SET "Enabled" = @enabled, "UpdatedAtUtc" = now()
                """, db);
            cmd.Parameters.AddWithValue("user", userId);
            cmd.Parameters.AddWithValue("code", code);
            cmd.Parameters.AddWithValue("enabled", enabled);
            await cmd.ExecuteNonQueryAsync(ct);
        }

        if (request.EmailDigest is { } digest) await Upsert(EmailDigestCode, digest);
        if (request.Code is not null)
        {
            var provider = Providers.FirstOrDefault(p => p.Code == request.Code);
            if (provider is null) return "Ese aviso no existe.";
            if (!Allows(permissions, provider)) return "Tu perfil no permite recibir ese aviso.";
            await Upsert(provider.Code, request.Enabled ?? provider.DefaultOn);
        }
        return null;
    }

    /// <summary>
    /// Resumen del día para un usuario: un solo correo con todos sus avisos, una vez por día
    /// (con <paramref name="force"/>, aunque ya haya salido).
    /// </summary>
    public async Task<(bool Sent, string Detail)> SendDigestAsync(Guid tenantId, Guid userId, bool force, string? baseUrl, CancellationToken ct)
    {
        if (!mailer.IsConfigured) return (false, "La casilla del sistema para avisos todavía no está configurada.");
        var cs = await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
        await using var crm = new CrmDbContext(new DbContextOptionsBuilder<CrmDbContext>().UseNpgsql(cs).Options);
        var tenant = new TenantId(tenantId);
        var user = await crm.TenantUsers.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId && u.TenantId == tenant, ct);
        if (user is null || !user.IsActive || !user.Email.Contains('@')) return (false, "El usuario no está activo o no tiene correo.");
        var permissions = await PermissionResolver.FromCrmAsync(crm, tenantId, userId, ct)
            ?? (user.Role is "Admin" or "Administrador" ? UserPermissions.Everything : null);
        if (permissions is null) return (false, "El usuario no tiene perfil de permisos.");
        var company = await crm.CompanySettings.AsNoTracking().FirstOrDefaultAsync(s => s.TenantId == tenant, ct);

        await using var db = new NpgsqlConnection(cs);
        await db.OpenAsync(ct);
        await EnsureTablesAsync(db, ct);
        var subscriptions = await SubscriptionsAsync(db, userId, ct);
        if (!subscriptions.GetValueOrDefault(EmailDigestCode, true)) return (false, "Eligió no recibir el resumen por correo.");

        var groups = new List<NoticeGroup>();
        foreach (var provider in Chosen(permissions, subscriptions))
        {
            var items = await ItemsAsync(provider, tenantId, cs, ct);
            if (items.Count > 0) groups.Add(new NoticeGroup(provider.Code, provider.Module, provider.Label, items));
        }
        if (groups.Count == 0) return (false, "Sin novedades para hoy.");

        var kind = $"digest:{userId:N}";
        await using (var claim = new NpgsqlCommand(force
            ? """
              INSERT INTO public.daily_notices ("Kind", "Day", "SentAtUtc", "Detail") VALUES (@kind, @day, now(), 'enviando')
              ON CONFLICT ("Kind", "Day") DO UPDATE SET "SentAtUtc" = now(), "Detail" = 'enviando'
              """
            : """
              INSERT INTO public.daily_notices ("Kind", "Day", "SentAtUtc", "Detail") VALUES (@kind, @day, now(), 'enviando')
              ON CONFLICT ("Kind", "Day") DO NOTHING
              """, db))
        {
            claim.Parameters.AddWithValue("kind", kind);
            claim.Parameters.AddWithValue("day", Today);
            if (await claim.ExecuteNonQueryAsync(ct) == 0) return (false, "Ya se envió hoy.");
        }

        var companyName = company?.TradeName ?? company?.LegalName ?? "";
        var (subject, html, text) = DigestEmail(groups, Today, companyName, user.FullName, baseUrl);
        string detail;
        var sent = false;
        try
        {
            await mailer.SendAsync(user.Email, user.FullName, companyName, company?.Email, subject, html, text, ct);
            sent = true;
            detail = $"Enviado a {user.Email}: {groups.Sum(g => g.Items.Count)} aviso(s).";
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogWarning(ex, "Resumen de avisos: no se pudo enviar a {UserId} (empresa {TenantId})", userId, tenantId);
            detail = $"No se pudo enviar: {ex.Message}";
        }
        await using (var update = new NpgsqlCommand("""UPDATE public.daily_notices SET "Detail" = @detail, "Recipients" = @to WHERE "Kind" = @kind AND "Day" = @day""", db))
        {
            update.Parameters.AddWithValue("detail", detail);
            update.Parameters.AddWithValue("to", user.Email);
            update.Parameters.AddWithValue("kind", kind);
            update.Parameters.AddWithValue("day", Today);
            await update.ExecuteNonQueryAsync(ct);
        }
        return (sent, detail);
    }

    public static (string Subject, string Html, string Text) DigestEmail(IReadOnlyList<NoticeGroup> groups, DateOnly today, string companyName, string userName, string? baseUrl)
    {
        var total = groups.Sum(g => g.Items.Count);
        var subject = $"Tus avisos de hoy{(string.IsNullOrWhiteSpace(companyName) ? "" : $" en {companyName}")}: {total} — {today:dd/MM/yyyy}";
        var html = new StringBuilder();
        var text = new StringBuilder();
        var first = (userName ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";
        html.Append("<div style=\"font-family:Arial,sans-serif;font-size:14px;color:#1e293b\">");
        html.Append($"<p>Hola {WebUtility.HtmlEncode(first)}, estos son tus avisos de hoy:</p>");
        text.AppendLine($"Hola {first}, estos son tus avisos de hoy:").AppendLine();
        foreach (var group in groups)
        {
            html.Append($"<h3 style=\"margin:18px 0 6px\">{WebUtility.HtmlEncode(group.Label)} ({group.Items.Count})</h3><ul style=\"margin:0;padding-left:18px\">");
            text.AppendLine($"{group.Label} ({group.Items.Count}):");
            foreach (var item in group.Items)
            {
                var color = item.Severity switch { NoticeSeverity.Critical => "#b91c1c", NoticeSeverity.Warning => "#b45309", _ => "#334155" };
                var link = !string.IsNullOrWhiteSpace(baseUrl) && !string.IsNullOrWhiteSpace(item.Link) ? $"{baseUrl.TrimEnd('/')}{item.Link}" : null;
                var title = WebUtility.HtmlEncode(item.Title);
                html.Append($"<li style=\"margin-bottom:4px\"><span style=\"color:{color};font-weight:bold\">")
                    .Append(link is null ? title : $"<a href=\"{WebUtility.HtmlEncode(link)}\" style=\"color:{color}\">{title}</a>")
                    .Append("</span>");
                if (!string.IsNullOrWhiteSpace(item.Detail)) html.Append($" — {WebUtility.HtmlEncode(item.Detail)}");
                html.Append("</li>");
                text.AppendLine($"- {item.Title}{(string.IsNullOrWhiteSpace(item.Detail) ? "" : $" — {item.Detail}")}");
            }
            html.Append("</ul>");
            text.AppendLine();
        }
        html.Append("<p style=\"color:#64748b;font-size:12px;margin-top:20px\">Resumen diario de LealControl. Elegís qué avisos recibir en Mi perfil → Mis avisos.</p></div>");
        text.AppendLine("Elegís qué avisos recibir en Mi perfil → Mis avisos.");
        return (subject, html.ToString(), text.ToString());
    }
}

/// <summary>Cada 10 minutos: desde las 7 de Argentina, el resumen del día de cada usuario de cada empresa activa.</summary>
public sealed class NoticeDigestBackgroundService(IServiceProvider services, IConfiguration configuration, ILogger<NoticeDigestBackgroundService> logger) : BackgroundService
{
    public const int SendHour = 7;

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
                logger.LogWarning(ex, "Resumen de avisos: error general");
            }
            await Task.Delay(TimeSpan.FromMinutes(10), stoppingToken);
        }
    }

    private async Task RunOnceAsync(CancellationToken ct)
    {
        if (!configuration.GetValue("DailyNotices:Enabled", true)) return;
        using var scope = services.CreateScope();
        var center = scope.ServiceProvider.GetRequiredService<NoticeCenter>();
        var mailer = scope.ServiceProvider.GetRequiredService<SystemMailer>();
        if (!mailer.IsConfigured) return;
        var clock = scope.ServiceProvider.GetRequiredService<TimeProvider>();
        if (clock.GetUtcNow().ToOffset(TimeSpan.FromHours(-3)).Hour < SendHour) return;

        var master = scope.ServiceProvider.GetRequiredService<MasterDbContext>();
        var connections = scope.ServiceProvider.GetRequiredService<ITenantConnectionProvider>();
        var tenants = await master.Tenants.AsNoTracking()
            .Where(x => x.IsActive && (x.Status == "Active" || x.Status == "Trial")).Select(x => x.Id).ToListAsync(ct);
        var baseUrl = configuration["FrontendBaseUrl"] ?? Environment.GetEnvironmentVariable("FRONTEND_BASE_URL")
            ?? configuration["PublicBaseUrl"] ?? Environment.GetEnvironmentVariable("PUBLIC_BASE_URL");

        foreach (var tenantId in tenants)
        {
            try
            {
                var cs = await connections.GetConnectionStringAsync(new TenantId(tenantId), ct);
                await using var crm = new CrmDbContext(new DbContextOptionsBuilder<CrmDbContext>().UseNpgsql(cs).Options);
                var tenant = new TenantId(tenantId);
                var users = await crm.TenantUsers.AsNoTracking().Where(u => u.TenantId == tenant && u.IsActive).Select(u => u.Id).ToListAsync(ct);
                foreach (var userId in users)
                {
                    var (sent, detail) = await center.SendDigestAsync(tenantId, userId, force: false, baseUrl, ct);
                    if (sent) logger.LogInformation("Resumen de avisos enviado (empresa {TenantId}): {Detail}", tenantId, detail);
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Resumen de avisos falló para la empresa {TenantId}", tenantId);
            }
        }
    }
}

public static class NoticeEndpoints
{
    public static IServiceCollection AddPersonalNotices(this IServiceCollection services)
    {
        services.AddSingleton<SystemMailer>();
        services.AddScoped<NoticeCenter>();
        services.AddHostedService<NoticeDigestBackgroundService>();
        return services;
    }

    private static (Guid Tenant, Guid User, string? Email) Who(HttpContext http)
    {
        var tenant = http.RequestServices.GetRequiredService<ITenantContext>().TenantId.Value;
        Guid.TryParse(http.User.FindFirst("sub")?.Value ?? http.User.FindFirst(ClaimTypes.NameIdentifier)?.Value, out var user);
        return (tenant, user, http.User.FindFirst("email")?.Value);
    }

    public static IEndpointRouteBuilder MapPersonalNotices(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/notices").WithTags("Avisos").RequireAuthorization();

        group.MapGet("/mine", async (HttpContext http, NoticeCenter center, PermissionResolver resolver, CancellationToken ct) =>
        {
            var (tenant, user, _) = Who(http);
            var groups = await center.MineAsync(tenant, user, await resolver.ResolveAsync(http, ct), ct);
            return Results.Ok(new { total = groups.Sum(g => g.Items.Count), groups });
        });

        group.MapGet("/settings", async (HttpContext http, NoticeCenter center, PermissionResolver resolver, CancellationToken ct) =>
        {
            var (tenant, user, email) = Who(http);
            return Results.Ok(await center.SettingsAsync(tenant, user, email, await resolver.ResolveAsync(http, ct), ct));
        });

        group.MapPut("/settings", async (SaveNoticeSettingRequest request, HttpContext http, NoticeCenter center, PermissionResolver resolver, CancellationToken ct) =>
        {
            var (tenant, user, email) = Who(http);
            var permissions = await resolver.ResolveAsync(http, ct);
            var error = await center.SaveSettingAsync(tenant, user, permissions, request, ct);
            return error is null
                ? Results.Ok(await center.SettingsAsync(tenant, user, email, permissions, ct))
                : Results.BadRequest(new { detail = error });
        });

        // "Enviarme el resumen ahora": para probar, aunque ya haya salido hoy.
        group.MapPost("/send-me-now", async (HttpContext http, NoticeCenter center, CancellationToken ct) =>
        {
            var (tenant, user, _) = Who(http);
            var (sent, detail) = await center.SendDigestAsync(tenant, user, force: true, $"{http.Request.Scheme}://{http.Request.Host}", ct);
            return Results.Ok(new { sent, detail });
        });

        return endpoints;
    }
}
