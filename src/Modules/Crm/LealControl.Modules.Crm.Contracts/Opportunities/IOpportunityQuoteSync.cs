namespace LealControl.Modules.Crm.Contracts.Opportunities;

/// <summary>
/// Ventas avisa al CRM lo que pasa con un presupuesto: el que se hace sin oportunidad abre una (así queda en el embudo), el
/// pedido la gana y el rechazo o la anulación la pierden.
/// </summary>
public interface IOpportunityQuoteSync
{
    /// <summary>Abre una oportunidad en etapa Propuesta para el cliente y devuelve su id.</summary>
    Task<Guid?> OpenForQuoteAsync(Guid customerId, string title, decimal amount, string currency, string? ownerName, CancellationToken cancellationToken = default);

    Task MarkWonAsync(Guid opportunityId, CancellationToken cancellationToken = default);

    Task MarkLostAsync(Guid opportunityId, string reason, CancellationToken cancellationToken = default);
}
