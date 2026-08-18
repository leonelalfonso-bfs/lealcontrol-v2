using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Inventory;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Configurations;

public sealed class WarehouseConfiguration : IEntityTypeConfiguration<Warehouse>
{
    public void Configure(EntityTypeBuilder<Warehouse> builder)
    {
        builder.ToTable("Warehouses");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value))
            .IsRequired();

        builder.Property(x => x.Code).HasMaxLength(50).IsRequired();
        builder.Property(x => x.Name).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Type).IsRequired();
        builder.Property(x => x.Address).HasMaxLength(500);
        builder.Property(x => x.AssignedTechnicianName).HasMaxLength(200);
        builder.Property(x => x.IsActive).IsRequired();
    }
}

public sealed class StockItemConfiguration : IEntityTypeConfiguration<StockItem>
{
    public void Configure(EntityTypeBuilder<StockItem> builder)
    {
        builder.ToTable("StockItems");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value))
            .IsRequired();

        builder.Property(x => x.ProductId).IsRequired();
        builder.Property(x => x.WarehouseId);
        builder.Property(x => x.WarehouseName).HasMaxLength(200);
        builder.Property(x => x.WarehouseLocation).HasMaxLength(200);

        builder.Property(x => x.PhysicalStock).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.ReservedStock).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.IncomingStock).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.MinimumStock).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.ReorderPoint).HasPrecision(18, 4).IsRequired();
    }
}

public sealed class StockMovementConfiguration : IEntityTypeConfiguration<StockMovement>
{
    public void Configure(EntityTypeBuilder<StockMovement> builder)
    {
        builder.ToTable("StockMovements");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value))
            .IsRequired();

        builder.Property(x => x.ProductId).IsRequired();
        builder.Property(x => x.WarehouseId);
        builder.Property(x => x.WarehouseName).HasMaxLength(200);
        builder.Property(x => x.MovementType).HasMaxLength(100).IsRequired();
        builder.Property(x => x.Quantity).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.PreviousPhysicalStock).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.NewPhysicalStock).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.UnitCostArs).HasPrecision(18, 4);
        builder.Property(x => x.UnitCostUsd).HasPrecision(18, 4);
        builder.Property(x => x.SerialNumbers).HasMaxLength(1000);
        builder.Property(x => x.LotNumber).HasMaxLength(200);
        builder.Property(x => x.ReferenceType).HasMaxLength(100);
        builder.Property(x => x.ReferenceNumber).HasMaxLength(100);
        builder.Property(x => x.OperatorName).HasMaxLength(200);
        builder.Property(x => x.Notes).HasMaxLength(1000);
    }
}

public sealed class StockTransferConfiguration : IEntityTypeConfiguration<StockTransfer>
{
    public void Configure(EntityTypeBuilder<StockTransfer> builder)
    {
        builder.ToTable("StockTransfers");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value))
            .IsRequired();

        builder.Property(x => x.TransferNumber).HasMaxLength(50).IsRequired();
        builder.Property(x => x.OriginWarehouseName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.DestinationWarehouseName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Status).IsRequired();
        builder.Property(x => x.OperatorName).HasMaxLength(200);
        builder.Property(x => x.Notes).HasMaxLength(1000);

        builder.HasMany(x => x.Items)
            .WithOne()
            .HasForeignKey(x => x.StockTransferId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public sealed class StockTransferItemConfiguration : IEntityTypeConfiguration<StockTransferItem>
{
    public void Configure(EntityTypeBuilder<StockTransferItem> builder)
    {
        builder.ToTable("StockTransferItems");
        builder.HasKey(x => x.Id);

        builder.Property(x => x.ProductCode).HasMaxLength(100).IsRequired();
        builder.Property(x => x.ProductName).HasMaxLength(200).IsRequired();
        builder.Property(x => x.Quantity).HasPrecision(18, 4).IsRequired();
        builder.Property(x => x.SerialNumbers).HasMaxLength(1000);
        builder.Property(x => x.LotNumber).HasMaxLength(200);
    }
}

public sealed class ProductSupplierConfiguration : IEntityTypeConfiguration<ProductSupplier>
{
    public void Configure(EntityTypeBuilder<ProductSupplier> builder)
    {
        builder.ToTable("ProductSuppliers");
        builder.HasKey(ps => ps.Id);
        builder.Property(ps => ps.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value))
            .IsRequired();
        builder.Property(ps => ps.SupplierProductCode).HasMaxLength(64);
        builder.Property(ps => ps.Currency).HasMaxLength(32).IsRequired();
    }
}
