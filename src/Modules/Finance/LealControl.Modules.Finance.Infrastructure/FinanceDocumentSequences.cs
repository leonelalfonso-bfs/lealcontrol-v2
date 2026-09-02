using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Finance.Infrastructure;

internal static class FinanceDocumentSequences
{
    public static async Task<string> NextNumberAsync(FinanceDbContext db, Guid tenantId, string documentType, string prefix, CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        var seq = await db.DocumentSequences
            .FirstOrDefaultAsync(x => x.TenantId == tenantId && x.DocumentType == documentType && x.Prefix == prefix, ct);
        if (seq is null)
        {
            seq = new DocumentSequence
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                DocumentType = documentType,
                Prefix = prefix,
                NextNumber = 1,
                UpdatedAtUtc = DateTime.UtcNow
            };
            db.DocumentSequences.Add(seq);
            await db.SaveChangesAsync(ct);
        }

        var number = seq.NextNumber;
        seq.NextNumber = number + 1;
        seq.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return $"{prefix}-{number:D8}";
    }
}
