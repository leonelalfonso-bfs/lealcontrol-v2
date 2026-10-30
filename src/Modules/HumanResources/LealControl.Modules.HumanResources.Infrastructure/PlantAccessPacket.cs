using System.Globalization;
using System.IO.Compression;
using System.Text;
using LealControl.BuildingBlocks.Storage;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.BuildingBlocks.Time;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure;

public sealed record PacketItemRef(string Source, Guid Id);
public sealed record PacketRequest(List<PacketItemRef> Items);
/// <summary>Documento que puede ir en el legajo: de la empresa, del legajo de RRHH, una credencial de Flota o un vencimiento de una unidad.</summary>
public sealed record PacketItem(string Source, Guid Id, string OwnerType, Guid OwnerId, string OwnerName, string Label, string? Number,
    string? ExpirationDate, string State, bool HasFile);

/// <summary>
/// Legajo para ingreso a planta: la documentación de la empresa, de las personas elegidas (legajo de RRHH y credenciales de
/// Flota) y de las unidades elegidas, en un ZIP con una carpeta por cada una y un índice. Lo de Flota se lee de sus tablas
/// (si la empresa usa Flota); nada se copia.
/// </summary>
public static class PlantAccessPacket
{
    /// <summary>Documento con lo necesario para abrir su archivo: clave del almacenamiento o data URL (legajo de RRHH).</summary>
    private sealed record Entry(PacketItem Item, string? StorageKey, string? FileName, string? ContentType, string? DataUrl);
    private sealed record CredentialRow(Guid Id, Guid EmployeeId, int Type, string? Category, string Number, DateTime ExpirationDateUtc, int AlertDaysBefore,
        string? FileStorageKey, string? FileName, string? FileContentType);
    private sealed record VehicleDocRow(Guid Id, Guid VehicleId, string Vehicle, int DocumentType, string Title, string PolicyOrDocNumber, DateTime ExpirationDateUtc,
        int AlertDaysBefore, string? FileStorageKey, string? FileName, string? FileContentType);

    // Mismos nombres que muestra Flota (sus tipos se guardan como número).
    private static string CredentialLabel(int type) => type switch
    {
        0 => "Licencia de conducir", 1 => "LINTI", 2 => "Carnet de autoelevadorista", 3 => "Apto médico", _ => "Otra credencial"
    };
    private static string VehicleDocLabel(int type) => type switch
    {
        0 => "VTV / RTO", 1 => "Seguro", 2 => "Cédula", 3 => "Oblea GNC", 4 => "SENASA", 5 => "RUTA", 7 => "Matafuego", 8 => "Habilitación autoelevador", _ => "Otro"
    };
    private static string HrLabel(string type) => type switch
    {
        "DNI" => "DNI", "CUIL" => "Constancia de CUIL", "AltaTemprana" => "Alta temprana", "Preocupacional" => "Examen preocupacional",
        "PeriodicoArt" => "Examen periódico ART", "CargasFamilia" => "Cargas de familia", "DomicilioReal" => "Constancia de domicilio",
        "TituloEstudios" => "Título", "DatosBancarios" => "Datos bancarios", "LicenciaConducir" => "Licencia de conducir", "CV" => "CV",
        _ => type
    };

    private static string State(DateOnly? expiration, int alertDays, DateOnly today) =>
        expiration is not { } e ? "Vigente" : e < today ? "Vencido" : e.DayNumber - today.DayNumber <= alertDays ? "Por vencer" : "Vigente";
    private static string? Day(DateOnly? d) => d?.ToString("yyyy-MM-dd");

    private static async Task<bool> ExistsAsync(HumanResourcesDbContext db, string table, CancellationToken ct) =>
        await db.Database.SqlQuery<bool>($"SELECT to_regclass({table}) IS NOT NULL AS \"Value\"").SingleAsync(ct);

