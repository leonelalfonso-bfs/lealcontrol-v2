namespace LealControl.Modules.Quality.Contracts;

/// <summary>
/// Consulta si un usuario está autorizado (PG06-R02) para un método/instructivo en una fecha.
/// Usado por Metrología al emitir informes (fase C2).
/// </summary>
public interface IQualityAuthorizationGateway
{
    Task<bool> IsAuthorizedAsync(
        Guid tenantId,
        Guid userId,
        string methodDocumentCode,
        DateTime asOfUtc,
        CancellationToken cancellationToken = default);

    Task<bool> IsTechnicalDirectorAsync(
        Guid tenantId,
        Guid userId,
        CancellationToken cancellationToken = default);
}

/// <summary>
/// Devuelve el snapshot de documentos vigentes (código + versión) a una fecha.
/// </summary>
public interface IQualityDocumentSnapshotProvider
{
    Task<IReadOnlyList<QualityDocumentSnapshot>> GetCurrentSnapshotsAsync(
        Guid tenantId,
        IEnumerable<string> documentCodes,
        DateTime asOfUtc,
        CancellationToken cancellationToken = default);
}

public sealed record QualityDocumentSnapshot(
    string Code,
    string DisplayCode,
    string Title,
    int Version,
    Guid VersionId,
    DateTime? EffectiveFromUtc);
