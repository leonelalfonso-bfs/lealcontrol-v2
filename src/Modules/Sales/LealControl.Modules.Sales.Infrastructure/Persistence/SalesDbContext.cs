using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Domain.Purchases;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Domain.Production;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence;

public sealed class SalesDbContext : DbContext, ISalesUnitOfWork
{
    public const string Schema = "sales";

    public SalesDbContext(DbContextOptions<SalesDbContext> options)
        : base(options)
    {
    }

    public DbSet<Quote> Quotes => Set<Quote>();

    public DbSet<Order> Orders => Set<Order>();

    public DbSet<Product> Products => Set<Product>();
    public DbSet<ProductionBom> ProductionBoms => Set<ProductionBom>();
    public DbSet<ProductionBomLine> ProductionBomLines => Set<ProductionBomLine>();
    public DbSet<ProductionOrder> ProductionOrders => Set<ProductionOrder>();
    public DbSet<ProductionWorkCenter> ProductionWorkCenters => Set<ProductionWorkCenter>();
    public DbSet<ProductionRoute> ProductionRoutes => Set<ProductionRoute>();
    public DbSet<ProductionOperation> ProductionOperations => Set<ProductionOperation>();
    public DbSet<ProductionExecutionEntry> ProductionExecutionEntries => Set<ProductionExecutionEntry>();
    public DbSet<ProductionVariant> ProductionVariants => Set<ProductionVariant>();

    public DbSet<ProductCategory> ProductCategories => Set<ProductCategory>();

    public DbSet<LealControl.Modules.Sales.Domain.Inventory.Warehouse> Warehouses => Set<LealControl.Modules.Sales.Domain.Inventory.Warehouse>();

    public DbSet<LealControl.Modules.Sales.Domain.Inventory.StockItem> StockItems => Set<LealControl.Modules.Sales.Domain.Inventory.StockItem>();

    public DbSet<LealControl.Modules.Sales.Domain.Inventory.StockMovement> StockMovements => Set<LealControl.Modules.Sales.Domain.Inventory.StockMovement>();

    public DbSet<LealControl.Modules.Sales.Domain.Inventory.StockTransfer> StockTransfers => Set<LealControl.Modules.Sales.Domain.Inventory.StockTransfer>();

    public DbSet<LealControl.Modules.Sales.Domain.Inventory.StockTransferItem> StockTransferItems => Set<LealControl.Modules.Sales.Domain.Inventory.StockTransferItem>();

    public DbSet<LealControl.Modules.Sales.Domain.Inventory.ProductSupplier> ProductSuppliers => Set<LealControl.Modules.Sales.Domain.Inventory.ProductSupplier>();

    public DbSet<LealControl.Modules.Sales.Domain.Remitos.Remito> Remitos => Set<LealControl.Modules.Sales.Domain.Remitos.Remito>();

    public DbSet<LealControl.Modules.Sales.Domain.Invoices.Invoice> Invoices => Set<LealControl.Modules.Sales.Domain.Invoices.Invoice>();

    public DbSet<PurchaseOrder> PurchaseOrders => Set<PurchaseOrder>();

    public DbSet<PurchaseReception> PurchaseReceptions => Set<PurchaseReception>();

    public DbSet<PurchaseInvoice> PurchaseInvoices => Set<PurchaseInvoice>();

    public DbSet<PurchaseArcaVoucher> PurchaseArcaVouchers => Set<PurchaseArcaVoucher>();

    public DbSet<PurchaseRequest> PurchaseRequests => Set<PurchaseRequest>();