    /// <summary>Todos los documentos posibles para las personas y unidades elegidas (y la empresa, si se pide).</summary>
    private static async Task<(List<Entry> Entries, Dictionary<Guid, Employee> Employees)> EntriesAsync(HumanResourcesDbContext db, Guid tenantId,
        Guid[] employeeIds, Guid[] vehicleIds, bool includeCompany, DateOnly today, CancellationToken ct)
    {
        var entries = new List<Entry>();
        var employees = await db.Employees.AsNoTracking().Where(e => e.TenantId == tenantId && employeeIds.Contains(e.Id)).ToDictionaryAsync(e => e.Id, ct);
        string Name(Guid id) => employees.TryGetValue(id, out var e) ? $"{e.LastName}, {e.FirstName}".Trim(' ', ',') : "?";

        if (includeCompany)
        {
            foreach (var d in await db.CompanyDocuments.AsNoTracking().Where(d => d.TenantId == tenantId && d.IsActive).ToListAsync(ct))
            {
                DateOnly? exp = d.ExpirationDate is { } x ? DateOnly.FromDateTime(x) : null;
                entries.Add(new(new("CompanyDocument", d.Id, "Company", Guid.Empty, "Empresa", d.Title, string.IsNullOrWhiteSpace(d.Number) ? null : d.Number,
                    Day(exp), State(exp, d.AlertDaysBefore, today), d.FileStorageKey is not null), d.FileStorageKey, d.FileName, d.FileContentType, null));
            }
        }
        foreach (var d in await db.EmployeeDocuments.AsNoTracking().Where(d => d.TenantId == tenantId && employeeIds.Contains(d.EmployeeId) && d.Category != "Egreso").ToListAsync(ct))
        {
            DateOnly? exp = d.ExpiryDate is { } x ? DateOnly.FromDateTime(x) : null;
            entries.Add(new(new("HrDocument", d.Id, "Person", d.EmployeeId, Name(d.EmployeeId), HrLabel(d.DocumentType), null, Day(exp), State(exp, 30, today),
                !string.IsNullOrEmpty(d.FileUrl)), null, d.FileName, null, d.FileUrl));
        }
        if (employeeIds.Length > 0 && await ExistsAsync(db, "fleet.\"PersonCredentials\"", ct))
        {
            var rows = await db.Database.SqlQuery<CredentialRow>($"""
                SELECT "Id", "EmployeeId", "Type", "Category", "Number", "ExpirationDateUtc", "AlertDaysBefore", "FileStorageKey", "FileName", "FileContentType"
                FROM fleet."PersonCredentials" WHERE "TenantId" = {tenantId} AND "IsActive" AND "EmployeeId" = ANY({employeeIds})
                """).ToListAsync(ct);
            foreach (var c in rows)
            {
                var exp = DateOnly.FromDateTime(c.ExpirationDateUtc);
                entries.Add(new(new("Credential", c.Id, "Person", c.EmployeeId, Name(c.EmployeeId), CredentialLabel(c.Type) + (string.IsNullOrWhiteSpace(c.Category) ? "" : $" {c.Category}"),
                    string.IsNullOrWhiteSpace(c.Number) ? null : c.Number, Day(exp), State(exp, c.AlertDaysBefore, today), c.FileStorageKey is not null), c.FileStorageKey, c.FileName, c.FileContentType, null));
            }
        }
        if (vehicleIds.Length > 0 && await ExistsAsync(db, "fleet.\"VehicleDocuments\"", ct))
        {
            var rows = await db.Database.SqlQuery<VehicleDocRow>($"""
                SELECT d."Id", d."VehicleId", trim(v."Plate" || ' ' || v."Brand" || ' ' || v."Model") AS "Vehicle", d."DocumentType", d."Title", d."PolicyOrDocNumber",
                       d."ExpirationDateUtc", d."AlertDaysBefore", d."FileStorageKey", d."FileName", d."FileContentType"
                FROM fleet."VehicleDocuments" d JOIN fleet."Vehicles" v ON v."Id" = d."VehicleId"
                WHERE d."TenantId" = {tenantId} AND d."IsActive" AND d."VehicleId" = ANY({vehicleIds})
                """).ToListAsync(ct);
            foreach (var d in rows)
            {
                var exp = DateOnly.FromDateTime(d.ExpirationDateUtc);
                var label = d.DocumentType == 6 && !string.IsNullOrWhiteSpace(d.Title) ? d.Title : VehicleDocLabel(d.DocumentType);
                entries.Add(new(new("VehicleDocument", d.Id, "Vehicle", d.VehicleId, d.Vehicle, label, string.IsNullOrWhiteSpace(d.PolicyOrDocNumber) ? null : d.PolicyOrDocNumber,
                    Day(exp), State(exp, d.AlertDaysBefore, today), d.FileStorageKey is not null), d.FileStorageKey, d.FileName, d.FileContentType, null));
            }
        }
        var ordered = entries.OrderBy(e => e.Item.OwnerType switch { "Company" => 0, "Person" => 1, _ => 2 }).ThenBy(e => e.Item.OwnerName).ThenBy(e => e.Item.Label).ToList();
        return (ordered, employees);
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

    private static Guid[] Ids(string? s) =>
        (s ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries).Select(x => Guid.TryParse(x, out var g) ? g : Guid.Empty).Where(g => g != Guid.Empty).ToArray();

    public static void MapPlantAccessPacket(this RouteGroupBuilder group)
    {
        group.MapGet("/plant-packet/preview", async (string? employeeIds, string? vehicleIds, bool? company, HumanResourcesDbContext db, ITenantContext tenant, TimeProvider clock, CancellationToken ct) =>
        {
            var (entries, _) = await EntriesAsync(db, tenant.TenantId.Value, Ids(employeeIds), Ids(vehicleIds), company == true, ArgentinaTime.Today(clock.GetUtcNow()), ct);
            return Results.Ok(entries.Select(e => e.Item));
        });

        // ZIP con una carpeta por la empresa, por persona y por unidad, y un índice con lo que va y lo que falta.
        group.MapPost("/plant-packet", async (string? employeeIds, string? vehicleIds, PacketRequest req, HumanResourcesDbContext db, ITenantContext tenant, IFileStorage storage, TimeProvider clock, CancellationToken ct) =>
        {
            if (req.Items.Count == 0) return Results.BadRequest(new { detail = "Elegí al menos un documento." });
            var today = ArgentinaTime.Today(clock.GetUtcNow());
            var (entries, employees) = await EntriesAsync(db, tenant.TenantId.Value, Ids(employeeIds), Ids(vehicleIds), req.Items.Any(i => i.Source == "CompanyDocument"), today, ct);
            var chosen = entries.Where(e => req.Items.Any(i => i.Source == e.Item.Source && i.Id == e.Item.Id)).ToList();

            var buffer = new MemoryStream();
            var index = new StringBuilder();
            index.AppendLine($"Legajo para ingreso a planta - generado el {today:dd/MM/yyyy}");
            index.AppendLine();
            using (var zip = new ZipArchive(buffer, ZipArchiveMode.Create, leaveOpen: true))
            {
                var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var e in chosen)
                {
                    var item = e.Item;
                    var folder = item.OwnerType == "Company" ? "Empresa" : Safe(item.OwnerType == "Person"
                        ? $"{item.OwnerName}{(employees.TryGetValue(item.OwnerId, out var emp) && emp.DocumentNumber is { Length: > 0 } dni ? $" - DNI {dni}" : "")}"
                        : item.OwnerName);
                    var line = $"[{folder}] {item.Label}{(item.Number is { Length: > 0 } n ? $" N° {n}" : "")}{(item.ExpirationDate is { } x ? $" - vence {DateOnly.Parse(x, CultureInfo.InvariantCulture):dd/MM/yyyy}" : "")} - {item.State}";
                    Stream? stream = null;
                    var ext = Extension(e.FileName, e.ContentType);
                    if (e.StorageKey is not null) stream = (await storage.OpenReadAsync(e.StorageKey, ct))?.Stream;
                    else if (e.DataUrl is { } data && data.StartsWith("data:", StringComparison.Ordinal) && data.IndexOf(',') > 0)
                    {
                        // El legajo de RRHH guarda el archivo como data URL (data:application/pdf;base64,...).
                        ext = Extension(e.FileName, data[5..data.IndexOf(';')]);
                        stream = new MemoryStream(Convert.FromBase64String(data[(data.IndexOf(',') + 1)..]));
                    }
                    if (stream is null)
                    {
                        index.AppendLine($"{line} - SIN ARCHIVO");
                        continue;
                    }
                    var name = Safe($"{item.Label}{(item.ExpirationDate is { } exp ? $" - vence {DateOnly.Parse(exp, CultureInfo.InvariantCulture):dd-MM-yyyy}" : "")}");
                    var path = $"{folder}/{name}{ext}";
                    for (var k = 2; !used.Add(path); k++) path = $"{folder}/{name} ({k}){ext}";
                    var entry = zip.CreateEntry(path, CompressionLevel.Optimal);
                    await using (var target = entry.Open()) { await stream.CopyToAsync(target, ct); }
                    await stream.DisposeAsync();
                    index.AppendLine(line);
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
