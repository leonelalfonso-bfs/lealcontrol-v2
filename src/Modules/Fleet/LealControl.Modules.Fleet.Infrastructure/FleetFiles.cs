using System.Globalization;
using System.IO.Compression;
using System.Text;
using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Fleet.Infrastructure;

public sealed record PacketItemRef(string Source, Guid Id);
public sealed record PacketRequest(List<PacketItemRef> Items);
/// <summary>Documento que puede ir en el legajo para ingreso a planta: de una unidad, una credencial de Flota o un documento del legajo de RRHH.</summary>
public sealed record PacketItem(string Source, Guid Id, string OwnerType, Guid OwnerId, string OwnerName, string Label, string? Number,
    string? ExpirationDate, string State, bool HasFile);

/// <summary>
/// Archivos escaneados de los vencimientos de las unidades y de las credenciales de las personas, y el legajo para ingreso a
/// planta: las personas y unidades elegidas, con sus documentos vigentes, en un ZIP con una carpeta por cada una.
/// Los documentos de RRHH se leen de su legajo (no se duplican en Flota).
/// </summary>
public static class FleetFiles
{
    private const long MaxBytes = 15 * 1024 * 1024;
    private static readonly string[] Allowed = ["application/pdf", "image/jpeg", "image/png"];

    private sealed record HrDocumentRow(Guid Id, Guid EmployeeId, string DocumentType, string FileName, string? FileUrl, DateTime? ExpiryDate);

    /// <summary>Nombres de los documentos del legajo de RRHH (los mismos que muestra su pantalla).</summary>
    private static string HrLabel(string type) => type switch
    {
        "DNI" => "DNI", "CUIL" => "Constancia de CUIL", "AltaTemprana" => "Alta temprana", "Preocupacional" => "Examen preocupacional",
        "PeriodicoArt" => "Examen periódico ART", "CargasFamilia" => "Cargas de familia", "DomicilioReal" => "Constancia de domicilio",
        "TituloEstudios" => "Título", "DatosBancarios" => "Datos bancarios", "LicenciaConducir" => "Licencia de conducir", "CV" => "CV",
        _ => type
    };

    internal static async Task<IResult> SaveFileAsync(IFormFile? file, Guid tenantId, IFileStorage storage, Action<string, string, string> assign, CancellationToken ct)
    {
        if (file is null || file.Length == 0) return Results.BadRequest(new { detail = "Elegí un archivo." });
        if (file.Length > MaxBytes) return Results.BadRequest(new { detail = "El archivo supera los 15 MB." });
        var type = file.ContentType?.ToLowerInvariant() ?? "";
        if (!Allowed.Contains(type)) return Results.BadRequest(new { detail = "Solo PDF, JPG o PNG." });
        await using var stream = file.OpenReadStream();
        var stored = await storage.SaveAsync("fleet", tenantId, file.FileName, type, stream, ct);
        assign(stored.StorageKey, Path.GetFileName(file.FileName), type);
        return Results.Ok(new { fileName = Path.GetFileName(file.FileName) });
    }

    internal static async Task<IResult> OpenAsync(string? key, string? name, string? type, IFileStorage storage, CancellationToken ct)
    {
        if (key is null) return Results.NotFound(new { detail = "No tiene archivo cargado." });
        var content = await storage.OpenReadAsync(key, ct);
        return content is null ? Results.NotFound(new { detail = "No se encontró el archivo." }) : Results.File(content.Stream, type ?? content.ContentType, name ?? content.FileName);
    }

    private static async Task<List<HrDocumentRow>> HrDocumentsAsync(FleetDbContext db, Guid tenantId, Guid[] employeeIds, CancellationToken ct)
    {
        var exists = await db.Database.SqlQuery<bool>($"""SELECT to_regclass('hr."EmployeeDocuments"') IS NOT NULL AS "Value" """).SingleAsync(ct);
        if (!exists || employeeIds.Length == 0) return [];
        return await db.Database.SqlQuery<HrDocumentRow>($"""
            SELECT "Id", "EmployeeId", "DocumentType", COALESCE("FileName", '') AS "FileName", "FileUrl", "ExpiryDate"
            FROM hr."EmployeeDocuments"
            WHERE "TenantId" = {tenantId} AND "EmployeeId" = ANY({employeeIds}) AND COALESCE("Category", 'Ingreso') <> 'Egreso'
            """).ToListAsync(ct);
    }

