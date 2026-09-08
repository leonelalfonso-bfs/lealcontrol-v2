namespace LealControl.BuildingBlocks.Storage;

public interface IFileStorage
{
    Task<StoredFileResult> SaveAsync(
        string module,
        Guid tenantId,
        string fileName,
        string contentType,
        Stream content,
        CancellationToken cancellationToken = default);

    Task<StoredFileContent?> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default);

    Task<bool> DeleteAsync(string storageKey, CancellationToken cancellationToken = default);
}

public sealed record StoredFileResult(
    string StorageKey,
    string Sha256,
    long SizeBytes);

public sealed record StoredFileContent(
    Stream Stream,
    string ContentType,
    string FileName);
