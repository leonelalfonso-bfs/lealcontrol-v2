using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Domain.Quotes;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Repositories;

internal sealed class QuoteRepository : IQuoteRepository
{
    private readonly SalesDbContext _db;

    public QuoteRepository(SalesDbContext db) => _db = db;

    public Task<Quote?> GetByIdAsync(QuoteId id, CancellationToken cancellationToken = default) =>
        _db.Quotes.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id, cancellationToken);

    public async Task<Quote?> FindByOpportunityAsync(
        TenantId tenantId,
        Guid opportunityId,
        CancellationToken cancellationToken = default) =>
        await _db.Quotes.Include(x => x.Lines)
            .FirstOrDefaultAsync(
                x => x.TenantId == tenantId
                    && x.OpportunityId == opportunityId
                    && x.Status != QuoteStatus.Cancelled,
                cancellationToken);

    public async Task<IReadOnlyList<Quote>> ListAsync(
        TenantId tenantId,
        CancellationToken cancellationToken = default) =>
        await _db.Quotes.AsNoTracking()
            .Include(x => x.Lines)
            .Where(x => x.TenantId == tenantId)
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

    public Task<int> CountAsync(TenantId tenantId, CancellationToken cancellationToken = default) =>
        _db.Quotes.CountAsync(x => x.TenantId == tenantId, cancellationToken);

    public async Task<string> NextNumberAsync(TenantId tenantId, int year, CancellationToken cancellationToken = default)
    {
        var prefix = $"P-{year}-";
        var numbers = await _db.Quotes.AsNoTracking()
            .Where(x => x.TenantId == tenantId && x.QuoteNumber.StartsWith(prefix))
            .Select(x => x.QuoteNumber)
            .ToListAsync(cancellationToken);

        var max = 0;
        foreach (var number in numbers)
        {
            if (number.Length > prefix.Length
                && int.TryParse(number.AsSpan(prefix.Length), out var value)
                && value > max)
            {
                max = value;
            }
        }

        return $"{prefix}{(max + 1):D4}";
    }

    public async Task EnsureTechnicalDetailColumnAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _db.Database.ExecuteSqlRawAsync(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM information_schema.tables
                        WHERE table_schema = 'sales' AND table_name = 'quote_lines'
                    ) THEN
                        ALTER TABLE sales.quote_lines ADD COLUMN IF NOT EXISTS "TechnicalDetail" text;

                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'sales' AND table_name = 'quote_lines'
                              AND column_name = 'Description'
                              AND character_maximum_length IS NOT NULL
                              AND character_maximum_length < 4000
                        ) THEN
                            ALTER TABLE sales.quote_lines ALTER COLUMN "Description" TYPE character varying(4000);
                        END IF;

                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = 'sales' AND table_name = 'quote_lines'
                              AND column_name = 'CurrencyCode'
                              AND character_maximum_length IS NOT NULL
                              AND character_maximum_length < 20
                        ) THEN
                            ALTER TABLE sales.quote_lines ALTER COLUMN "CurrencyCode" TYPE character varying(20);
                        END IF;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'sales' AND table_name = 'quotes'
                          AND column_name = 'Currency'
                          AND character_maximum_length IS NOT NULL
                          AND character_maximum_length < 20
                    ) THEN
                        ALTER TABLE sales.quotes ALTER COLUMN "Currency" TYPE character varying(20);
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'sales' AND table_name = 'quotes'
                          AND column_name = 'PaymentTerms'
                          AND character_maximum_length IS NOT NULL
                          AND character_maximum_length < 2000
                    ) THEN
                        ALTER TABLE sales.quotes ALTER COLUMN "PaymentTerms" TYPE character varying(2000);
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'sales' AND table_name = 'quotes'
                          AND column_name = 'Warranty'
                          AND character_maximum_length IS NOT NULL
                          AND character_maximum_length < 2000
                    ) THEN
                        ALTER TABLE sales.quotes ALTER COLUMN "Warranty" TYPE character varying(2000);
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_schema = 'sales' AND table_name = 'quotes'
                          AND column_name = 'Notes'
                          AND character_maximum_length IS NOT NULL
                          AND character_maximum_length < 8000
                    ) THEN
                        ALTER TABLE sales.quotes ALTER COLUMN "Notes" TYPE character varying(8000);
                    END IF;
                END $$;
                """,
                cancellationToken);
        }
        catch (Exception)
        {
            // Si la columna ya está, el INSERT sigue. Si falta, SaveAsync devuelve el error de Postgres.
        }
    }

    public async Task SaveAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex)
        {
            var pg = ex.InnerException as PostgresException ?? ex.GetBaseException() as PostgresException;
            var collision = pg?.SqlState == PostgresErrorCodes.UniqueViolation
                && (pg.ConstraintName?.Contains("QuoteNumber", StringComparison.OrdinalIgnoreCase) == true
                    || string.Equals(pg.TableName, "quotes", StringComparison.OrdinalIgnoreCase));
            throw new QuotePersistenceException(ToSaveMessage(pg), collision);
        }
    }

    private static string ToSaveMessage(PostgresException? pg)
    {
        if (pg is null)
        {
            return "No se pudo guardar el presupuesto.";
        }

        return pg.SqlState switch
        {
            PostgresErrorCodes.UniqueViolation =>
                "Ya existe un presupuesto con ese número. Guardá de nuevo.",
            PostgresErrorCodes.UndefinedColumn =>
                "Falta una columna en la base del presupuesto: " + pg.MessageText,
            PostgresErrorCodes.StringDataRightTruncation =>
                "Hay un texto demasiado largo para guardarlo: " + pg.MessageText,
            _ => pg.MessageText
        };
    }

    public void Add(Quote quote) => _db.Quotes.Add(quote);

    public void Remove(Quote quote) => _db.Quotes.Remove(quote);
}