    public DbSet<PurchaseQuotation> PurchaseQuotations => Set<PurchaseQuotation>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(SalesDbContext).Assembly);
        modelBuilder.Entity<ProductionBom>(b => { b.ToTable("ProductionBoms"); b.HasKey(x => x.Id); b.Property(x => x.Version).HasMaxLength(40); b.Property(x => x.Name).HasMaxLength(160); b.Property(x => x.OutputQuantity).HasPrecision(18, 4); b.HasIndex(x => new { x.TenantId, x.ProductId, x.Version }).IsUnique(); b.HasMany(x => x.Lines).WithOne().HasForeignKey(x => x.ProductionBomId).OnDelete(DeleteBehavior.Cascade); });
        modelBuilder.Entity<ProductionBomLine>(b => { b.ToTable("ProductionBomLines"); b.HasKey(x => x.Id); b.Property(x => x.Quantity).HasPrecision(18, 4); b.Property(x => x.ScrapPercent).HasPrecision(8, 4); b.Property(x => x.Unit).HasMaxLength(20); b.Property(x => x.AppliesToVariant).HasMaxLength(160); });
        modelBuilder.Entity<ProductionOrder>(b => { b.ToTable("ProductionOrders"); b.HasKey(x => x.Id); b.Property(x => x.Number).HasMaxLength(50); b.Property(x => x.PlannedQuantity).HasPrecision(18, 4); b.Property(x => x.ProducedQuantity).HasPrecision(18, 4); b.Property(x => x.ScrappedQuantity).HasPrecision(18, 4); b.Property(x => x.Unit).HasMaxLength(20); b.Property(x => x.Notes).HasMaxLength(1000); b.HasIndex(x => new { x.TenantId, x.Number }).IsUnique(); });
        modelBuilder.Entity<ProductionWorkCenter>(b => { b.ToTable("ProductionWorkCenters"); b.HasKey(x => x.Id); b.Property(x => x.Code).HasMaxLength(40); b.Property(x => x.Name).HasMaxLength(160); b.Property(x => x.Description).HasMaxLength(500); b.Property(x => x.CapacityHoursPerDay).HasPrecision(8, 2); b.HasIndex(x => new { x.TenantId, x.Code }).IsUnique(); });
        modelBuilder.Entity<ProductionRoute>(b => { b.ToTable("ProductionRoutes"); b.HasKey(x => x.Id); b.Property(x => x.Version).HasMaxLength(40); b.Property(x => x.Name).HasMaxLength(160); b.HasIndex(x => new { x.TenantId, x.ProductId, x.Version }).IsUnique(); b.HasMany(x => x.Operations).WithOne().HasForeignKey(x => x.ProductionRouteId).OnDelete(DeleteBehavior.Cascade); });
        modelBuilder.Entity<ProductionOperation>(b => { b.ToTable("ProductionOperations"); b.HasKey(x => x.Id); b.Property(x => x.Code).HasMaxLength(40); b.Property(x => x.Name).HasMaxLength(160); b.Property(x => x.SetupMinutes).HasPrecision(10, 2); b.Property(x => x.RunMinutesPerUnit).HasPrecision(10, 4); });
        modelBuilder.Entity<ProductionExecutionEntry>(b => { b.ToTable("ProductionExecutionEntries"); b.HasKey(x => x.Id); b.Property(x => x.Quantity).HasPrecision(18, 4); b.Property(x => x.Unit).HasMaxLength(20); b.Property(x => x.LotNumber).HasMaxLength(120); b.Property(x => x.SerialNumbers).HasMaxLength(2000); b.Property(x => x.Notes).HasMaxLength(1000); });
        modelBuilder.Entity<ProductionVariant>(b => { b.ToTable("ProductionVariants"); b.HasKey(x => x.Id); b.Property(x => x.Code).HasMaxLength(80); b.Property(x => x.Name).HasMaxLength(160); b.Property(x => x.AttributesJson).HasMaxLength(2000); b.HasIndex(x => new { x.TenantId, x.ProductId, x.Code }).IsUnique(); });
    }

    public async Task EnsureTablesCreatedAsync(CancellationToken cancellationToken = default)
    {
        var sql = @"
            CREATE SCHEMA IF NOT EXISTS sales;

            CREATE TABLE IF NOT EXISTS sales.""Warehouses"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""Code"" character varying(50) NOT NULL,
                ""Name"" character varying(200) NOT NULL,
                ""Type"" integer NOT NULL,
                ""Address"" character varying(500),
                ""AssignedTechnicianName"" character varying(200),
                ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sales.""StockItems"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""ProductId"" uuid NOT NULL,
                ""WarehouseId"" uuid,
                ""WarehouseName"" character varying(200),
                ""PhysicalStock"" numeric(18,4) NOT NULL DEFAULT 0,
                ""ReservedStock"" numeric(18,4) NOT NULL DEFAULT 0,
                ""IncomingStock"" numeric(18,4) NOT NULL DEFAULT 0,
                ""MinimumStock"" numeric(18,4) NOT NULL DEFAULT 0,
                ""ReorderPoint"" numeric(18,4) NOT NULL DEFAULT 0,
                ""WarehouseLocation"" character varying(200),
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sales.""StockMovements"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""ProductId"" uuid NOT NULL,
                ""WarehouseId"" uuid,
                ""WarehouseName"" character varying(200),
                ""MovementType"" character varying(100) NOT NULL,
                ""Quantity"" numeric(18,4) NOT NULL,
                ""PreviousPhysicalStock"" numeric(18,4) NOT NULL,
                ""NewPhysicalStock"" numeric(18,4) NOT NULL,
                ""UnitCostArs"" numeric(18,4),
                ""UnitCostUsd"" numeric(18,4),
                ""SerialNumbers"" character varying(1000),
                ""LotNumber"" character varying(200),
                ""ReferenceId"" uuid,
                ""ReferenceType"" character varying(100),
                ""ReferenceNumber"" character varying(100),
                ""OperatorName"" character varying(200),
                ""Notes"" character varying(1000),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sales.""StockTransfers"" (
                ""Id"" uuid PRIMARY KEY,
                ""TenantId"" uuid NOT NULL,
                ""TransferNumber"" character varying(50) NOT NULL,
                ""OriginWarehouseId"" uuid NOT NULL,
                ""OriginWarehouseName"" character varying(200) NOT NULL,
                ""DestinationWarehouseId"" uuid NOT NULL,
                ""DestinationWarehouseName"" character varying(200) NOT NULL,
                ""Status"" integer NOT NULL,
                ""OperatorName"" character varying(200),
                ""DispatchedAtUtc"" timestamp with time zone,
                ""ReceivedAtUtc"" timestamp with time zone,
                ""Notes"" character varying(1000),
                ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sales.""StockTransferItems"" (
                ""Id"" uuid PRIMARY KEY,
                ""StockTransferId"" uuid NOT NULL REFERENCES sales.""StockTransfers""(""Id"") ON DELETE CASCADE,
                ""ProductId"" uuid NOT NULL,
                ""ProductCode"" character varying(100) NOT NULL,
                ""ProductName"" character varying(200) NOT NULL,
                ""Quantity"" numeric(18,4) NOT NULL,
                ""SerialNumbers"" character varying(1000),
                ""LotNumber"" character varying(200)
            );

            ALTER TABLE sales.""StockItems"" ADD COLUMN IF NOT EXISTS ""WarehouseId"" uuid;
            ALTER TABLE sales.""StockItems"" ADD COLUMN IF NOT EXISTS ""WarehouseName"" character varying(200);
            ALTER TABLE sales.""StockItems"" ADD COLUMN IF NOT EXISTS ""IncomingStock"" numeric(18,4) NOT NULL DEFAULT 0;

            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""WarehouseId"" uuid;
            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""WarehouseName"" character varying(200);
            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""UnitCostArs"" numeric(18,4);
            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""UnitCostUsd"" numeric(18,4);
            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""SerialNumbers"" character varying(1000);
            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""LotNumber"" character varying(200);
            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""ReferenceNumber"" character varying(100);
            ALTER TABLE sales.""StockMovements"" ADD COLUMN IF NOT EXISTS ""OperatorName"" character varying(200);

            CREATE TABLE IF NOT EXISTS sales.""ProductionBoms"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""ProductId"" uuid NOT NULL,
                ""Version"" character varying(40) NOT NULL, ""Name"" character varying(160) NOT NULL,
                ""Description"" character varying(1000), ""OutputQuantity"" numeric(18,4) NOT NULL DEFAULT 1,
                ""OutputUnit"" character varying(20) NOT NULL, ""IsActive"" boolean NOT NULL DEFAULT true,
                ""ValidFromUtc"" timestamp with time zone, ""ValidToUtc"" timestamp with time zone,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL, ""UpdatedAtUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""UX_ProductionBoms_Tenant_Product_Version"" UNIQUE (""TenantId"", ""ProductId"", ""Version"")
            );
            CREATE TABLE IF NOT EXISTS sales.""ProductionBomLines"" (
                ""Id"" uuid PRIMARY KEY, ""ProductionBomId"" uuid NOT NULL REFERENCES sales.""ProductionBoms""(""Id"") ON DELETE CASCADE,
                ""ComponentProductId"" uuid NOT NULL, ""SubstituteProductId"" uuid, ""Quantity"" numeric(18,4) NOT NULL, ""Unit"" character varying(20) NOT NULL,
                ""ScrapPercent"" numeric(8,4) NOT NULL DEFAULT 0, ""AppliesToVariant"" character varying(160),
                ""IsOptional"" boolean NOT NULL DEFAULT false, ""SortOrder"" integer NOT NULL DEFAULT 0
            );
            ALTER TABLE sales.""ProductionBomLines"" ADD COLUMN IF NOT EXISTS ""SubstituteProductId"" uuid;
            CREATE TABLE IF NOT EXISTS sales.""ProductionOrders"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Number"" character varying(50) NOT NULL,
                ""ProductId"" uuid NOT NULL, ""BomId"" uuid, ""PlannedQuantity"" numeric(18,4) NOT NULL,
                ""ProducedQuantity"" numeric(18,4) NOT NULL DEFAULT 0, ""ScrappedQuantity"" numeric(18,4) NOT NULL DEFAULT 0,
                ""Unit"" character varying(20) NOT NULL, ""Status"" integer NOT NULL DEFAULT 0,
                ""PlannedStartUtc"" timestamp with time zone, ""PlannedEndUtc"" timestamp with time zone,
                ""StartedAtUtc"" timestamp with time zone, ""CompletedAtUtc"" timestamp with time zone,
                ""Notes"" character varying(1000), ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""UX_ProductionOrders_Tenant_Number"" UNIQUE (""TenantId"", ""Number"")
            );
            CREATE TABLE IF NOT EXISTS sales.""ProductionWorkCenters"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""Code"" character varying(40) NOT NULL,
                ""Name"" character varying(160) NOT NULL, ""Description"" character varying(500),
                ""CapacityHoursPerDay"" numeric(8,2) NOT NULL DEFAULT 8, ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL, ""UpdatedAtUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""UX_ProductionWorkCenters_Tenant_Code"" UNIQUE (""TenantId"", ""Code"")
            );
            CREATE TABLE IF NOT EXISTS sales.""ProductionRoutes"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""ProductId"" uuid NOT NULL,
                ""Version"" character varying(40) NOT NULL, ""Name"" character varying(160) NOT NULL,
                ""IsActive"" boolean NOT NULL DEFAULT true, ""CreatedAtUtc"" timestamp with time zone NOT NULL,
                ""UpdatedAtUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""UX_ProductionRoutes_Tenant_Product_Version"" UNIQUE (""TenantId"", ""ProductId"", ""Version"")
            );
            CREATE TABLE IF NOT EXISTS sales.""ProductionOperations"" (
                ""Id"" uuid PRIMARY KEY, ""ProductionRouteId"" uuid NOT NULL REFERENCES sales.""ProductionRoutes""(""Id"") ON DELETE CASCADE,
                ""WorkCenterId"" uuid NOT NULL, ""Sequence"" integer NOT NULL, ""Code"" character varying(40) NOT NULL,
                ""Name"" character varying(160) NOT NULL, ""SetupMinutes"" numeric(10,2) NOT NULL DEFAULT 0,
                ""RunMinutesPerUnit"" numeric(10,4) NOT NULL DEFAULT 0, ""IsQualityCheckpoint"" boolean NOT NULL DEFAULT false
            );
            CREATE TABLE IF NOT EXISTS sales.""ProductionExecutionEntries"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""ProductionOrderId"" uuid NOT NULL,
                ""ProductId"" uuid NOT NULL, ""Quantity"" numeric(18,4) NOT NULL, ""Unit"" character varying(20) NOT NULL,
                ""Type"" integer NOT NULL, ""LotNumber"" character varying(120), ""SerialNumbers"" character varying(2000),
                ""Notes"" character varying(1000), ""CreatedAtUtc"" timestamp with time zone NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sales.""ProductionVariants"" (
                ""Id"" uuid PRIMARY KEY, ""TenantId"" uuid NOT NULL, ""ProductId"" uuid NOT NULL,
                ""Code"" character varying(80) NOT NULL, ""Name"" character varying(160) NOT NULL,
                ""AttributesJson"" character varying(2000), ""IsActive"" boolean NOT NULL DEFAULT true,
                ""CreatedAtUtc"" timestamp with time zone NOT NULL, ""UpdatedAtUtc"" timestamp with time zone NOT NULL,
                CONSTRAINT ""UX_ProductionVariants_Tenant_Product_Code"" UNIQUE (""TenantId"", ""ProductId"", ""Code"")
            );
        ";

        await Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }
}
