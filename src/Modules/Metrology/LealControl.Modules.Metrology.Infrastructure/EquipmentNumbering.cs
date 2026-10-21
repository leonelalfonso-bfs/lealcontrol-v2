using LealControl.Modules.Metrology.Contracts;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Metrology.Infrastructure;

/// <summary>Busca los números EQ usados en pesas, instrumentos (metrology) y equipos auxiliares (quality).</summary>
public sealed class EquipmentNumbering(MetrologyDbContext db) : IEquipmentNumbering
{
    public async Task<string> NextAsync(Guid tenantId, CancellationToken ct = default)
    {
        await db.EnsureMetrologyTablesAsync(ct);
        var used = await UsedAsync(db, tenantId, null, ct);
        return EquipmentNumbers.Format(used.Count == 0 ? 1 : used.Max() + 1);
    }

    public async Task<bool> IsTakenAsync(Guid tenantId, string code, Guid? exceptId, CancellationToken ct = default)
    {
        await db.EnsureMetrologyTablesAsync(ct);
        return EquipmentNumbers.Parse(code) is { } n && (await UsedAsync(db, tenantId, exceptId, ct)).Contains(n);
    }

    // Sin EnsureMetrologyTablesAsync: también se llama desde la creación de las tablas.
    private static async Task<HashSet<int>> UsedAsync(MetrologyDbContext db, Guid tenantId, Guid? exceptId, CancellationToken ct)
    {
        var except = exceptId ?? Guid.Empty;
        var codes = await db.Database.SqlQuery<string>($@"
            SELECT ""InternalCode"" AS ""Value"" FROM metrology.standard_weights WHERE ""TenantId"" = {tenantId} AND ""Id"" <> {except} AND ""InternalCode"" <> ''
            UNION ALL
            SELECT ""InternalCode"" FROM metrology.instruments WHERE ""TenantId"" = {tenantId} AND ""Id"" <> {except} AND ""InternalCode"" <> ''").ToListAsync(ct);
        try
        {
            codes.AddRange(await db.Database.SqlQuery<string>(
                $@"SELECT ""Code"" AS ""Value"" FROM quality.equipments WHERE ""TenantId"" = {tenantId} AND ""Id"" <> {except}").ToListAsync(ct));
        }
        catch (Npgsql.PostgresException)
        {
            // Calidad todavía no creó sus tablas en esta base.
        }
        return codes.Select(EquipmentNumbers.Parse).OfType<int>().ToHashSet();
    }

    /// <summary>Número pedido a mano: formato EQ-0000 y que no lo use otro equipo. Vacío = se asigna solo.</summary>
    internal static async Task<(string Code, string? Error)> ValidateAsync(MetrologyDbContext db, Guid tenantId, string? requested, Guid? exceptId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(requested)) return ("", null);
        if (EquipmentNumbers.Normalize(requested) is not { } code) return ("", "El número interno tiene el formato EQ-0001.");
        return (await UsedAsync(db, tenantId, exceptId, ct)).Contains(EquipmentNumbers.Parse(code)!.Value)
            ? ("", $"El número {code} ya lo tiene otro equipo.")
            : (code, null);
    }

    /// <summary>
    /// Pesas e instrumentos sin número interno: los instrumentos que ya tenían un código "EQ 001" libre lo conservan;
    /// el resto se numera a continuación (pesas por valor nominal e identificación, después instrumentos).
    /// </summary>
    internal static async Task AssignMissingAsync(MetrologyDbContext db, CancellationToken ct)
    {
        var weights = await db.StandardWeights.Where(w => w.InternalCode == "").ToListAsync(ct);
        var instruments = await db.Instruments.Where(i => i.InternalCode == "").ToListAsync(ct);
        foreach (var tenant in weights.Select(w => w.TenantId.Value).Concat(instruments.Select(i => i.TenantId.Value)).Distinct())
        {
            var used = await UsedAsync(db, tenant, null, ct);
            var mine = instruments.Where(i => i.TenantId.Value == tenant).OrderBy(i => i.Code).ToList();
            foreach (var i in mine.Where(i => EquipmentNumbers.Parse(i.Code) is { } n && !used.Contains(n)))
            {
                var n = EquipmentNumbers.Parse(i.Code)!.Value;
                i.InternalCode = EquipmentNumbers.Format(n);
                used.Add(n);
            }
            var next = used.Count == 0 ? 1 : used.Max() + 1;
            foreach (var w in weights.Where(w => w.TenantId.Value == tenant).OrderByDescending(w => w.NominalValue).ThenBy(w => w.Code))
                w.InternalCode = EquipmentNumbers.Format(next++);
            foreach (var i in mine.Where(i => i.InternalCode == ""))
                i.InternalCode = EquipmentNumbers.Format(next++);
        }
        if (weights.Count + instruments.Count > 0) await db.SaveChangesAsync(ct);
    }
}
