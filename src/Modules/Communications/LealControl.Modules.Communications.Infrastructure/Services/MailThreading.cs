using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Communications.Infrastructure.Domain;
using LealControl.Modules.Communications.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using MimeKit;

namespace LealControl.Modules.Communications.Infrastructure.Services;

/// <summary>
/// A qué conversación va un mail y con qué fecha. Un mail se suma a la conversación del mensaje que cita
/// (In-Reply-To / References), aunque el programa que respondió no haya mandado la cadena completa; si no cita nada
/// pero su asunto es una respuesta ("RE:", "RV:", "Fwd:"…), se suma a la conversación con el mismo asunto y el mismo
/// contacto de los últimos 60 días.
/// </summary>
public static partial class MailThreading
{
    private static readonly TimeSpan SubjectWindow = TimeSpan.FromDays(60);

    /// <summary>
    /// La fecha del mail: la que puso quien lo mandó; si falta o viene del futuro (reloj mal configurado o spam), la
    /// fecha en que lo recibió el servidor. La del servidor no se usa siempre porque al migrar una casilla queda
    /// la fecha de la migración.
    /// </summary>
    public static DateTime OccurredAtUtc(DateTimeOffset headerDate, DateTimeOffset? serverDate, DateTime nowUtc)
    {
        var limit = (serverDate?.UtcDateTime ?? nowUtc).AddHours(12);
        if (headerDate != DateTimeOffset.MinValue && headerDate.Year > 1990 && headerDate.UtcDateTime <= limit)
            return headerDate.UtcDateTime;
        return serverDate?.UtcDateTime ?? nowUtc;
    }

    public static async Task<string> ResolveThreadKeyAsync(CommunicationsDbContext db, Guid tenantId, MimeMessage mime, string contactAddress, DateTime occurredAtUtc, CancellationToken ct)
    {
        var cited = mime.References.Concat(mime.InReplyTo is null ? [] : [mime.InReplyTo]).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
        if (cited.Count > 0)
        {
            var local = db.EmailMessages.Local.FirstOrDefault(x => x.TenantId == tenantId && cited.Contains(x.InternetMessageId))?.ThreadKey;
            if (local is not null) return local;
            var known = await db.EmailMessages.AsNoTracking()
                .Where(x => x.TenantId == tenantId && cited.Contains(x.InternetMessageId))
                .OrderBy(x => x.OccurredAtUtc).Select(x => x.ThreadKey).FirstOrDefaultAsync(ct);
            if (known is not null) return known;
            return MailTransportService.ThreadKey(mime);
        }

        var subject = mime.Subject ?? "";
        if (ReplyPrefix().IsMatch(subject) && !string.IsNullOrWhiteSpace(contactAddress))
        {
            var topic = Topic(subject);
            var from = occurredAtUtc - SubjectWindow;
            var address = contactAddress.ToLowerInvariant();
            var candidates = db.EmailMessages.Local
                .Where(x => x.TenantId == tenantId && x.OccurredAtUtc >= from && x.OccurredAtUtc <= occurredAtUtc)
                .Select(x => new { x.Subject, x.FromAddress, x.ToAddresses, x.ThreadKey, x.OccurredAtUtc })
                .ToList();
            candidates.AddRange(await db.EmailMessages.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ChannelType == CommunicationChannelHelper.Email && x.OccurredAtUtc >= from && x.OccurredAtUtc <= occurredAtUtc
                    && (x.FromAddress.ToLower() == address || x.ToAddresses.ToLower().Contains(address)))
                .OrderByDescending(x => x.OccurredAtUtc).Take(200)
                .Select(x => new { x.Subject, x.FromAddress, x.ToAddresses, x.ThreadKey, x.OccurredAtUtc })
                .ToListAsync(ct));
            var match = candidates
                .Where(x => (x.FromAddress.Equals(address, StringComparison.OrdinalIgnoreCase) || x.ToAddresses.Contains(address, StringComparison.OrdinalIgnoreCase))
                    && Topic(x.Subject) == topic)
                .OrderByDescending(x => x.OccurredAtUtc).FirstOrDefault();
            if (match is not null) return match.ThreadKey;
        }

        return MailTransportService.ThreadKey(mime);
    }

    /// <summary>El asunto sin "RE:", "RV:", "Fwd:"… repetidos ni espacios de más, en minúsculas.</summary>
    public static string Topic(string subject)
    {
        var s = subject.Trim();
        while (ReplyPrefix().Match(s) is { Success: true } m) s = s[m.Length..].TrimStart();
        return WhiteSpace().Replace(s, " ").ToLowerInvariant();
    }

    [GeneratedRegex(@"^\s*(re|rv|fw|fwd|reenviar|resp|aw|tr)\s*(\[\d+\])?\s*:", RegexOptions.IgnoreCase)]
    private static partial Regex ReplyPrefix();

    [GeneratedRegex(@"\s+")]
    private static partial Regex WhiteSpace();
}
