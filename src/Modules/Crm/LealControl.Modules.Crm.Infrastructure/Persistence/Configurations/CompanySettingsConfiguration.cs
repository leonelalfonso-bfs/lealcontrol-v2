using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Configurations;

internal sealed class CompanySettingsConfiguration : IEntityTypeConfiguration<CompanySettings>
{
    public void Configure(EntityTypeBuilder<CompanySettings> builder)
    {
        builder.ToTable("tenant_settings", "public");

        builder.HasKey(s => s.TenantId);

        builder.Property(s => s.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value));

        builder.Property(s => s.LegalName).HasMaxLength(256).IsRequired();
        builder.Property(s => s.TradeName).HasMaxLength(256);
        builder.Property(s => s.DocumentType).HasMaxLength(20).IsRequired();
        builder.Property(s => s.DocumentNumber).HasMaxLength(20).IsRequired();
        builder.Property(s => s.TaxCondition).HasMaxLength(64).IsRequired();
        builder.Property(s => s.IibbRegime).HasMaxLength(64).IsRequired();
        builder.Property(s => s.IibbNumber).HasMaxLength(64);
        builder.Property(s => s.ActivityStartDate).HasMaxLength(32);
        builder.Property(s => s.Email).HasMaxLength(128);
        builder.Property(s => s.Phone).HasMaxLength(64);
        builder.Property(s => s.WhatsApp).HasMaxLength(64);
        builder.Property(s => s.Website).HasMaxLength(256);
        builder.Property(s => s.FiscalStreet).HasMaxLength(256);
        builder.Property(s => s.FiscalCity).HasMaxLength(128);
        builder.Property(s => s.FiscalProvince).HasMaxLength(64);
        builder.Property(s => s.FiscalPostalCode).HasMaxLength(20);
        builder.Property(s => s.ArcaEnvironment).HasMaxLength(32).IsRequired();
        builder.Property(s => s.ArcaSignerCuit).HasMaxLength(20);
        builder.Property(s => s.BankName).HasMaxLength(128);
        builder.Property(s => s.BankCbu).HasMaxLength(64);
        builder.Property(s => s.BankAlias).HasMaxLength(64);
        builder.Property(s => s.DefaultWarranty).HasMaxLength(256);
        builder.Property(s => s.DefaultPaymentTerms).HasMaxLength(256);
    }
}

internal sealed class TenantUserConfiguration : IEntityTypeConfiguration<TenantUser>
{
    public void Configure(EntityTypeBuilder<TenantUser> builder)
    {
        builder.ToTable("tenant_users", "public");

        builder.HasKey(u => u.Id);

        builder.Property(u => u.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value));

        builder.Property(u => u.FullName).HasMaxLength(128).IsRequired();
        builder.Property(u => u.Email).HasMaxLength(128).IsRequired();
        builder.Property(u => u.Role).HasMaxLength(64).IsRequired();
        builder.Property(u => u.PasswordHash).HasMaxLength(256);
        builder.Property(u => u.LastLoginUtc);
    }
}
