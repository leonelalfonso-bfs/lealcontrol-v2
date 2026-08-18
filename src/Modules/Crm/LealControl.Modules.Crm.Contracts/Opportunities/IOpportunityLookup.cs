namespace LealControl.Modules.Crm.Contracts.Opportunities;

public sealed record OpportunitySnapshot(
    Guid Id,
    string Title,
    Guid? CustomerId,
    string Stage,
    decimal? Amount,
    string? Currency,
    string? OwnerName);

/// <summary>
/// Lectura pública de oportunidades para otros módulos (p. ej. Ventas).
/// </summary>
public interface IOpportunityLookup
{
    Task<OpportunitySnapshot?> FindAsync(Guid opportunityId, CancellationToken cancellationToken = default);
}
