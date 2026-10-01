using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Invoices;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

internal sealed class FiscalAuthorizationAttemptConfiguration : IEntityTypeConfiguration<FiscalAuthorizationAttempt>
{
    public void Configure(EntityTypeBuilder<FiscalAuthorizationAttempt> builder)
    {
        builder.ToTable("fiscal_authorization_attempts", "sales");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.RequestHash).HasMaxLength(64).IsRequired();
        builder.Property(x => x.RecipientDocument).HasMaxLength(32).IsRequired();
        builder.Property(x => x.Status).HasMaxLength(20).IsRequired();
        builder.Property(x => x.Cae).HasMaxLength(14);
        builder.Property(x => x.Total).HasPrecision(18, 2);
        builder.HasIndex(x => new { x.TenantId, x.InvoiceId }).HasDatabaseName("UX_fiscal_attempt_invoice").IsUnique();
        builder.HasIndex(x => new { x.TenantId, x.PointOfSale, x.VoucherType, x.VoucherNumber })
            .HasDatabaseName("UX_fiscal_attempt_number").IsUnique();
    }
}
