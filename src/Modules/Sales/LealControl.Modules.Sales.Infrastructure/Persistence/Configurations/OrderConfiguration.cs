using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Orders;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Configurations;

internal sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("orders");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new OrderId(value));
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.OrderNumber).HasMaxLength(40).IsRequired();
        builder.Property(x => x.QuoteNumber).HasMaxLength(40);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
        builder.Property(x => x.Currency).HasMaxLength(20);
        builder.Property(x => x.ExchangeRateUsdBillete).HasPrecision(18, 2);
        builder.Property(x => x.ExchangeRateUsdDivisa).HasPrecision(18, 2);
        builder.Property(x => x.DiscountPercent).HasPrecision(8, 4);
        builder.Property(x => x.Subtotal).HasPrecision(18, 2);
        builder.Property(x => x.Total).HasPrecision(18, 2);
        builder.Property(x => x.PaymentTerms).HasMaxLength(200);
        builder.Property(x => x.PaymentMethod).HasMaxLength(100);
        builder.Property(x => x.Transportation).HasMaxLength(200);
        builder.Property(x => x.Warranty).HasMaxLength(200);
        builder.Property(x => x.Notes).HasMaxLength(4000);
        builder.Property(x => x.OwnerName).HasMaxLength(120);

        builder.OwnsMany(x => x.Lines, line =>
        {
            line.ToTable("order_lines");
            line.WithOwner().HasForeignKey("OrderId");
            line.Property<OrderId>("OrderId")
                .HasColumnName("OrderId")
                .HasConversion(id => id.Value, value => new OrderId(value));
            line.HasKey(x => x.Id);
            line.Property(x => x.Id).HasColumnName("Id").HasConversion(id => id.Value, value => new OrderLineId(value));
            line.Property(x => x.ProductId).HasColumnName("ProductId");
            line.Property(x => x.Description).HasMaxLength(500).IsRequired();
            line.Property(x => x.Quantity).HasPrecision(18, 4);
            line.Property(x => x.UnitPrice).HasPrecision(18, 4);
            line.Property(x => x.DiscountPercent).HasPrecision(8, 4);
            line.Property(x => x.TaxRate).HasPrecision(8, 4);
            line.Property(x => x.CurrencyCode).HasMaxLength(20);
            line.Property(x => x.LineSubtotal).HasPrecision(18, 2);
        });

        builder.Navigation(x => x.Lines)
            .HasField("_lines")
            .UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasIndex(x => new { x.TenantId, x.OrderNumber }).IsUnique();
        builder.HasIndex(x => new { x.TenantId, x.CustomerId });
    }
}