    private static string State(DateOnly? expiration, int alertDays, DateOnly today) =>
        expiration is not { } e ? "Vigente" : FleetRules.Evaluate(e, alertDays, today).State switch
        {
            ExpirationState.Expired => "Vencido", ExpirationState.DueSoon => "Por vencer", _ => "Vigente"
        };

    /// <summary>Documentos vigentes (no reemplazados) de las personas y unidades elegidas.</summary>
    public static async Task<List<PacketItem>> PreviewAsync(FleetDbContext db, Guid tenantId, Guid[] employeeIds, Guid[] vehicleIds, DateOnly today, CancellationToken ct, bool includeCompany = false)
    {
        var items = new List<PacketItem>();
        if (includeCompany)
        {
            foreach (var d in await db.CompanyDocuments.AsNoTracking().Where(d => d.TenantId == tenantId && d.IsActive).ToListAsync(ct))
            {
                var view = FleetCompanyDocuments.ToView(d, today);
                items.Add(new("CompanyDocument", d.Id, "Company", Guid.Empty, "Empresa", FleetCompanyDocuments.Label(d), string.IsNullOrWhiteSpace(d.Number) ? null : d.Number,
                    view.ExpirationDate, view.State == ExpirationState.Expired ? "Vencido" : view.State == ExpirationState.DueSoon ? "Por vencer" : "Vigente", d.FileStorageKey is not null));
            }
        }
        var employees = await FleetPeople.EmployeesAsync(db, tenantId, ct);
        var credentials = await db.PersonCredentials.AsNoTracking().Where(c => c.TenantId == tenantId && c.IsActive && employeeIds.Contains(c.EmployeeId)).ToListAsync(ct);
        foreach (var c in credentials)
        {
            var expiration = FleetRules.FromStoredDate(c.ExpirationDateUtc);
            items.Add(new("Credential", c.Id, "Person", c.EmployeeId, employees.GetValueOrDefault(c.EmployeeId)?.FullName ?? "?",
                FleetRules.CredentialLabel(c.Type) + (string.IsNullOrWhiteSpace(c.Category) ? "" : $" {c.Category}"), c.Number, expiration.ToString("yyyy-MM-dd"),
                State(expiration, c.AlertDaysBefore, today), c.FileStorageKey is not null));
        }
        foreach (var d in await HrDocumentsAsync(db, tenantId, employeeIds, ct))
        {
            DateOnly? expiration = d.ExpiryDate is { } x ? DateOnly.FromDateTime(x) : null;
            items.Add(new("HrDocument", d.Id, "Person", d.EmployeeId, employees.GetValueOrDefault(d.EmployeeId)?.FullName ?? "?", HrLabel(d.DocumentType), null,
                expiration?.ToString("yyyy-MM-dd"), State(expiration, 30, today), !string.IsNullOrEmpty(d.FileUrl)));
        }
        var vehicles = await db.Vehicles.AsNoTracking().Where(v => v.TenantId == tenantId && vehicleIds.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
        var documents = await db.VehicleDocuments.AsNoTracking().Where(d => d.TenantId == tenantId && d.IsActive && vehicleIds.Contains(d.VehicleId)).ToListAsync(ct);
        foreach (var d in documents)
        {
            var expiration = FleetRules.FromStoredDate(d.ExpirationDateUtc);
            var v = vehicles.GetValueOrDefault(d.VehicleId);
            items.Add(new("VehicleDocument", d.Id, "Vehicle", d.VehicleId, v is null ? "?" : $"{v.Plate} {v.Brand} {v.Model}".Trim(),
                d.DocumentType == FleetDocType.Other && !string.IsNullOrWhiteSpace(d.Title) ? d.Title : FleetRules.DocumentLabel(d.DocumentType),
                d.PolicyOrDocNumber, expiration.ToString("yyyy-MM-dd"), State(expiration, d.AlertDaysBefore, today), d.FileStorageKey is not null));
        }
        return items.OrderBy(i => i.OwnerType switch { "Company" => 0, "Person" => 1, _ => 2 }).ThenBy(i => i.OwnerName).ThenBy(i => i.Label).ToList();
    }

    private static string Safe(string name)
    {
        var invalid = Path.GetInvalidFileNameChars().Concat(['/', '\\', ':']).ToHashSet();
        var clean = new string(name.Select(c => invalid.Contains(c) ? '-' : c).ToArray()).Trim();
        return clean.Length > 90 ? clean[..90] : clean;
    }

    private static string Extension(string? fileName, string? contentType) =>
        Path.GetExtension(fileName ?? "") is { Length: > 0 } ext ? ext.ToLowerInvariant()
            : contentType switch { "image/jpeg" => ".jpg", "image/png" => ".png", _ => ".pdf" };

    public static void MapFleetFiles(this RouteGroupBuilder group)
    {
        group.MapPost("/documents/{id:guid}/file", async (Guid id, IFormFile? file, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var doc = await db.VehicleDocuments.FirstOrDefaultAsync(d => d.Id == id && d.TenantId == t, ct);
            if (doc is null) return Results.NotFound(new { detail = "Vencimiento no encontrado." });
            var result = await SaveFileAsync(file, t, storage, (k, n, c) => (doc.FileStorageKey, doc.FileName, doc.FileContentType) = (k, n, c), ct);
            await db.SaveChangesAsync(ct);
            return result;
        }).DisableAntiforgery();
        group.MapGet("/documents/{id:guid}/file", async (Guid id, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var doc = await db.VehicleDocuments.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id && d.TenantId == tenant.TenantId.Value, ct);
            return doc is null ? Results.NotFound() : await OpenAsync(doc.FileStorageKey, doc.FileName, doc.FileContentType, storage, ct);
        });
        group.MapPost("/credentials/{id:guid}/file", async (Guid id, IFormFile? file, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            var credential = await db.PersonCredentials.FirstOrDefaultAsync(c => c.Id == id && c.TenantId == t, ct);
            if (credential is null) return Results.NotFound(new { detail = "Credencial no encontrada." });
            var result = await SaveFileAsync(file, t, storage, (k, n, c) => (credential.FileStorageKey, credential.FileName, credential.FileContentType) = (k, n, c), ct);
            await db.SaveChangesAsync(ct);
            return result;
        }).DisableAntiforgery();
        group.MapGet("/credentials/{id:guid}/file", async (Guid id, FleetDbContext db, ITenantContext tenant, IFileStorage storage, CancellationToken ct) =>
        {
            var c = await db.PersonCredentials.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            return c is null ? Results.NotFound() : await OpenAsync(c.FileStorageKey, c.FileName, c.FileContentType, storage, ct);
        });

        group.MapGet("/packet/preview", async (string? employeeIds, string? vehicleIds, bool? company, FleetDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            Guid[] Parse(string? s) => (s ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => Guid.TryParse(x, out var g) ? g : Guid.Empty).Where(g => g != Guid.Empty).ToArray();
            return Results.Ok(await PreviewAsync(db, tenant.TenantId.Value, Parse(employeeIds), Parse(vehicleIds), FleetRules.TodayInArgentina(clock.GetUtcNow()), ct, company == true));
        });

        // ZIP con una carpeta por persona y por unidad, y un índice con lo que va y lo que falta.
        group.MapPost("/packet", async (PacketRequest req, FleetDbContext db, ITenantContext tenant, IFileStorage storage, TimeProvider clock, CancellationToken ct) =>
        {
            var t = tenant.TenantId.Value;
            if (req.Items.Count == 0) return Results.BadRequest(new { detail = "Elegí al menos un documento." });
            var today = FleetRules.TodayInArgentina(clock.GetUtcNow());
            var credentialIds = req.Items.Where(i => i.Source == "Credential").Select(i => i.Id).ToList();
            var documentIds = req.Items.Where(i => i.Source == "VehicleDocument").Select(i => i.Id).ToList();
            var companyIds = req.Items.Where(i => i.Source == "CompanyDocument").Select(i => i.Id).ToList();
            var companyDocs = await db.CompanyDocuments.AsNoTracking().Where(d => d.TenantId == t && companyIds.Contains(d.Id)).ToListAsync(ct);
            var credentials = await db.PersonCredentials.AsNoTracking().Where(c => c.TenantId == t && credentialIds.Contains(c.Id)).ToListAsync(ct);
            var documents = await db.VehicleDocuments.AsNoTracking().Where(d => d.TenantId == t && documentIds.Contains(d.Id)).ToListAsync(ct);
            var hrIds = req.Items.Where(i => i.Source == "HrDocument").Select(i => i.Id).ToHashSet();
            var allEmployees = await FleetPeople.EmployeesAsync(db, t, ct);
            var hr = (await HrDocumentsAsync(db, t, [.. allEmployees.Keys], ct)).Where(d => hrIds.Contains(d.Id)).ToList();
            var preview = await PreviewAsync(db, t, [.. credentials.Select(c => c.EmployeeId).Concat(hr.Select(h => h.EmployeeId)).Distinct()], [.. documents.Select(d => d.VehicleId).Distinct()], today, ct, companyDocs.Count > 0);
            var chosen = preview.Where(p => req.Items.Any(i => i.Source == p.Source && i.Id == p.Id)).ToList();

            var buffer = new MemoryStream();
            var index = new StringBuilder();
            index.AppendLine($"Legajo para ingreso a planta - generado el {today:dd/MM/yyyy}");
            index.AppendLine();
            using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
            {
                var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                async Task AddAsync(PacketItem item, Func<Task<(Stream? Stream, string Extension)>> open)
                {
                    var folder = item.OwnerType == "Company" ? "Empresa" : Safe(item.OwnerType == "Person"
                        ? $"{item.OwnerName}{(allEmployees.GetValueOrDefault(item.OwnerId)?.DocumentNumber is { Length: > 0 } dni ? $" - DNI {dni}" : "")}"
                        : item.OwnerName);
                    var line = $"[{folder}] {item.Label}{(item.Number is { Length: > 0 } n ? $" N° {n}" : "")}{(item.ExpirationDate is { } e ? $" - vence {DateOnly.Parse(e, CultureInfo.InvariantCulture):dd/MM/yyyy}" : "")} - {item.State}";
                    var (stream, ext) = await open();
                    if (stream is null)
                    {
                        index.AppendLine($"{line} - SIN ARCHIVO");
                        return;
                    }
                    var name = Safe($"{item.Label}{(item.ExpirationDate is { } exp ? $" - vence {DateOnly.Parse(exp, CultureInfo.InvariantCulture):dd-MM-yyyy}" : "")}");
                    var path = $"{folder}/{name}{ext}";
                    for (var k = 2; !used.Add(path); k++) path = $"{folder}/{name} ({k}){ext}";
                    var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
                    await using (var target = entry.Open()) { await stream.CopyToAsync(target, ct); }
                    await stream.DisposeAsync();
                    index.AppendLine(line);
                }
                foreach (var item in chosen)
                {
                    switch (item.Source)
                    {
                        case "Credential":
                            var c = credentials.First(x => x.Id == item.Id);
                            await AddAsync(item, async () => c.FileStorageKey is null ? (null, "") : ((await storage.OpenReadAsync(c.FileStorageKey, ct))?.Stream, Extension(c.FileName, c.FileContentType)));
                            break;
                        case "VehicleDocument":
                            var d = documents.First(x => x.Id == item.Id);
                            await AddAsync(item, async () => d.FileStorageKey is null ? (null, "") : ((await storage.OpenReadAsync(d.FileStorageKey, ct))?.Stream, Extension(d.FileName, d.FileContentType)));
                            break;
                        case "CompanyDocument":
                            var cd = companyDocs.First(x => x.Id == item.Id);
                            await AddAsync(item, async () => cd.FileStorageKey is null ? (null, "") : ((await storage.OpenReadAsync(cd.FileStorageKey, ct))?.Stream, Extension(cd.FileName, cd.FileContentType)));
                            break;
                        case "HrDocument":
                            var h = hr.First(x => x.Id == item.Id);
                            await AddAsync(item, () =>
                            {
                                // RRHH guarda el archivo como data URL (data:application/pdf;base64,...).
                                if (string.IsNullOrEmpty(h.FileUrl) || !h.FileUrl.StartsWith("data:", StringComparison.Ordinal) || h.FileUrl.IndexOf(',') < 0)
                                    return Task.FromResult<(Stream?, string)>((null, ""));
                                var type = h.FileUrl[5..h.FileUrl.IndexOf(';')];
                                var bytes = Convert.FromBase64String(h.FileUrl[(h.FileUrl.IndexOf(',') + 1)..]);
                                return Task.FromResult<(Stream?, string)>((new MemoryStream(bytes), Extension(h.FileName, type)));
                            });
                            break;
                    }
                }
                var readme = zip.CreateEntry("Indice.txt");
                await using var writer = new StreamWriter(readme.Open(), new UTF8Encoding(true));
                await writer.WriteAsync(index.ToString());
            }
            buffer.Position = 0;
            return Results.File(buffer, "application/zip", $"Legajo ingreso a planta {today:yyyy-MM-dd}.zip");
        });
    }
}
