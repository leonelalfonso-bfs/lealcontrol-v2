namespace LealControl.Modules.Accounting.Contracts.Posting;

/// <summary>
/// Implementación nula: Finance/Sales pueden llamar al gateway aunque Contabilidad
/// no esté activa o no haya implementado el motor todavía.
/// </summary>
public sealed class NoOpAccountingPostingGateway : IAccountingPostingGateway
{
    public Task PostAsync(PostableDocument document, CancellationToken cancellationToken = default)
        => Task.CompletedTask;

    public Task ReverseAsync(
        string sourceModule,
        string sourceDocumentId,
        string reason,
        CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
