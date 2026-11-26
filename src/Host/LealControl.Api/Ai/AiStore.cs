using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Time;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Api.Ai;

/// <summary>Configuración de la IA de una empresa. La clave de la API queda cifrada; nunca vuelve a la pantalla.</summary>
public sealed class AiSettings
{
    public const decimal DefaultMonthlyBudgetUsd = 10m;

    public Guid TenantId { get; private set; }
    public string? ProtectedApiKey { get; private set; }
    /// <summary>Los últimos 4 caracteres, para reconocer qué clave está cargada.</summary>
    public string? KeyHint { get; private set; }
    public decimal MonthlyBudgetUsd { get; private set; } = DefaultMonthlyBudgetUsd;
    public bool MailReadingEnabled { get; private set; }
    public bool AutoOpportunities { get; private set; } = true;
    /// <summary>Buscar en internet el CUIT de empresas nuevas sin CUIT para validarlas en ARCA.</summary>
    public bool WebCuitLookupEnabled { get; private set; } = true;
    /// <summary>Informe diario del supervisor comercial (arriba de "Mis avisos" y del resumen diario).</summary>
    public bool SupervisorEnabled { get; private set; }
    /// <summary>Qué hace la empresa y qué vende: le da contexto a la IA para distinguir un pedido comercial.</summary>
    public string BusinessDescription { get; private set; } = string.Empty;
    /// <summary>Desde cuándo lee mails: no procesa el historial anterior.</summary>
    public DateTime? EnabledAtUtc { get; private set; }
    public string? LastError { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public static AiSettings For(Guid tenantId) => new() { TenantId = tenantId, UpdatedAtUtc = DateTime.UtcNow };

    public bool IsActive => MailReadingEnabled && ProtectedApiKey is not null;
    public bool SupervisorActive => SupervisorEnabled && ProtectedApiKey is not null;

    public void SetApiKey(string? protectedKey, string? hint, DateTime nowUtc)
    {
        ProtectedApiKey = protectedKey;
        KeyHint = hint;
        LastError = null;
        UpdatedAtUtc = nowUtc;
    }

    public void Update(decimal budgetUsd, bool mailReading, bool autoOpportunities, bool supervisor, string? businessDescription, DateTime nowUtc, bool webCuitLookup = true)
    {
        MonthlyBudgetUsd = Math.Clamp(Math.Round(budgetUsd, 2), 0m, 1000m);
        if (mailReading && !MailReadingEnabled) EnabledAtUtc = nowUtc;
        MailReadingEnabled = mailReading;
        AutoOpportunities = autoOpportunities;
        WebCuitLookupEnabled = webCuitLookup;
        SupervisorEnabled = supervisor;
        var text = (businessDescription ?? "").Trim();
        BusinessDescription = text.Length > 1000 ? text[..1000] : text;
        UpdatedAtUtc = nowUtc;
    }

    public void RecordError(string? error) => LastError = error is { Length: > 500 } ? error[..500] : error;
}

/// <summary>Una consulta a la IA: para qué, con qué modelo, cuántos tokens y cuánto costó.</summary>
public sealed class AiUsage
{
    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public DateTime AtUtc { get; private set; }
    public string Feature { get; private set; } = string.Empty;
    public string Model { get; private set; } = string.Empty;
    public long InputTokens { get; private set; }
    public long OutputTokens { get; private set; }
    public decimal CostUsd { get; private set; }
    public bool Ok { get; private set; }
    public string? Error { get; private set; }

    public static AiUsage Record(Guid tenantId, string feature, string model, long input, long output, decimal cost, string? error, DateTime atUtc) => new()
    {
        Id = Guid.NewGuid(), TenantId = tenantId, AtUtc = atUtc, Feature = feature, Model = model, InputTokens = input, OutputTokens = output,
        CostUsd = cost, Ok = error is null, Error = error is { Length: > 500 } ? error[..500] : error
    };
}

public sealed class AiDbContext(DbContextOptions<AiDbContext> options) : DbContext(options)
{
    public DbSet<AiSettings> Settings => Set<AiSettings>();
    public DbSet<AiUsage> Usage => Set<AiUsage>();
    public DbSet<AiBriefing> Briefings => Set<AiBriefing>();

