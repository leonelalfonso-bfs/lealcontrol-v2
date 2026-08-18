using System.Text.Json;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Crm.Infrastructure.Persistence.Configurations;

internal sealed class CustomerConfiguration : IEntityTypeConfiguration<Customer>
{
    public void Configure(EntityTypeBuilder<Customer> builder)
    {
        builder.ToTable("customers");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id)
            .HasConversion(id => id.Value, value => new CustomerId(value));

        builder.Property(x => x.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value))
            .IsRequired();

        builder.Property(x => x.LegalName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.TradeName).HasMaxLength(200);
        builder.Property(x => x.Notes).HasMaxLength(4000);
        builder.Property(x => x.CreditLimit).HasPrecision(18, 2);
        builder.Property(x => x.FceThreshold).HasPrecision(18, 2);
        builder.Property(x => x.TaxCondition).HasConversion<string>().HasMaxLength(40);
        builder.Property(x => x.IibbRegime).HasConversion<string>().HasMaxLength(40);
        builder.Property(x => x.Status).HasConversion<string>().HasMaxLength(20);

        builder.OwnsOne(x => x.Document, document =>
        {
            document.Property(d => d.Type).HasColumnName("document_type").HasConversion<string>().HasMaxLength(20);
            document.Property(d => d.Number).HasColumnName("document_number").HasMaxLength(20);
        });

        builder.OwnsOne(x => x.Email, email =>
        {
            email.Property(e => e.Value).HasColumnName("email").HasMaxLength(200);
        });

        builder.OwnsOne(x => x.Phone, phone =>
        {
            phone.Property(p => p.Value).HasColumnName("phone").HasMaxLength(20);
        });

        builder.OwnsOne(x => x.WhatsApp, phone =>
        {
            phone.Property(p => p.Value).HasColumnName("whatsapp").HasMaxLength(20);
        });

        builder.OwnsOne(x => x.FiscalAddress, address =>
        {
            address.Property(a => a.Street).HasColumnName("fiscal_street").HasMaxLength(200);
            address.Property(a => a.City).HasColumnName("fiscal_city").HasMaxLength(120);
            address.Property(a => a.Province).HasColumnName("fiscal_province").HasConversion<string>().HasMaxLength(40);
            address.Property(a => a.PostalCode).HasColumnName("fiscal_postal_code").HasMaxLength(12);
        });

        builder.HasMany(x => x.Locations)
            .WithOne()
            .HasForeignKey("customer_id")
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.Locations).HasField("_locations").UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(x => x.Contacts)
            .WithOne()
            .HasForeignKey("customer_id")
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.Contacts).HasField("_contacts").UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasMany(x => x.Equipments)
            .WithOne()
            .HasForeignKey("customer_id")
            .OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(x => x.Equipments).HasField("_equipments").UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.OwnsMany(x => x.FiscalRates, rates =>
        {
            rates.ToTable("customer_fiscal_rates");
            rates.WithOwner().HasForeignKey("customer_id");
            rates.Property<Guid>("id");
            rates.HasKey("id");
            rates.Property(r => r.Jurisdiction).HasConversion<string>().HasMaxLength(40);
            rates.Property(r => r.PerceptionRate).HasPrecision(8, 4);
            rates.Property(r => r.RetentionRate).HasPrecision(8, 4);
            rates.Property(r => r.ExclusionCertificateNumber).HasMaxLength(80);
            rates.HasIndex("customer_id", nameof(CustomerFiscalRate.Jurisdiction)).IsUnique();
        });
        builder.Navigation(x => x.FiscalRates).HasField("_fiscalRates").UsePropertyAccessMode(PropertyAccessMode.Field);

        builder.HasIndex(x => new { x.TenantId, x.LegalName });

        builder.HasQueryFilter(x => x.DeletedAtUtc == null);
        builder.Property(x => x.DeletedAtUtc).HasColumnName("deleted_at_utc");
    }
}

internal sealed class CustomerLocationConfiguration : IEntityTypeConfiguration<CustomerLocation>
{
    public void Configure(EntityTypeBuilder<CustomerLocation> builder)
    {
        builder.ToTable("customer_locations");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new LocationId(value));
        builder.Property(x => x.Name).HasMaxLength(160).IsRequired();
        builder.Property(x => x.Notes).HasMaxLength(2000);

        builder.OwnsOne(x => x.Address, address =>
        {
            address.Property(a => a.Street).HasColumnName("street").HasMaxLength(200).IsRequired();
            address.Property(a => a.City).HasColumnName("city").HasMaxLength(120).IsRequired();
            address.Property(a => a.Province).HasColumnName("province").HasConversion<string>().HasMaxLength(40).IsRequired();
            address.Property(a => a.PostalCode).HasColumnName("postal_code").HasMaxLength(12).IsRequired();
        });

        builder.OwnsOne(x => x.Phone, phone =>
        {
            phone.Property(p => p.Value).HasColumnName("phone").HasMaxLength(20);
        });
    }
}

internal sealed class CustomerContactConfiguration : IEntityTypeConfiguration<CustomerContact>
{
    public void Configure(EntityTypeBuilder<CustomerContact> builder)
    {
        builder.ToTable("customer_contacts");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new ContactId(value));
        builder.Property(x => x.Name).HasMaxLength(160).IsRequired();
        builder.Property(x => x.Role).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.Notes).HasMaxLength(2000);
        builder.Property(x => x.LocationId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new LocationId(value.Value) : null);

        builder.OwnsOne(x => x.Email, email =>
        {
            email.Property(e => e.Value).HasColumnName("email").HasMaxLength(200);
        });

        builder.OwnsOne(x => x.Phone, phone =>
        {
            phone.Property(p => p.Value).HasColumnName("phone").HasMaxLength(20);
        });

        builder.OwnsOne(x => x.WhatsApp, phone =>
        {
            phone.Property(p => p.Value).HasColumnName("whatsapp").HasMaxLength(20);
        });
    }
}

internal sealed class CustomerEquipmentConfiguration : IEntityTypeConfiguration<CustomerEquipment>
{
    public void Configure(EntityTypeBuilder<CustomerEquipment> builder)
    {
        builder.ToTable("customer_equipments");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new EquipmentId(value));
        builder.Property(x => x.InternalCode).HasMaxLength(80).IsRequired();
        builder.Property(x => x.EquipmentType).HasMaxLength(120).IsRequired();
        builder.Property(x => x.Brand).HasMaxLength(120);
        builder.Property(x => x.Model).HasMaxLength(120);
        builder.Property(x => x.SerialNumber).HasMaxLength(120);
        builder.Property(x => x.MaxCapacity).HasMaxLength(80);
        builder.Property(x => x.DivisionScale).HasMaxLength(80);
        builder.Property(x => x.Status).HasMaxLength(40);
        builder.Property(x => x.Notes).HasMaxLength(2000);
        builder.Property(x => x.LocationId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new LocationId(value.Value) : null);
        builder.Property(x => x.CustomAttributes)
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v ?? new Dictionary<string, string>(), (JsonSerializerOptions?)null),
                v => string.IsNullOrWhiteSpace(v) ? new Dictionary<string, string>() : JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, string>());
    }
}
