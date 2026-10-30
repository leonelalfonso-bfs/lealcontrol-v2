using System.Globalization;
using LealControl.BuildingBlocks.Notices;
using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure;

/// <summary>Documentación de la empresa que piden los clientes para el ingreso a planta (ART, seguros, procedimientos, capacitaciones).</summary>
public sealed class CompanyDocument
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string Category { get; set; } = "Other";
    public string Title { get; set; } = "";
    public string Number { get; set; } = "";
    public string? Issuer { get; set; }
    public DateTime? IssueDate { get; set; }
    /// <summary>Sin vencimiento: procedimientos o constancias que no vencen.</summary>
    public DateTime? ExpirationDate { get; set; }
    public int AlertDaysBefore { get; set; } = 30;
    public string? FileStorageKey { get; set; }
    public string? FileName { get; set; }
    public string? FileContentType { get; set; }
    /// <summary>Al archivarlo deja de ofrecerse para el legajo y de avisar.</summary>
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
}

public sealed record SaveCompanyDocumentRequest(string Category, string? Title, string? Number, string? Issuer, string? IssueDate, string? ExpirationDate, int AlertDaysBefore);
/// <summary>Estado: Ok, DueSoon (por vencer) o Expired.</summary>
public sealed record CompanyDocumentView(Guid Id, string Category, string CategoryLabel, string Title, string Number, string? Issuer, string? IssueDate,
    string? ExpirationDate, int AlertDaysBefore, bool IsActive, int? DaysRemaining, string State, string? FileName);

public static class CompanyDocuments
{
    private const long MaxBytes = 15 * 1024 * 1024;
    private static readonly string[] Allowed = ["application/pdf", "image/jpeg", "image/png"];

    public static readonly IReadOnlyDictionary<string, string> Categories = new Dictionary<string, string>
    {
        ["Art"] = "ART – certificado de cobertura", ["LifeInsurance"] = "Seguro de vida obligatorio", ["Liability"] = "Seguro de responsabilidad civil",
        ["WorkProcedure"] = "Procedimiento de trabajo", ["Training"] = "Capacitación", ["SafetyProgram"] = "Programa de seguridad / higiene", ["Other"] = "Otro"
    };

    public static string Label(CompanyDocument d) => d.Title;

    // Las fechas civiles se guardan a las 12:00 UTC para que ningún huso las corra de día.
    private static DateTime Stored(DateOnly d) => new(d.Year, d.Month, d.Day, 12, 0, 0, DateTimeKind.Utc);
    private static DateOnly Civil(DateTime d) => DateOnly.FromDateTime(d);

    public static CompanyDocumentView ToView(CompanyDocument d, DateOnly today)
    {
        DateOnly? expiration = d.ExpirationDate is { } e ? Civil(e) : null;
        int? days = expiration is { } x ? x.DayNumber - today.DayNumber : null;
        var state = days is null || !d.IsActive ? "Ok" : days < 0 ? "Expired" : days <= d.AlertDaysBefore ? "DueSoon" : "Ok";
        return new CompanyDocumentView(d.Id, d.Category, Categories.GetValueOrDefault(d.Category, d.Category), d.Title, d.Number, d.Issuer,
            d.IssueDate is { } i ? Civil(i).ToString("yyyy-MM-dd") : null, expiration?.ToString("yyyy-MM-dd"), d.AlertDaysBefore, d.IsActive, days, state, d.FileName);
    }

