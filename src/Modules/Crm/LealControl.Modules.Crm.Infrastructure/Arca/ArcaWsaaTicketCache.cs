using System.Collections.Concurrent;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

// Los tickets permanecen solo en memoria; no se registran tokens ni firmas.
internal sealed class ArcaWsaaTicketCache
{
    internal readonly record struct Key(string Thumbprint, string Service, bool Production);
    internal sealed record Ticket(bool Ok, string? Token, string? Sign, DateTimeOffset? Expires, string Detail);
    private sealed class Slot
    {
        internal readonly SemaphoreSlim Gate = new(1, 1);
        internal Ticket? Ticket;
    }
    private readonly ConcurrentDictionary<Key, Slot> _slots = new();
    private readonly TimeProvider _clock;

    public ArcaWsaaTicketCache(TimeProvider? clock = null) => _clock = clock ?? TimeProvider.System;

    internal async Task<(bool Ok, string? Token, string? Sign, string Detail)> GetAsync(
        Key key, Func<Task<Ticket>> request, CancellationToken ct)
    {
        var slot = _slots.GetOrAdd(key, _ => new Slot());
        await slot.Gate.WaitAsync(ct);
        try
        {
            var ticket = slot.Ticket;
            if (ticket is null || ticket.Expires <= _clock.GetUtcNow())
            {
                slot.Ticket = null;
                ticket = await request();
                if (ticket.Ok && !string.IsNullOrWhiteSpace(ticket.Token) &&
                    !string.IsNullOrWhiteSpace(ticket.Sign) && ticket.Expires > _clock.GetUtcNow())
                    slot.Ticket = ticket;
                else if (ticket.Ok)
                    ticket = new(false, null, null, null, "Ticket WSAA incompleto o vencido.");
            }
            return (ticket.Ok, ticket.Token, ticket.Sign, ticket.Detail);
        }
        finally { slot.Gate.Release(); }
    }
}
