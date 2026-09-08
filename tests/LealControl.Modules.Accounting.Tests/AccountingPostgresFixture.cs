using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;
using Xunit;

namespace LealControl.Modules.Accounting.Tests;

public sealed class AccountingPostgresFixture : IAsyncLifetime
{
    private readonly PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .WithDatabase("lealcontrol_accounting_tests")
        .WithUsername("leal")
        .WithPassword("leal")
        .Build();

    public string ConnectionString => _postgres.GetConnectionString();

    public TenantId TenantId { get; } = new(Guid.Parse("22222222-2222-2222-2222-222222222222"));

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        await using var conn = new NpgsqlConnection(ConnectionString);
        await conn.OpenAsync();
        await using var cmd = new NpgsqlCommand("CREATE SCHEMA IF NOT EXISTS accounting;", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DisposeAsync() => await _postgres.DisposeAsync();

    public AccountingDbContext CreateDb()
    {
        var options = new DbContextOptionsBuilder<AccountingDbContext>()
            .UseNpgsql(ConnectionString)
            .Options;
        return new AccountingDbContext(options);
    }

    public async Task<AccountingDbContext> CreateReadyDbAsync()
    {
        var db = CreateDb();
        await db.EnsureAccountingTablesAsync();
        await db.SeedDefaultChartOfAccountsAsync(TenantId);
        await db.SeedDefaultJournalTemplatesAsync(TenantId);
        return db;
    }
}
