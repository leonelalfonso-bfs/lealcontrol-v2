using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

public sealed class HistoricalQuote
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string SourceSystem { get; set; } = string.Empty;
    public long LegacyId { get; set; }
    public long? LegacyParentId { get; set; }
    public string QuoteNumber { get; set; } = string.Empty;
    public int Revision { get; set; }
    public Guid CustomerId { get; set; }
    public string CustomerName { get; set; } = string.Empty;
    public DateOnly QuoteDate { get; set; }
    public string Currency { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public decimal NetTotal { get; set; }
    public string SourceSnapshot { get; set; } = "{}";
    public string LinesSnapshot { get; set; } = "[]";
    public Guid? PromotedQuoteId { get; set; }
}

internal sealed class HistoricalQuoteConfiguration : IEntityTypeConfiguration<HistoricalQuote>
{
    public void Configure(EntityTypeBuilder<HistoricalQuote> builder)
    {
        builder.ToTable("historical_quotes", SalesDbContext.Schema);
        builder.HasKey(x => x.Id);
        builder.Property(x => x.SourceSystem).HasMaxLength(40);
        builder.Property(x => x.QuoteNumber).HasMaxLength(100);
        builder.Property(x => x.CustomerName).HasMaxLength(200);
        builder.Property(x => x.Currency).HasMaxLength(32);
        builder.Property(x => x.Status).HasMaxLength(32);
        builder.Property(x => x.NetTotal).HasPrecision(18, 2);
        builder.Property(x => x.SourceSnapshot).HasColumnType("jsonb");
        builder.Property(x => x.LinesSnapshot).HasColumnType("jsonb");
        builder.HasIndex(x => new { x.TenantId, x.SourceSystem, x.LegacyId }).IsUnique();
    }
}
