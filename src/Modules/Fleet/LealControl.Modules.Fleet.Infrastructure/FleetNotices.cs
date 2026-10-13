using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Notices;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Fleet.Infrastructure;

/// <summary>Aviso: documentación de las unidades vencida, por vencer o sin cargar.</summary>
public sealed class FleetExpirationNotices : INoticeProvider
{
    public string Code => "fleet.expirations";
    public string Module => "fleet";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Vencimientos de flota";
    public string Description => "VTV, seguro, RUTA, habilitaciones y demás documentación de las unidades: vencida, por vencer o sin cargar.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new FleetDbContext(new DbContextOptionsBuilder<FleetDbContext>().UseNpgsql(context.ConnectionString).Options);
        var vehicles = await db.Vehicles.AsNoTracking()
            .Where(v => v.TenantId == context.TenantId && v.Status != VehicleStatus.Sold).ToListAsync(cancellationToken);
        if (vehicles.Count == 0) return [];
        var docs = await db.VehicleDocuments.AsNoTracking()
            .Where(d => d.TenantId == context.TenantId && d.IsActive).ToListAsync(cancellationToken);

        return FleetModule.Expirations(vehicles, docs, context.Today).Select(i => new NoticeItem(
            $"{i.VehicleLabel} — {FleetRules.DocumentLabel(i.DocumentType)}",
            i.State switch
            {
                ExpirationState.Missing => "Sin cargar",
                ExpirationState.Expired => $"Venció el {DateOnly.Parse(i.ExpirationDate!):dd/MM/yyyy} (hace {-(i.DaysRemaining ?? 0)} días)",
                _ => i.DaysRemaining == 0 ? "Vence hoy" : $"Vence el {DateOnly.Parse(i.ExpirationDate!):dd/MM/yyyy} (en {i.DaysRemaining} días)"
            } + (string.IsNullOrWhiteSpace(i.VehicleName) ? "" : $" · {i.VehicleName}"),
            $"/flota/vehiculos/{i.VehicleId}",
            i.State == ExpirationState.DueSoon ? NoticeSeverity.Warning : NoticeSeverity.Critical)).ToList();
    }
}
