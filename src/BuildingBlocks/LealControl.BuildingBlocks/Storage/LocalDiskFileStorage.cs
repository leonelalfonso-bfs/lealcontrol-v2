using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LealControl.BuildingBlocks.Storage;

public sealed class LocalDiskFileStorage : IFileStorage
{
    private readonly string _rootPath;
    private readonly ILogger<LocalDiskFileStorage> _logger;

    public LocalDiskFileStorage(IConfiguration configuration, ILogger<LocalDiskFileStorage> logger)
    {
        _logger = logger;
        _rootPath = configuration["Storage:RootPath"]
            ?? Environment.GetEnvironmentVariable("STORAGE_ROOT_PATH")
            ?? Path.Combine(Path.GetTempPath(), "lealcontrol-storage");

        Directory.CreateDirectory(_rootPath);
    }

    public async Task<StoredFileResult> SaveAsync(
        string module,
        Guid tenantId,
        string fileName,
        string contentType,
        Stream content,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(module);
        ArgumentException.ThrowIfNullOrWhiteSpace(fileName);

        var safeName = SanitizeFileName(fileName);
        var year = DateTime.UtcNow.Year.ToString("D4");
        var id = Guid.NewGuid();
        var relativeKey = Path.Combine(module.ToLowerInvariant(), tenantId.ToString("N"), year, id.ToString("N"), safeName)
            .Replace('\\', '/');
        var fullPath = Path.Combine(_rootPath, relativeKey.Replace('/', Path.DirectorySeparatorChar));

        var directory = Path.GetDirectoryName(fullPath)
            ?? throw new InvalidOperationException("No se pudo resolver el directorio de almacenamiento.");
        Directory.CreateDirectory(directory);

        await using var fileStream = new FileStream(fullPath, FileMode.CreateNew, FileAccess.Write, FileShare.None);
        using var sha = SHA256.Create();
        await using var crypto = new CryptoStream(fileStream, sha, CryptoStreamMode.Write);

        await content.CopyToAsync(crypto, cancellationToken);
        await crypto.FlushFinalBlockAsync(cancellationToken);

        var hash = Convert.ToHexString(sha.Hash ?? Array.Empty<byte>()).ToLowerInvariant();
        var size = fileStream.Length;

        _logger.LogInformation(
            "Archivo guardado en storage local. Module={Module} Tenant={TenantId} Key={Key} Size={Size}",
            module, tenantId, relativeKey, size);

        return new StoredFileResult(relativeKey, hash, size);
    }

    public Task<StoredFileContent?> OpenReadAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(storageKey))
        {
            return Task.FromResult<StoredFileContent?>(null);
        }

        var fullPath = ResolveFullPath(storageKey);
        if (!File.Exists(fullPath))
        {
            return Task.FromResult<StoredFileContent?>(null);
        }

        Stream stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        var fileName = Path.GetFileName(fullPath);
        var contentType = GuessContentType(fileName);
        return Task.FromResult<StoredFileContent?>(new StoredFileContent(stream, contentType, fileName));
    }

    public Task<bool> DeleteAsync(string storageKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(storageKey))
        {
            return Task.FromResult(false);
        }

        var fullPath = ResolveFullPath(storageKey);
        if (!File.Exists(fullPath))
        {
            return Task.FromResult(false);
        }

        File.Delete(fullPath);
        return Task.FromResult(true);
    }

    private string ResolveFullPath(string storageKey)
    {
        var normalized = storageKey.Replace('\\', '/').TrimStart('/');
        if (normalized.Contains("..", StringComparison.Ordinal))
        {
            throw new InvalidOperationException("Storage key inválida.");
        }

        var fullPath = Path.GetFullPath(Path.Combine(_rootPath, normalized.Replace('/', Path.DirectorySeparatorChar)));
        var rootFull = Path.GetFullPath(_rootPath);
        if (!fullPath.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Storage key fuera del root permitido.");
        }

        return fullPath;
    }

    private static string SanitizeFileName(string fileName)
    {
        var name = Path.GetFileName(fileName.Trim());
        if (string.IsNullOrWhiteSpace(name))
        {
            return "archivo.bin";
        }

        var invalid = Path.GetInvalidFileNameChars();
        var builder = new StringBuilder(name.Length);
        foreach (var ch in name)
        {
            builder.Append(Array.IndexOf(invalid, ch) >= 0 ? '_' : ch);
        }

        return builder.ToString();
    }

    private static string GuessContentType(string fileName)
    {
        var ext = Path.GetExtension(fileName).ToLowerInvariant();
        return ext switch
        {
            ".pdf" => "application/pdf",
            ".docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            ".doc" => "application/msword",
            ".xls" => "application/vnd.ms-excel",
            ".png" => "image/png",
            ".jpg" or ".jpeg" => "image/jpeg",
            ".txt" => "text/plain",
            _ => "application/octet-stream"
        };
    }
}
