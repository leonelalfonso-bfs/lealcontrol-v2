using System.Text.Json;
using FluentAssertions;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Accounting.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace LealControl.Modules.Accounting.Tests;

public sealed class BatchPostProcessorTests : IClassFixture<AccountingPostgresFixture>
{
    private readonly AccountingPostgresFixture _fx;
    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web);

    public BatchPostProcessorTests(AccountingPostgresFixture fx) => _fx = fx;

    [Fact]
    public async Task Execute_then_Revert_posts_and_restores_pending()
    {
        await using var db = await _fx.CreateReadyDbAsync();
        var docId = Guid.NewGuid();
        var document = new PostableDocument(
            AccountingSourceModules.Finance,
            AccountingDocumentTypes.CollectionReceipt,
            docId.ToString(),
            "RC-BATCH-1",
            DateTime.UtcNow.Date,
            "ARS",
            1m,
            "Customer",
            Guid.NewGuid(),
            "Cliente Batch",
            "AM-FIN-01",
            new Dictionary<string, decimal>
            {
                [AccountingAmountSources.Total] = 1000m,
                [AccountingAmountSources.PaymentAmount] = 1000m,
                [AccountingAmountSources.Withholdings] = 0m
            },
            new Dictionary<string, string>());

        db.PendingDocuments.Add(new AccountingPendingDocument
        {
            TenantId = _fx.TenantId,
            SourceModule = document.SourceModule,
            DocumentType = document.DocumentType,
            SourceDocumentId = document.DocumentId,
            DocumentNumber = document.DocumentNumber,
            DocumentDateUtc = document.Date,
            PayloadJson = JsonSerializer.Serialize(document, JsonOpts),
            Status = AccountingPendingDocumentStatuses.Pending,
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();

        var periodStart = DateTime.UtcNow.Date.AddDays(-1);
        var periodEnd = DateTime.UtcNow.Date.AddDays(1);
        var preview = await BatchPostProcessor.PreviewAsync(
            new BatchPostingPreviewRequest(periodStart, periodEnd, ["Finance"], null, null),
            _fx.TenantId, db, CancellationToken.None);
        preview.DocumentsCount.Should().BeGreaterThanOrEqualTo(1);
        preview.IsBalanced.Should().BeTrue();

        var executed = await BatchPostProcessor.ExecuteAsync(
            new BatchPostingExecuteRequest(periodStart, periodEnd, ["Finance"], null, null, "tests@lealcontrol.com"),
            _fx.TenantId, db, NullLogger.Instance, CancellationToken.None);

        executed.EntriesGenerated.Should().BeGreaterThanOrEqualTo(1);
        executed.ErrorsCount.Should().Be(0);
        executed.BatchRunId.Should().NotBe(Guid.Empty);

        var pending = await db.PendingDocuments.SingleAsync(x => x.SourceDocumentId == document.DocumentId);
        pending.Status.Should().Be(AccountingPendingDocumentStatuses.Posted);
        pending.JournalEntryId.Should().NotBeNull();

        var entriesBefore = await db.JournalEntries.CountAsync(x => x.TenantId == _fx.TenantId && x.SourceDocumentId == document.DocumentId);
        entriesBefore.Should().Be(1);

        var revert = await BatchPostProcessor.RevertAsync(executed.BatchRunId, _fx.TenantId, db, CancellationToken.None);
        revert.GetType().Name.Should().Contain("Ok");

        await db.Entry(pending).ReloadAsync();
        pending.Status.Should().Be(AccountingPendingDocumentStatuses.Pending);
        pending.JournalEntryId.Should().BeNull();

        var entriesAfter = await db.JournalEntries.CountAsync(x => x.TenantId == _fx.TenantId && x.SourceDocumentId == document.DocumentId);
        entriesAfter.Should().Be(0);
    }
}
