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

/// <summary>Aviso: licencias, LINTI, carnets y aptos de las personas de la flota.</summary>
public sealed class FleetPeopleNotices : INoticeProvider
{
    public string Code => "fleet.people-credentials";
    public string Module => "fleet";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Licencias y credenciales del personal";
    public string Description => "Licencias de conducir, LINTI, carnets de autoelevadorista y aptos médicos vencidos, por vencer o sin cargar.";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new FleetDbContext(new DbContextOptionsBuilder<FleetDbContext>().UseNpgsql(context.ConnectionString).Options);
        var members = await db.Members.AsNoTracking().Where(m => m.TenantId == context.TenantId).ToListAsync(cancellationToken);
        if (members.Count == 0) return [];
        var creds = await db.PersonCredentials.AsNoTracking()
            .Where(c => c.TenantId == context.TenantId && c.IsActive).ToListAsync(cancellationToken);
        var employees = await FleetPeople.EmployeesAsync(db, context.TenantId, cancellationToken);
        return FleetPeople.Expirations(members, creds, employees, context.Today).Select(i => new NoticeItem(
            $"{i.FullName} — {FleetRules.CredentialLabel(i.Type)}",
            i.State switch
            {
                ExpirationState.Missing => "Sin cargar",
                ExpirationState.Expired => $"Venció el {DateOnly.Parse(i.ExpirationDate!):dd/MM/yyyy} (hace {-(i.DaysRemaining ?? 0)} días)",
                _ => i.DaysRemaining == 0 ? "Vence hoy" : $"Vence el {DateOnly.Parse(i.ExpirationDate!):dd/MM/yyyy} (en {i.DaysRemaining} días)"
            },
            $"/flota/personas/{i.MemberId}",
            i.State == ExpirationState.DueSoon ? NoticeSeverity.Warning : NoticeSeverity.Critical)).ToList();
    }
}