    private static bool TryDate(string? value, out DateOnly date) =>
        DateOnly.TryParseExact(value?.Trim(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out date);

    private static string? Apply(CompanyDocument d, SaveCompanyDocumentRequest req)
    {
        if (!Categories.ContainsKey(req.Category)) return "Categoría inválida.";
        if (req.Category is "Training" or "WorkProcedure" or "Other" && string.IsNullOrWhiteSpace(req.Title)) return "Poné un título (por ejemplo, el nombre del procedimiento o de la capacitación).";
        DateOnly? issue = null, expiration = null;
        if (!string.IsNullOrWhiteSpace(req.IssueDate)) { if (!TryDate(req.IssueDate, out var i)) return "Fecha de emisión inválida."; issue = i; }
        if (!string.IsNullOrWhiteSpace(req.ExpirationDate)) { if (!TryDate(req.ExpirationDate, out var x)) return "Fecha de vencimiento inválida."; expiration = x; }
        if (issue > expiration) return "La emisión no puede ser posterior al vencimiento.";
        if (req.AlertDaysBefore is < 0 or > 365) return "Los días de aviso van de 0 a 365.";
        if ((req.Title ?? "").Trim().Length > 160 || (req.Number ?? "").Trim().Length > 80 || (req.Issuer ?? "").Trim().Length > 160) return "Título, número o emisor demasiado largos.";
        d.Category = req.Category;
        // Sin título se guarda el nombre del tipo: así el legajo de planta lo muestra sin conocer las categorías.
        d.Title = string.IsNullOrWhiteSpace(req.Title) ? Categories[req.Category] : req.Title.Trim();
        d.Number = (req.Number ?? "").Trim();
        d.Issuer = string.IsNullOrWhiteSpace(req.Issuer) ? null : req.Issuer.Trim();
        d.IssueDate = issue is { } a ? Stored(a) : null;
        d.ExpirationDate = expiration is { } b ? Stored(b) : null;
        d.AlertDaysBefore = req.AlertDaysBefore;
        return null;
    }

    public static void MapCompanyDocuments(this RouteGroupBuilder group)
    {
        group.MapGet("/company-documents", async (bool? history, HumanResourcesDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var today = ArgentinaTime.Today(clock.GetUtcNow());
            var rows = await db.CompanyDocuments.AsNoTracking().Where(d => d.TenantId == t && (history == true || d.IsActive)).ToListAsync(ct);
            return Results.Ok(rows.OrderBy(d => d.Category).ThenBy(d => d.Title).Select(d => ToView(d, today)));
        });
        group.MapPost("/company-documents", async (SaveCompanyDocumentRequest req, HumanResourcesDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var doc = new CompanyDocument { Id = Guid.NewGuid(), TenantId = tenant.TenantId.Value, IsActive = true, CreatedAtUtc = clock.GetUtcNow().UtcDateTime };
            if (Apply(doc, req) is { } error) return Results.BadRequest(new { detail = error });
            db.CompanyDocuments.Add(doc);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/hr/company-documents/{doc.Id}", ToView(doc, ArgentinaTime.Today(clock.GetUtcNow())));
        });
        group.MapPut("/company-documents/{id:guid}", async (Guid id, SaveCompanyDocumentRequest req, HumanResourcesDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var doc = await db.CompanyDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            if (doc is null) return Results.NotFound(new { detail = "Documento no encontrado." });
            if (Apply(doc, req) is { } error) return Results.BadRequest(new { detail = error });
            await db.SaveChangesAsync(ct);
            return Results.Ok(ToView(doc, ArgentinaTime.Today(clock.GetUtcNow())));
        });
        group.MapPost("/company-documents/{id:guid}/archive", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var doc = await db.CompanyDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            if (doc is null) return Results.NotFound(new { detail = "Documento no encontrado." });
            doc.IsActive = !doc.IsActive;
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { doc.Id, doc.IsActive });
        });
        group.MapPost("/company-documents/{id:guid}/file", async (Guid id, IFormFile? file, HumanResourcesDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var doc = await db.CompanyDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == t, ct);
            if (doc is null) return Results.NotFound(new { detail = "Documento no encontrado." });
            if (file is null || file.Length == 0) return Results.BadRequest(new { detail = "Elegí un archivo." });
            if (file.Length > MaxBytes) return Results.BadRequest(new { detail = "El archivo supera los 15 MB." });
            var type = file.ContentType?.ToLowerInvariant() ?? "";
            if (!Allowed.Contains(type)) return Results.BadRequest(new { detail = "Solo PDF, JPG o PNG." });
            await using var stream = file.OpenReadStream();
            var stored = await storage.SaveAsync("hr", t, file.FileName, type, stream, ct);
            (doc.FileStorageKey, doc.FileName, doc.FileContentType) = (stored.StorageKey, Path.GetFileName(file.FileName), type);
            await db.SaveChangesAsync(ct);
            return Results.Ok(new { fileName = doc.FileName });
        }).DisableAntiforgery();
        group.MapGet("/company-documents/{id:guid}/file", async (Guid id, HumanResourcesDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var doc = await db.CompanyDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            if (doc?.FileStorageKey is null) return Results.NotFound(new { detail = "No tiene archivo cargado." });
            var content = await storage.OpenReadAsync(doc.FileStorageKey, ct);
            return content is null ? Results.NotFound(new { detail = "No se encontró el archivo." }) : Results.File(content.Stream, doc.FileContentType ?? content.ContentType, doc.FileName ?? content.FileName);
        });
    }
}

/// <summary>Aviso: documentación de la empresa (ART, seguros…) vencida o por vencer.</summary>
public sealed class CompanyDocumentNotices : INoticeProvider
{
    public string Code => "hr.company-documents";
    public string Module => "hr";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Documentación de la empresa";
    public string Description => "ART, seguro de vida obligatorio, responsabilidad civil y demás documentación para ingreso a planta: vencida o por vencer.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new HumanResourcesDbContext(new DbContextOptionsBuilder<HumanResourcesDbContext>().UseNpgsql(context.ConnectionString).Options);
        var docs = await db.CompanyDocuments.AsNoTracking()
            .Where(d => d.TenantId == context.TenantId && d.IsActive && d.ExpirationDate != null).ToListAsync(cancellationToken);
        return docs.Select(d => (Doc: d, View: CompanyDocuments.ToView(d, context.Today)))
            .Where(x => x.View.State is "Expired" or "DueSoon")
            .Select(x => new NoticeItem(
                $"Empresa — {CompanyDocuments.Label(x.Doc)}",
                x.View.State == "Expired" ? $"Venció el {DateOnly.Parse(x.View.ExpirationDate!):dd/MM/yyyy}" : $"Vence el {DateOnly.Parse(x.View.ExpirationDate!):dd/MM/yyyy} (en {x.View.DaysRemaining} días)",
                "/rrhh/documentacion-empresa", x.View.State == "DueSoon" ? NoticeSeverity.Warning : NoticeSeverity.Critical)).ToList();
    }
}
