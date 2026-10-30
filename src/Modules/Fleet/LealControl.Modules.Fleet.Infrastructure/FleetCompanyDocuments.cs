using LealControl.BuildingBlocks.Notices;
using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Fleet.Infrastructure;

/// <summary>Categoría de un documento de la empresa (se guarda como texto).</summary>
public static class CompanyDocCategories
{
    public static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>
    {
        ["Art"] = "ART – certificado de cobertura", ["LifeInsurance"] = "Seguro de vida obligatorio", ["Liability"] = "Seguro de responsabilidad civil",
        ["WorkProcedure"] = "Procedimiento de trabajo", ["Training"] = "Capacitación", ["SafetyProgram"] = "Programa de seguridad / higiene",
        ["Other"] = "Otro"
    };
}

/// <summary>Documentación de la empresa que piden los clientes para el ingreso a planta (ART, seguros, procedimientos, capacitaciones).</summary>
public sealed class CompanyDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Category { get; set; } = "Other";
    public string Title { get; set; } = "";
    public string Number { get; set; } = "";
    public string? Issuer { get; set; }
    public DateTime? IssueDateUtc { get; set; }
    /// <summary>Sin vencimiento: procedimientos o constancias que no vencen.</summary>
    public DateTime? ExpirationDateUtc { get; set; }
    public int AlertDaysBefore { get; set; } = 30;
    public string? FileStorageKey { get; set; }
    public string? FileName { get; set; }
    public string? FileContentType { get; set; }
    /// <summary>Al archivarlo deja de ofrecerse para el legajo y de avisar.</summary>
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed record SaveCompanyDocumentRequest(string Category, string? Title, string? Number, string? Issuer, string? IssueDate, string? ExpirationDate, int AlertDaysBefore);
public sealed record CompanyDocumentView(Guid Id, string Category, string CategoryLabel, string Title, string Number, string? Issuer, string? IssueDate,
    string? ExpirationDate, int AlertDaysBefore, bool IsActive, int? DaysRemaining, ExpirationState State, string? FileName);

public static class FleetCompanyDocuments
{
    public static string Label(CompanyDocument d) =>
        string.IsNullOrWhiteSpace(d.Title) ? CompanyDocCategories.Labels.GetValueOrDefault(d.Category, d.Category) : d.Title;

    public static CompanyDocumentView ToView(CompanyDocument d, DateOnly today)
    {
        DateOnly? expiration = d.ExpirationDateUtc is { } e ? FleetRules.FromStoredDate(e) : null;
        var (state, days) = expiration is { } x ? FleetRules.Evaluate(x, d.AlertDaysBefore, today) : (ExpirationState.Ok, 0);
        return new CompanyDocumentView(d.Id, d.Category, CompanyDocCategories.Labels.GetValueOrDefault(d.Category, d.Category), d.Title, d.Number, d.Issuer,
            d.IssueDateUtc is { } i ? FleetRules.FromStoredDate(i).ToString("yyyy-MM-dd") : null, expiration?.ToString("yyyy-MM-dd"), d.AlertDaysBefore,
            d.IsActive, expiration is null ? null : days, d.IsActive ? state : ExpirationState.Ok, d.FileName);
    }

    private static string? Apply(CompanyDocument d, SaveCompanyDocumentRequest req)
    {
        if (!CompanyDocCategories.Labels.ContainsKey(req.Category)) return "Categoría inválida.";
        if (req.Category is "Training" or "WorkProcedure" or "Other" && string.IsNullOrWhiteSpace(req.Title)) return "Poné un título (por ejemplo, el nombre del procedimiento o de la capacitación).";
        DateOnly? issue = null, expiration = null;
        if (!string.IsNullOrWhiteSpace(req.IssueDate)) { if (!FleetRules.TryParseDate(req.IssueDate, out var i)) return "Fecha de emisión inválida."; issue = i; }
        if (!string.IsNullOrWhiteSpace(req.ExpirationDate)) { if (!FleetRules.TryParseDate(req.ExpirationDate, out var x)) return "Fecha de vencimiento inválida."; expiration = x; }
        if (issue > expiration) return "La emisión no puede ser posterior al vencimiento.";
        if (req.AlertDaysBefore is < 0 or > 365) return "Los días de aviso van de 0 a 365.";
        if ((req.Title ?? "").Trim().Length > 160 || (req.Number ?? "").Trim().Length > 80 || (req.Issuer ?? "").Trim().Length > 160) return "Título, número o emisor demasiado largos.";
        d.Category = req.Category;
        d.Title = (req.Title ?? "").Trim();
        d.Number = (req.Number ?? "").Trim();
        d.Issuer = string.IsNullOrWhiteSpace(req.Issuer) ? null : req.Issuer.Trim();
        d.IssueDateUtc = issue is { } a ? FleetRules.ToStoredDate(a) : null;
        d.ExpirationDateUtc = expiration is { } b ? FleetRules.ToStoredDate(b) : null;
        d.AlertDaysBefore = req.AlertDaysBefore;
        return null;
    }

