namespace LealControl.Modules.Crm.Contracts.Opportunities;

/// <summary>
/// Sincronización bidireccional Ventas ↔ CRM para que presupuestos, pedidos y oportunidades nunca queden desfasados.
/// </summary>
public interface IOpportunityQuoteSync
{
    /// <summary>Abre una oportunidad en etapa Propuesta para el cliente y devuelve su id.</summary>
    Task<Guid?> OpenForQuoteAsync(Guid customerId, string title, decimal amount, string currency, string? ownerName, CancellationToken cancellationToken = default);

    /// <summary>Actualiza monto/moneda y avanza la etapa de la oportunidad cuando un presupuesto se edita, envía o acepta.</summary>
    Task SyncQuoteProgressAsync(Guid opportunityId, decimal amount, string currency, bool isSent, bool isAccepted, CancellationToken cancellationToken = default);

    /// <summary>Marca la oportunidad como Ganada (y actualiza su monto al del pedido si se informa).</summary>
    Task MarkWonAsync(Guid opportunityId, decimal? finalAmount = null, string? currency = null, CancellationToken cancellationToken = default);

    /// <summary>Marca la oportunidad como Perdida con motivo.</summary>
    Task MarkLostAsync(Guid opportunityId, string reason, CancellationToken cancellationToken = default);

    /// <summary>Reabre una oportunidad Ganada a En negociación cuando se anula el único pedido que la ganó.</summary>
    Task ReopenFromCancelledOrderAsync(Guid opportunityId, string reason, CancellationToken cancellationToken = default);

    /// <summary>Registra una nota en la oportunidad con los renglones no confirmados de una conversión parcial.</summary>
    Task LogPartialConfirmationNoteAsync(Guid opportunityId, string note, CancellationToken cancellationToken = default);
}

/// <summary>
/// Permite a Ventas (registrado desde el Host) bloquear el cierre como Perdida de una oportunidad que tiene pedidos activos.
/// </summary>
public interface IOpportunityLossGuard
{
    Task<string?> GetBlockingReasonAsync(Guid opportunityId, CancellationToken cancellationToken = default);
}