    public static AiDbContext Open(string connectionString) =>
        new(new DbContextOptionsBuilder<AiDbContext>().UseNpgsql(connectionString).Options);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("ai");
        modelBuilder.Entity<AiSettings>(b =>
        {
            b.ToTable("settings");
            b.HasKey(x => x.TenantId);
            b.Property(x => x.MonthlyBudgetUsd).HasPrecision(10, 2);
            b.Ignore(x => x.IsActive);
            b.Ignore(x => x.SupervisorActive);
        });
        modelBuilder.Entity<AiUsage>(b =>
        {
            b.ToTable("usage");
            b.HasKey(x => x.Id);
            b.Property(x => x.CostUsd).HasPrecision(12, 6);
            b.HasIndex(x => new { x.TenantId, x.AtUtc });
        });
        modelBuilder.Entity<AiBriefing>(b =>
        {
            b.ToTable("briefings");
            b.HasKey(x => new { x.TenantId, x.Day });
        });
    }

    public async Task EnsureTablesCreatedAsync(CancellationToken ct = default) =>
        await Database.ExecuteSqlRawAsync("""
            CREATE SCHEMA IF NOT EXISTS ai;
            CREATE TABLE IF NOT EXISTS ai.settings (
                "TenantId" uuid PRIMARY KEY,
                "ProtectedApiKey" text,
                "KeyHint" text,
                "MonthlyBudgetUsd" numeric(10,2) NOT NULL DEFAULT 10,
                "MailReadingEnabled" boolean NOT NULL DEFAULT false,
                "AutoOpportunities" boolean NOT NULL DEFAULT true,
                "BusinessDescription" text NOT NULL DEFAULT '',
                "EnabledAtUtc" timestamp with time zone,
                "LastError" text,
                "UpdatedAtUtc" timestamp with time zone NOT NULL);
            CREATE TABLE IF NOT EXISTS ai.usage (
                "Id" uuid PRIMARY KEY,
                "TenantId" uuid NOT NULL,
                "AtUtc" timestamp with time zone NOT NULL,
                "Feature" text NOT NULL,
                "Model" text NOT NULL,
                "InputTokens" bigint NOT NULL,
                "OutputTokens" bigint NOT NULL,
                "CostUsd" numeric(12,6) NOT NULL,
                "Ok" boolean NOT NULL,
                "Error" text);
            CREATE INDEX IF NOT EXISTS "IX_usage_TenantId_AtUtc" ON ai.usage ("TenantId", "AtUtc");
            ALTER TABLE ai.settings ADD COLUMN IF NOT EXISTS "SupervisorEnabled" boolean NOT NULL DEFAULT false;
            ALTER TABLE ai.settings ADD COLUMN IF NOT EXISTS "WebCuitLookupEnabled" boolean NOT NULL DEFAULT true;
            CREATE TABLE IF NOT EXISTS ai.briefings (
                "TenantId" uuid NOT NULL,
                "Day" date NOT NULL,
                "ItemsJson" text NOT NULL,
                "CreatedAtUtc" timestamp with time zone NOT NULL,
                PRIMARY KEY ("TenantId", "Day"));
            """, ct);

    /// <summary>Lo gastado en el mes en curso (mes de Argentina).</summary>
    public async Task<(decimal Spent, int Calls)> MonthAsync(Guid tenantId, DateTime nowUtc, CancellationToken ct)
    {
        var today = ArgentinaTime.Today(new DateTimeOffset(nowUtc, TimeSpan.Zero));
        var from = new DateTime(today.Year, today.Month, 1, 3, 0, 0, DateTimeKind.Utc); // 00:00 de Argentina
        var month = await Usage.AsNoTracking().Where(u => u.TenantId == tenantId && u.AtUtc >= from)
            .GroupBy(_ => 1).Select(g => new { Spent = g.Sum(u => u.CostUsd), Calls = g.Count() }).FirstOrDefaultAsync(ct);
        return (month?.Spent ?? 0m, month?.Calls ?? 0);
    }
}

/// <summary>El informe del supervisor comercial de un día: las prioridades, cada una con y sin importes.</summary>
public sealed class AiBriefing
{
    public Guid TenantId { get; private set; }
    public DateOnly Day { get; private set; }
    public string ItemsJson { get; private set; } = "[]";
    public DateTime CreatedAtUtc { get; private set; }

    public static AiBriefing Create(Guid tenantId, DateOnly day, string itemsJson, DateTime nowUtc) =>
        new() { TenantId = tenantId, Day = day, ItemsJson = itemsJson, CreatedAtUtc = nowUtc };
}

/// <summary>Cifra la clave de la API de cada empresa.</summary>
public sealed class AiKeyProtector(IDataProtectionProvider provider)
{
    private readonly IDataProtector _protector = provider.CreateProtector("LealControl.Ai.ApiKey.v1");
    public string Protect(string key) => _protector.Protect(key);
    public string Unprotect(string protectedKey) => _protector.Unprotect(protectedKey);
}
