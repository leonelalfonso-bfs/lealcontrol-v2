namespace LealControl.Modules.Accounting.Contracts.Posting;

/// <summary>
/// Puerta de entrada para que Sales/Finance/Payroll publiquen documentos a Contabilidad
/// sin referenciar Accounting.Infrastructure.
/// </summary>
public interface IAccountingPostingGateway
{
    Task PostAsync(PostableDocument document, CancellationToken cancellationToken = default);

    Task ReverseAsync(
        string sourceModule,
        string sourceDocumentId,
        string reason,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// De esos documentos, los que todavía no están en la cola contable (ni asentados).
    /// Sirve para publicar solo lo nuevo sin recorrer la cola entera.
    /// </summary>
    Task<IReadOnlySet<string>> FilterUnpublishedAsync(
        string sourceModule,
        IReadOnlyCollection<string> sourceDocumentIds,
        CancellationToken cancellationToken = default);
}
