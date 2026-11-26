using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Time;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Communications.Infrastructure.Services;

/// <summary>
/// Cuándo una conversación queda "sin atender": el último mensaje es del contacto, no hay respuesta nuestra
/// posterior y pasaron las horas hábiles configuradas. Vincularla a un cliente no la atiende: hace falta responder.
/// Lo usan la carpeta SLA de la bandeja, la campanita de Comunicaciones y el aviso de "Mis avisos".
/// </summary>
public static class ConversationAttention
{
    /// <summary>El instante tal que todo mensaje recibido antes lleva al menos esas horas hábiles sin respuesta.</summary>
    public static DateTime Cutoff(DateTime nowUtc, int businessHours) => ArgentinaTime.BusinessCutoff(nowUtc, businessHours);

    public static IQueryable<Conversation> Unattended(IQueryable<Conversation> conversations, DateTime cutoffUtc) =>
        conversations.Where(c => c.LastIncomingAtUtc != null && c.LastIncomingAtUtc <= cutoffUtc
            && (c.LastOutgoingAtUtc == null || c.LastOutgoingAtUtc < c.LastIncomingAtUtc)
            && c.Status != "resolved" && c.Status != "archived" && c.Status != Conversation.DiscardedStatus);

    public static async Task<int> UnattendedAfterHoursAsync(CommunicationsDbContext db, Guid tenantId, CancellationToken ct) =>
        await db.Settings.AsNoTracking().Where(s => s.TenantId == tenantId).Select(s => (int?)s.UnattendedAfterHours).FirstOrDefaultAsync(ct)
        ?? CommunicationSettings.DefaultUnattendedAfterHours;

    public static async Task<DateTime> CutoffForTenantAsync(CommunicationsDbContext db, Guid tenantId, CancellationToken ct) =>
        Cutoff(DateTime.UtcNow, await UnattendedAfterHoursAsync(db, tenantId, ct));
}
