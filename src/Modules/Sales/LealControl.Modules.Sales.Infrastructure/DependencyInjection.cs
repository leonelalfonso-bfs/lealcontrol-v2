using LealControl.BuildingBlocks.Persistence;
using LealControl.Modules.Sales.Application;
using LealControl.Modules.Sales.Application.Abstractions;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.Modules.Sales.Infrastructure.Persistence.Repositories;
using LealControl.Modules.Sales.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.Sales.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddSalesModule(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<LealControl.BuildingBlocks.Notices.INoticeProvider, Notices.OverdueInvoiceNotices>();
        services.AddSingleton<LealControl.BuildingBlocks.Notices.INoticeProvider, Notices.ExpiringQuoteNotices>();
        services.AddSalesApplication();
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly));

        services.AddTenantDbContext<SalesDbContext>(SalesDbContext.Schema);

        services.AddScoped<ISalesUnitOfWork>(sp => sp.GetRequiredService<SalesDbContext>());
        services.AddSingleton(new LealControl.Modules.Sales.Infrastructure.Fiscal.FiscalEmissionPolicy(
            configuration.GetValue("Arca:AllowProductionAuthorization", false)));
        services.AddScoped<LealControl.Modules.Sales.Infrastructure.Fiscal.FiscalReservationService>();
        services.AddScoped<LealControl.Modules.Sales.Infrastructure.Fiscal.FiscalVoucherRecoveryService>();
        services.AddScoped<LealControl.Modules.Sales.Infrastructure.Fiscal.FiscalAuthorizationService>();
        services.AddScoped<LealControl.Modules.Accounting.Contracts.Posting.IAccountingDocumentSource, Accounting.SalesAccountingDocumentSource>();
        services.AddScoped<LealControl.Modules.Accounting.Contracts.VatBooks.IVatBookSource, Accounting.SalesVatBookSource>();
        services.AddScoped<LealControl.Modules.Accounting.Contracts.Inventory.IInventoryValuationSource, Accounting.SalesInventoryValuationSource>();
        services.AddScoped<IQuoteRepository, QuoteRepository>();
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<IProductCategoryRepository, ProductCategoryRepository>();
        services.AddHttpClient<IExchangeRateService, ExchangeRateService>();
        services.AddHostedService<ExchangeRateWarmup>();
        return services;
    }
}
