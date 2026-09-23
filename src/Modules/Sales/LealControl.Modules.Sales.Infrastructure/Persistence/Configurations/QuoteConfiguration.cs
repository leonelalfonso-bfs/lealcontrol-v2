using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Quotes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Configurations;

internal sealed class QuoteConfiguration : IEntityTypeConfiguration<Quote>
{
    public void Configure(EntityTypeBuilder<Quote> builder)
    {
        builder.ToTable("quotes");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new QuoteId(value));
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.QuoteNumber).HasMaxLength(40).IsRequired();
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.Currency).HasMaxLength(20);
        builder.Property(x => x.ExchangeRateUsdBillete).HasPrecision(18, 2);
        builder.Property(x => x.ExchangeRateUsdDivisa).HasPrecision(18, 2);
        builder.Property(x => x.DiscountPercent).HasPrecision(8, 4);
        builder.Property(x => x.PaymentTerms).HasMaxLength(2000);
        builder.Property(x => x.PaymentMethod).HasMaxLength(100);
        builder.Property(x => x.Transportation).HasMaxLength(200);
        builder.Property(x => x.Warranty).HasMaxLength(2000);
        builder.Property(x => x.Notes).HasMaxLength(8000);
        builder.Property(x => x.OwnerName).HasMaxLength(120);

        builder.Ignore(x => x.Subtotal);
        builder.Ignore(x => x.Total);
        builder.Ignore(x => x.IsEditable);

        builder.OwnsMany(x => x.Lines, line =>
        {
            line.ToTable("quote_lines");
            line.WithOwner().HasForeignKey("quote_id");
            line.Property<QuoteId>("quote_id")
                .HasColumnName("quote_id")
                .HasConversion(id => id.Value, value => new QuoteId(value));
            line.HasKey(x => x.Id);
            line.Property(x => x.Id).HasColumnName("Id").HasConversion(id => id.Value, value => new QuoteLineId(value));
            line.Property(x => x.ProductId).HasColumnName("ProductId");
            line.Property(x => x.Description).HasMaxLength(4000).IsRequired();
            line.Property(x => x.Quantity).HasPrecision(18, 4);
            line.Property(x => x.UnitPrice).HasPrecision(18, 2);
            line.Property(x => x.DiscountPercent).HasPrecision(8, 4);
            line.Property(x => x.TaxRate).HasPrecision(8, 4);
            line.Property(x => x.CurrencyCode).HasMaxLength(20);
            line.Property(x => x.TechnicalDetail).HasColumnType("text");
            line.Ignore(x => x.LineSubtotal);
        });

        builder.Navigation(x => x.Lines)
            .HasField("_lines")
            .UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasIndex(x => new { x.TenantId, x.QuoteNumber }).IsUnique();
        builder.HasIndex(x => new { x.TenantId, x.OpportunityId });
        builder.HasIndex(x => new { x.TenantId, x.CustomerId, x.Status });
    }
}
