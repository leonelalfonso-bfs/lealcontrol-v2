using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Notices;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Communications.Infrastructure.Services;

/// <summary>
/// Aviso: mails recibidos que nadie respondió dentro de las horas hábiles configuradas (por defecto 24).
/// Se van solos cuando aparece la respuesta, enviada desde Leal Control o leída de la carpeta de enviados.
/// </summary>
public sealed class UnattendedMailNotices : INoticeProvider
{
    public string Code => "communications.unattended";
    public string Module => "communications";
    public int MinimumLevel => 1;
    public NoticeSensitivity Sensitivity => NoticeSensitivity.None;
    public string Label => "Mails sin atender";
    public string Description => "Consultas y pedidos recibidos por mail que nadie respondió dentro del plazo (horas hábiles).";
    public bool DefaultOn => true;

    public async Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken)
    {
        await using var db = new CommunicationsDbContext(new DbContextOptionsBuilder<CommunicationsDbContext>().UseNpgsql(context.ConnectionString).Options);
        await db.EnsureTablesCreatedAsync(cancellationToken);
        var hours = await ConversationAttention.UnattendedAfterHoursAsync(db, context.TenantId, cancellationToken);
        var now = DateTime.UtcNow;
        var cutoff = ConversationAttention.Cutoff(now, hours);
        // El doble del plazo: en rojo.
        var lateCutoff = ConversationAttention.Cutoff(now, hours * 2);
        var rows = await ConversationAttention.Unattended(db.Conversations.AsNoTracking().Where(c => c.TenantId == context.TenantId), cutoff)
            .OrderBy(c => c.LastIncomingAtUtc)
            .Select(c => new { c.Id, c.ParticipantName, c.LastMessagePreview, c.LastIncomingAtUtc })
            .Take(50)
            .ToListAsync(cancellationToken);
        var items = rows.Select(r => new NoticeItem(
                $"Sin responder: {r.ParticipantName}",
                $"Recibido el {r.LastIncomingAtUtc!.Value.AddHours(-3):dd/MM HH:mm}" + (string.IsNullOrWhiteSpace(r.LastMessagePreview) ? "" : $" · {Trim(r.LastMessagePreview)}"),
                $"/comunicaciones?conversation={r.Id}",
                r.LastIncomingAtUtc <= lateCutoff ? NoticeSeverity.Critical : NoticeSeverity.Warning))
            .ToList();
        // Hasta 25 renglones y, si hay más, uno que lo dice.
        return items.Count <= 25 ? items : [.. items.Take(25), new NoticeItem($"Y {items.Count - 25} más", null, "/comunicaciones", NoticeSeverity.Info)];
    }

    private static string Trim(string text)
    {
        var line = text.ReplaceLineEndings(" ").Trim();
        return line.Length > 80 ? line[..80] + "…" : line;
    }
}
