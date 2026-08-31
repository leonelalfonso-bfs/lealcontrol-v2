using System;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Infrastructure;
using LealControl.Modules.Finance.Infrastructure;
using LealControl.Modules.Sales.Domain.Inventory;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.QA.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace LealControl.QA.Factories;

public static class TestDataFactory
{
    private static int _customerCounter = 0;
    private static int _productCounter = 0;
    private static int _warehouseCounter = 0;

    public sealed record CreatedCustomer(Guid Id, string LegalName, string DocumentNumber);
    public sealed record CreatedProduct(Guid Id, string Code, string Name, decimal InitialStock, decimal UnitPrice, decimal CostPrice, decimal VatRate);
    public sealed record CreatedWarehouse(Guid Id, string Code, string Name);
    public sealed record CreatedFinancialAccount(Guid Id, string Name, string Currency);

        public static string GenerateValidCuit(int seed)
    {
        var baseDigits = $"3071{seed:D6}";
        int[] multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        var sum = 0;
        for (var i = 0; i < 10; i++)
        {
            sum += (baseDigits[i] - '0') * multipliers[i];
        }
        var remainder = sum % 11;
        var check = 11 - remainder;
        if (check == 11) check = 0;
        else if (check == 10) check = 9;
        return baseDigits + check;
    }

    public static async Task<CreatedCustomer> CreateCustomerAsync(QaTestContext context, string? prefix = null)
    {
        var num = Interlocked.Increment(ref _customerCounter);
        var cuit = GenerateValidCuit(num);
        var legalName = $"{prefix ?? "QA-CUSTOMER"}-{num:D4} S.A.";

        var payload = new
        {
            legalName,
            tradeName = legalName,
            documentType = "Cuit",
            documentNumber = cuit,
            taxCondition = "ResponsableInscripto",
            iibbRegime = "Local",
            isCustomer = true,
            isSupplier = false,
            email = $"qa-cust-{num}@lealcontrol.test",
            phone = "3415550000",
            fiscalStreet = "Calle Falsa 123",
            fiscalCity = "Rosario",
            fiscalProvince = "SantaFe",
            fiscalPostalCode = "2000"
        };

        var res = await context.HttpClient.PostAsJsonAsync("/api/v1/crm/customers", payload);
        res.EnsureSuccessStatusCode();

        var body = await res.Content.ReadFromJsonAsync<CreatedCustomer>();
        return body!;
    }

    public static async Task<CreatedProduct> CreateProductAsync(
        QaTestContext context,
        decimal initialStock = 100m,
        decimal unitPrice = 10000m,
        decimal costPrice = 6000m,
        decimal vatRate = 21m,
        string? namePrefix = null)
    {
        var num = Interlocked.Increment(ref _productCounter);
        var code = $"QA-PROD-{num:D4}";
        var name = $"{namePrefix ?? "Producto QA"} #{num:D4}";

        var salesDb = context.GetService<SalesDbContext>();
        var tenantId = context.TenantId;

        var product = Product.Create(
            tenantId,
            code,
            name,
            "Producto creado para QA Test Center",
            null,
            ProductType.Product,
            null,
            null,
            CurrencyCode.ARS,
            unitPrice,
            CurrencyCode.ARS,
            costPrice,
            vatRate,
            null,
            null,
            trackStock: true,
            stock: initialStock,
            minStock: 10m).Value;

        salesDb.Products.Add(product);

        // Ensure central warehouse and initial stock
        var warehouse = await salesDb.Warehouses
            .FirstOrDefaultAsync(w => w.TenantId == tenantId && w.Type == WarehouseType.MainWarehouse);

        if (warehouse == null)
        {
            var wNum = Interlocked.Increment(ref _warehouseCounter);
            warehouse = new Warehouse(
                Guid.NewGuid(),
                tenantId,
                $"DEP-{wNum:D2}",
                "Depósito Central QA",
                WarehouseType.MainWarehouse,
                "Av. Central 100",
                "Encargado QA",
                true,
                DateTime.UtcNow);
            salesDb.Warehouses.Add(warehouse);
        }

        var stockItem = StockItem.Create(
            tenantId,
            product.Id.Value,
            initialStock,
            10m,
            warehouse.Name,
            warehouse.Id,
            warehouse.Name);

        salesDb.StockItems.Add(stockItem);

        salesDb.StockMovements.Add(StockMovement.Create(
            tenantId,
            product.Id.Value,
            "InitialStockQA",
            initialStock,
            0m,
            initialStock,
            warehouse.Id,
            warehouse.Name,
            null,
            null,
            null,
            null,
            Guid.NewGuid(),
            "InitialSetup",
            "INI-001",
            "Carga Inicial QA",
            "Stock inicial para QA Test Center"));

        await salesDb.SaveChangesAsync();

        return new CreatedProduct(product.Id.Value, code, name, initialStock, unitPrice, costPrice, vatRate);
    }

    public static async Task<CreatedFinancialAccount> CreateCashAccountAsync(QaTestContext context, string? name = null)
    {
        var financeDb = context.GetService<FinanceDbContext>();
        var tenantId = context.TenantId.Value;

        var accName = name ?? "Caja Central QA Efectivo";
        var existing = await financeDb.Accounts.FirstOrDefaultAsync(a => a.TenantId == tenantId && a.Name == accName);
        if (existing != null)
        {
            return new CreatedFinancialAccount(existing.Id, existing.Name, existing.Currency);
        }

        var accId = Guid.NewGuid();
        var account = new FinancialAccount
        {
            Id = accId,
            TenantId = tenantId,
            Name = accName,
            Currency = "ARS",
            Type = FinancialAccountType.Cash,
            OpeningBalance = 0m,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow
        };

        financeDb.Accounts.Add(account);
        await financeDb.SaveChangesAsync();

        return new CreatedFinancialAccount(accId, accName, "ARS");
    }

    public static async Task InitializeAccountingAsync(QaTestContext context)
    {
        var accountingDb = context.GetService<AccountingDbContext>();
        await accountingDb.EnsureAccountingTablesAsync();
        await accountingDb.SeedDefaultChartOfAccountsAsync(context.TenantId);
    }
}