    public static void MapFleetCompanyDocuments(this RouteGroupBuilder group)
    {
        group.MapGet("/company-documents", async (bool? history, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            var rows = await db.CompanyDocuments.AsNoTracking().Where(d => d.TenantId == t && (history == true || d.IsActive)).ToListAsync(ct);
            return Results.Ok(rows.OrderBy(d => d.Category).ThenBy(d => d.Title).Select(d => ToView(d, today)));
        });
        group.MapPost("/company-documents", async (SaveCompanyDocumentRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var doc = new CompanyDocument { Id = Guid.NewGuid(), TenantId = tenant.TenantId.Value, IsActive = true, CreatedAtUtc = clock.GetUtcNow().UtcDateTime };
            if (Apply(doc, req) is { } error) return Results.BadRequest(new { detail = error });
            db.CompanyDocuments.Add(doc);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/fleet/company-documents/{doc.Id}", ToView(doc, FleetRules.TodayInArgentina(clock.GetUtcNow())));
        });
        group.MapPut("/company-documents/{id:guid}", async (Guid id, SaveCompanyDocumentRequest req, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var doc = await db.CompanyDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            if (doc is null) return Results.NotFound(new { detail = "Documento no encontrado." });
            if (Apply(doc, req) is { } error) return Results.BadRequest(new { detail = error });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(doc, FleetRules.TodayInArgentina(clock.GetUtcNow())));
        });
        group.MapPost("/company-documents/{id:guid}/archive", async (Guid id, FleetDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var doc = await db.CompanyDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            if (doc is null) return Results.NotFound(new { detail = "Documento no encontrado." });
            doc.IsActive = !doc.IsActive;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { doc.Id, doc.IsActive });
        });
        group.MapPost("/company-documents/{id:guid}/file", async (Guid id, IFormFile? file, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var doc = await db.CompanyDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == t, ct);
            if (doc is null) return Results.NotFound(new { detail = "Documento no encontrado." });
            var result = await FleetFiles.SaveFileAsync(file, t, storage, (k, n, c) => (doc.FileStorageKey, doc.FileName, doc.FileContentType) = (k, n, c), ct);
            await db.SaveChangesAsync(ct);
            return result;
        }).DisableAntiforgery();
        group.MapGet("/company-documents/{id:guid}/file", async (Guid id, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var doc = await db.CompanyDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            return doc is null ? Results.NotFound() : await FleetFiles.OpenAsync(doc.FileStorageKey, doc.FileName, doc.FileContentType, storage, ct);
        });
    }
}

/// <summary>Aviso: documentación de la empresa (ART, seguros…) vencida o por vencer.</summary>
public sealed class FleetCompanyDocumentNotices : INoticeProvider
{
    public string Code => "fleet.company-documents";
    public string Module => "fleet";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Documentación de la empresa";
    public string Description => "ART, seguro de vida obligatorio, responsabilidad civil y demás documentación para ingreso a planta: vencida o por vencer.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new FleetDbContext(new DbContextOptionsBuilder<FleetDbContext>().UseNpgsql(context.ConnectionString).Options);
        var docs = await db.CompanyDocuments.AsNoTracking()
            .Where(d => d.TenantId == context.TenantId && d.IsActive && d.ExpirationDateUtc != null).ToListAsync(cancellationToken);
        return docs.Select(d => (Doc: d, View: FleetCompanyDocuments.ToView(d, context.Today)))
            .Where(x => x.View.State is ExpirationState.Expired or ExpirationState.DueSoon)
            .Select(x => new NoticeItem(
                $"Empresa — {FleetCompanyDocuments.Label(x.Doc)}",
                x.View.State == ExpirationState.Expired ? $"Venció el {DateOnly.Parse(x.View.ExpirationDate!):dd/MM/yyyy}" : $"Vence el {DateOnly.Parse(x.View.ExpirationDate!):dd/MM/yyyy} (en {x.View.DaysRemaining} días)",
                "/flota/empresa", x.View.State == ExpirationState.DueSoon ? NoticeSeverity.Warning : NoticeSeverity.Critical)).ToList();
    }
}
