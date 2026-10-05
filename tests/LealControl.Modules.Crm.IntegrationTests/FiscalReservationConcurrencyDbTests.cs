using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;
using System.Reflection;
using LealControl.Modules.Sales.Infrastructure.Persistence.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Operations;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class FiscalReservationConcurrencyDbTests : IAsyncLifetime
{
    private readonly CrmWebApplicationFactory _factory = new();
    public Task InitializeAsync() => _factory.InitializeAsync();
    public Task DisposeAsync() => _factory.DisposeAsync();

    [Theory]
    [InlineData("Reserved")]
    [InlineData("Pending")]
    [InlineData("Unknown")]
    public async Task Concurrent_different_numbers_allow_only_one_unresolved_reservation(string status)
    {
        using var client = _factory.CreateAuthenticatedClient();
        var first = await CreateDraft(client);
        var second = await CreateDraft(client);
        var ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var arrived = 0;
        async Task<bool> TryInsert(Guid invoice, long number)
        {
            await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
            await db.OpenAsync();
            await using var tx = await db.BeginTransactionAsync();
            if (Interlocked.Increment(ref arrived) == 2) ready.TrySetResult(true);
            await ready.Task.WaitAsync(TimeSpan.FromSeconds(15));
            try
            {
                await Insert(db, tx, invoice, number, 5, status);
                await tx.CommitAsync();
                return true;
            }
            catch (PostgresException ex) when (ex.SqlState == "23505")
            {
                Assert.Equal("UX_fiscal_attempt_unresolved_series", ex.ConstraintName);
                await tx.RollbackAsync();
                return false;
            }
        }
        var outcomes = await Task.WhenAll(TryInsert(first, 9001), TryInsert(second, 9002))
            .WaitAsync(TimeSpan.FromSeconds(30));
        Assert.Single(outcomes, x => x);
        await using var check = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await check.OpenAsync();
        await using var count = new NpgsqlCommand("SELECT count(*) FROM sales.fiscal_authorization_attempts", check);
        Assert.Equal(1L, await count.ExecuteScalarAsync());
    }

    [Fact]
    public async Task Resolved_reservation_releases_series_and_other_points_are_independent()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var first = await CreateDraft(client);
        var second = await CreateDraft(client);
        var third = await CreateDraft(client);
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await Insert(db, null, first, 9001, 5, "Pending");
        await Insert(db, null, second, 9001, 6, "Reserved");
        await using (var resolve = new NpgsqlCommand(
            "UPDATE sales.fiscal_authorization_attempts SET \"Status\" = 'Rejected' WHERE \"InvoiceId\" = @invoice", db))
        {
            resolve.Parameters.AddWithValue("invoice", first);
            await resolve.ExecuteNonQueryAsync();
        }
        await Insert(db, null, third, 9002, 5, "Reserved");
        await using var count = new NpgsqlCommand("SELECT count(*) FROM sales.fiscal_authorization_attempts", db);
        Assert.Equal(3L, await count.ExecuteScalarAsync());
    }

    [Fact]
    public async Task Legacy_status_constraint_is_upgraded_idempotently_without_changing_pending_rows()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var first = await CreateDraft(client);
        var second = await CreateDraft(client);
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await Insert(db, null, first, 9001, 5, "Pending");
        await using (var legacy = new NpgsqlCommand("""
            DROP INDEX sales."UX_fiscal_attempt_unresolved_series";
            ALTER TABLE sales.fiscal_authorization_attempts DROP CONSTRAINT "CK_fiscal_attempt_status";
            ALTER TABLE sales.fiscal_authorization_attempts
                ADD CONSTRAINT "fiscal_authorization_attempts_Status_check"
                CHECK ("Status" IN ('Pending','Unknown','Confirmed','Rejected'));
            """, db))
        {
            await legacy.ExecuteNonQueryAsync();
        }
        var migration = new FiscalReservationSeriesGuard();
        for (var pass = 0; pass < 2; pass++)
        {
            foreach (var operation in migration.UpOperations.OfType<SqlOperation>())
            {
                await using var upgrade = new NpgsqlCommand(operation.Sql, db);
                await upgrade.ExecuteNonQueryAsync();
            }
        }
        await using (var existing = new NpgsqlCommand(
            "SELECT \"Status\" FROM sales.fiscal_authorization_attempts WHERE \"InvoiceId\" = @invoice", db))
        {
            existing.Parameters.AddWithValue("invoice", first);
            Assert.Equal("Pending", await existing.ExecuteScalarAsync());
        }
        await Insert(db, null, second, 9002, 6, "Reserved");
    }

    [Fact]
    public async Task Existing_conflicting_reservations_make_bootstrap_fail_without_changing_them()
    {
        using var client = _factory.CreateAuthenticatedClient();
        var first = await CreateDraft(client);
        var second = await CreateDraft(client);
        await using var db = new NpgsqlConnection(_factory.DatabaseConnectionString);
        await db.OpenAsync();
        await using (var removeGuard = new NpgsqlCommand(
            "DROP INDEX sales.\"UX_fiscal_attempt_unresolved_series\"", db))
            await removeGuard.ExecuteNonQueryAsync();
        await Insert(db, null, first, 9001, 5, "Pending");
        await Insert(db, null, second, 9002, 5, "Unknown");

        // Ejecuta el camino real de bootstrap sobre esta base efímera ya inicializada.
        var type = typeof(Program).Assembly.GetTypes().Single(t => t.Name == "TenantDatabaseBootstrapper");
        var method = type.GetMethod("EnsureDatabaseSchemaAsync", BindingFlags.Static | BindingFlags.NonPublic);
        Assert.NotNull(method);
        var connection = new NpgsqlConnectionStringBuilder(_factory.DatabaseConnectionString);
        var task = (Task)method.Invoke(null, new object[]
        {
            _factory.DatabaseConnectionString, connection.Database!, CancellationToken.None
        })!;
        var error = await Assert.ThrowsAsync<PostgresException>(() => task);
        Assert.Equal("23505", error.SqlState);
        Assert.Equal("UX_fiscal_attempt_unresolved_series", error.ConstraintName);

        // El inicializador general debe informar el fallo al host, aunque revise las demás bases.
        var configuration = _factory.Services.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
        var environment = _factory.Services.GetRequiredService<Microsoft.Extensions.Hosting.IHostEnvironment>();
        var aggregate = await Assert.ThrowsAsync<AggregateException>(() =>
            LealControl.Api.SuperAdmin.TenantDatabaseBootstrapper.InitializeAllAsync(
                _factory.Services, configuration, environment));
        Assert.Contains(aggregate.Flatten().InnerExceptions, ex =>
            ex is PostgresException pg && pg.SqlState == "23505" &&
            pg.ConstraintName == "UX_fiscal_attempt_unresolved_series");

        await using var query = new NpgsqlCommand("""
            SELECT "InvoiceId", "Status", "VoucherNumber", "Cae"
            FROM sales.fiscal_authorization_attempts ORDER BY "VoucherNumber"
            """, db);
        await using var reader = await query.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync());
        Assert.Equal(first, reader.GetGuid(0));
        Assert.Equal("Pending", reader.GetString(1));
        Assert.Equal(9001L, reader.GetInt64(2));
        Assert.True(reader.IsDBNull(3));
        Assert.True(await reader.ReadAsync());
        Assert.Equal(second, reader.GetGuid(0));
        Assert.Equal("Unknown", reader.GetString(1));
        Assert.Equal(9002L, reader.GetInt64(2));
        Assert.True(reader.IsDBNull(3));
        Assert.False(await reader.ReadAsync());
    }

    private static async Task<Guid> CreateDraft(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/v1/sales/invoices", new
        {
            invoiceType = "A", pointOfSale = 5,
            customerId = Guid.NewGuid(), customerName = "Cliente prueba",
            customerDocument = "20123456786", customerTaxCondition = "ResponsableInscripto",
            dueDate = DateTime.UtcNow.AddDays(30), currency = "ARS", exchangeRate = 1,
            items = new[] { new { code = "S", description = "Servicio", quantity = 1,
                unitPrice = 1, vatRate = 0 } }
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return body.RootElement.GetProperty("id").GetGuid();
    }

    private static async Task Insert(NpgsqlConnection db, NpgsqlTransaction? tx,
        Guid invoice, long number, int point, string status)
    {
        await using var cmd = new NpgsqlCommand("""
            INSERT INTO sales.fiscal_authorization_attempts
            ("Id","TenantId","InvoiceId","PointOfSale","VoucherType","VoucherNumber",
             "IssuerCuit","Production","RequestHash","RecipientDocument","Total","Status","CreatedAtUtc")
            VALUES (@id,@tenant,@invoice,@point,1,@number,'30715489629',false,@hash,'20123456786',1,@status,@created)
            """, db, tx);
        cmd.CommandTimeout = 15;
        cmd.Parameters.AddWithValue("id", Guid.NewGuid());
        cmd.Parameters.AddWithValue("tenant", CrmWebApplicationFactory.DemoTenantId);
        cmd.Parameters.AddWithValue("invoice", invoice);
        cmd.Parameters.AddWithValue("point", point);
        cmd.Parameters.AddWithValue("number", number);
        cmd.Parameters.AddWithValue("hash", new string('a', 64));
        cmd.Parameters.AddWithValue("status", status);
        cmd.Parameters.AddWithValue("created", DateTime.UtcNow);
        await cmd.ExecuteNonQueryAsync();
    }
}
