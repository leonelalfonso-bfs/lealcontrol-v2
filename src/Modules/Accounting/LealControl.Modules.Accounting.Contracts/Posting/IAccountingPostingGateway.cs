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
}
