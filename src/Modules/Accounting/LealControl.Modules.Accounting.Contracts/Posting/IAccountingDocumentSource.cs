namespace LealControl.Modules.Accounting.Contracts.Posting;

/// <summary>
/// Un módulo que tiene comprobantes para contabilizar (Ventas, Compras). Antes de contabilizar un
/// período, Contabilidad le pide que publique en la cola lo que todavía no publicó (y que revierta lo
/// anulado). Así nada se asienta solo, y lo histórico entra la primera vez que se contabiliza.
/// </summary>
public interface IAccountingDocumentSource
{
    /// <summary>Publica los comprobantes del período que faltan y revierte los anulados. Devuelve cuántos publicó.</summary>
    Task<int> PublishPendingAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default);
}
