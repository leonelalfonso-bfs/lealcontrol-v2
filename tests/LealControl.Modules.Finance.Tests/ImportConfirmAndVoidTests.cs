using System.Net.Http.Json;
using FluentAssertions;
using LealControl.Modules.Finance.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace LealControl.Modules.Finance.Tests;

public sealed class ImportConfirmAndVoidTests : IClassFixture<FinanceWebApplicationFactory>
{
    private readonly FinanceWebApplicationFactory _factory;

    public ImportConfirmAndVoidTests(FinanceWebApplicationFactory factory) => _factory = factory;

    [Fact]
    public async Task Import_confirm_dedups_by_file_hash_and_fingerprint()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var client = _factory.CreateAuthenticatedClient(tenantId);

        Guid accountId = default;
        await _factory.WithDbAsync(async db =>
        {
            accountId = Guid.NewGuid();
            db.Accounts.Add(new FinancialAccount
            {
                Id = accountId,
                TenantId = tenantId,
                Name = "Galicia QA",
                Currency = "ARS",
                Type = FinancialAccountType.Bank,
                OpeningBalance = 0m,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        var csv = """
            Fecha;Descripción;Débitos;Créditos;Saldo;Número de comprobante
            10/03/2026;TRANSF IN;;1000,00;1000,00;REF-1
            """;

        var first = await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new
        {
            accountId,
            csvContent = csv,
            fileName = "galicia.csv"
        });
        first.EnsureSuccessStatusCode();
        var firstBody = await first.Content.ReadFromJsonAsync<ImportConfirmResponse>();
        firstBody!.Imported.Should().Be(1);
        firstBody.Status.Should().Be("Balanced");

        var secondSameFile = await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new
        {
            accountId,
            csvContent = csv,
            fileName = "galicia.csv"
        });
        ((int)secondSameFile.StatusCode).Should().Be(409);

        var csvAgainDifferentFileNameSameHash = csv; // same content → same hash
        _ = csvAgainDifferentFileNameSameHash;

        // Same movements already present → reimport of different content that matches fingerprint counts as duplicate/update
        var csvFingerprintDup = """
            Fecha;Descripción;Débitos;Créditos;Saldo;Número de comprobante
            10/03/2026;TRANSF IN;;1000,00;1000,00;REF-1
            11/03/2026;OTRA;;200,00;1200,00;REF-2
            """;
        // Different file hash so not blocked by hash unique index
        var third = await client.PostAsJsonAsync("/api/v1/finance/imports/bank/confirm", new
        {
            accountId,
            csvContent = csvFingerprintDup,
            fileName = "galicia-2.csv"
        });
        third.EnsureSuccessStatusCode();
        var thirdBody = await third.Content.ReadFromJsonAsync<ImportConfirmResponse>();
        thirdBody!.Imported.Should().Be(1);
        (thirdBody.Duplicates + thirdBody.Updated).Should().BeGreaterThanOrEqualTo(1);

        await _factory.WithDbAsync(async db =>
        {
            var count = await db.Movements.CountAsync(x => x.TenantId == tenantId && x.AccountId == accountId);
            count.Should().Be(2);
        });
    }

    [Fact]
    public async Task Void_receipt_releases_linked_movement_and_cheque()
    {
        var tenantId = FinanceWebApplicationFactory.DemoTenantId;
        var receiptId = Guid.NewGuid();
        var movementId = Guid.NewGuid();
        var chequeId = Guid.NewGuid();
        var accountId = Guid.NewGuid();

        await _factory.WithDbAsync(async db =>
        {
            db.Accounts.Add(new FinancialAccount
            {
                Id = accountId,
                TenantId = tenantId,
                Name = "Caja",
                Currency = "ARS",
                Type = FinancialAccountType.Cash,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow
            });
            db.CollectionReceipts.Add(new CollectionReceipt
            {
                Id = receiptId,
                TenantId = tenantId,
                AccountId = accountId,
                ReceiptNumber = "RC-1",
                Amount = 500m,
                ReceiptDateUtc = DateTime.UtcNow,
                Status = "Confirmed",
                CreatedAtUtc = DateTime.UtcNow
            });
            db.CollectionReceiptLines.Add(new CollectionReceiptLine
            {
                Id = Guid.NewGuid(),
                TenantId = tenantId,
                ReceiptId = receiptId,
                Method = "Transfer",
                Amount = 500m,
                BankMovementId = movementId,
                CreatedAtUtc = DateTime.UtcNow
            });
            db.Movements.Add(new FinancialMovement
            {
                Id = movementId,
                TenantId = tenantId,
                AccountId = accountId,
                Kind = FinancialMovementKind.Credit,
                Amount = 500m,
                ReconciliationStatus = FinancialReconciliationStatus.Reconciled,
                LinkedEntityType = "CollectionReceipt",
                LinkedEntityId = receiptId,
                OperationDateUtc = DateTime.UtcNow,
                Description = "Cobro",
                CreatedAtUtc = DateTime.UtcNow
            });
            db.ReceivedCheques.Add(new ReceivedCheque
            {
                Id = chequeId,
                TenantId = tenantId,
                CheckNumber = "123",
                Amount = 500m,
                Status = ReceivedChequeStatus.Available,
                CollectionReceiptId = receiptId,
                Direction = ChequeDirection.Received,
                CreatedAtUtc = DateTime.UtcNow
            });
            await db.SaveChangesAsync();
        });

        await _factory.WithDbAsync(async db =>
        {
            var result = await FinanceVoid.VoidCollectionReceiptAsync(
                receiptId,
                new VoidFinanceDocumentRequest("Error de carga"),
                db,
                tenantId,
                CancellationToken.None);
            result.GetType().Name.Should().Contain("Ok");

            var receipt = await db.CollectionReceipts.SingleAsync(x => x.Id == receiptId);
            receipt.Status.Should().Be("Voided");
            receipt.VoidReason.Should().Be("Error de carga");

            var movement = await db.Movements.SingleAsync(x => x.Id == movementId);
            movement.ReconciliationStatus.Should().Be(FinancialReconciliationStatus.Available);
            movement.LinkedEntityId.Should().BeNull();

            var cheque = await db.ReceivedCheques.SingleAsync(x => x.Id == chequeId);
            cheque.CollectionReceiptId.Should().BeNull();
            cheque.Status.Should().Be(ReceivedChequeStatus.Available);
        });
    }

    private sealed record ImportConfirmResponse(int Imported, int Updated, int Duplicates, int Rejected, string Status);
}
