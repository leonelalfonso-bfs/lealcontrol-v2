using System;
using System.Collections.Generic;
using System.Text.Json;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Products;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Configurations;

internal sealed class ProductCategoryConfiguration : IEntityTypeConfiguration<ProductCategory>
{
    public void Configure(EntityTypeBuilder<ProductCategory> builder)
    {
        builder.ToTable("product_categories");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new CategoryId(value));
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.Name).HasMaxLength(160).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(1000);
        builder.Property(x => x.ParentCategoryId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new CategoryId(value.Value) : null);
        builder.Property(x => x.DefaultSalesAccountingCode).HasMaxLength(40);
        builder.Property(x => x.DefaultPurchaseAccountingCode).HasMaxLength(40);
        builder.Property(x => x.DefaultTaxRate).HasPrecision(5, 2);

        builder.HasIndex(x => new { x.TenantId, x.Name });
    }
}

internal sealed class ProductConfiguration : IEntityTypeConfiguration<Product>
{
    public void Configure(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("products");
        builder.HasKey(x => x.Id);
        builder.Property(x => x.Id).HasConversion(id => id.Value, value => new ProductId(value));
        builder.Property(x => x.TenantId).HasConversion(id => id.Value, value => new TenantId(value));
        builder.Property(x => x.Code).HasMaxLength(80).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Description).HasMaxLength(4000);
        builder.Property(x => x.DetailedDescription).HasMaxLength(8000);
        builder.Property(x => x.Type).HasConversion<string>().HasMaxLength(30);
        builder.Property(x => x.CategoryId)
            .HasConversion(
                id => id.HasValue ? id.Value.Value : (Guid?)null,
                value => value.HasValue ? new CategoryId(value.Value) : null);
        builder.Property(x => x.ImagePath).HasColumnType("text");

        builder.Property(x => x.SaleCurrency).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.BasePrice).HasPrecision(18, 2);
        builder.Property(x => x.PurchaseCurrency).HasConversion<string>().HasMaxLength(20);
        builder.Property(x => x.CostPrice).HasPrecision(18, 2);
        builder.Property(x => x.TaxRate).HasPrecision(5, 2);

        builder.Property(x => x.SalesAccountingCode).HasMaxLength(40);
        builder.Property(x => x.PurchaseAccountingCode).HasMaxLength(40);

        builder.Property(x => x.Stock).HasPrecision(18, 2);
        builder.Property(x => x.MinStock).HasPrecision(18, 2);
        builder.Property(x => x.BaseUnit).HasMaxLength(20);

        builder.Property(x => x.CustomAttributes)
            .HasColumnName("CustomAttributes")
            .HasColumnType("jsonb")
            .HasConversion(
                v => JsonSerializer.Serialize(v ?? new Dictionary<string, string>(), (JsonSerializerOptions?)null),
                v => string.IsNullOrWhiteSpace(v) ? new Dictionary<string, string>() : JsonSerializer.Deserialize<Dictionary<string, string>>(v, (JsonSerializerOptions?)null) ?? new Dictionary<string, string>());

        builder.Ignore(x => x.Suppliers);

        builder.HasIndex(x => new { x.TenantId, x.Code }).IsUnique();
        builder.HasIndex(x => new { x.TenantId, x.Name });
        builder.HasIndex(x => new { x.TenantId, x.Type });
    }
}
