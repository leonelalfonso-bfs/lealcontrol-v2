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
        services.AddSalesApplication();
        services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(typeof(DependencyInjection).Assembly));

        services.AddTenantDbContext<SalesDbContext>(SalesDbContext.Schema);

        services.AddScoped<ISalesUnitOfWork>(sp => sp.GetRequiredService<SalesDbContext>());
        services.AddScoped<IQuoteRepository, QuoteRepository>();
        services.AddScoped<IOrderRepository, OrderRepository>();
        services.AddScoped<IProductRepository, ProductRepository>();
        services.AddScoped<IProductCategoryRepository, ProductCategoryRepository>();
        services.AddHttpClient<IExchangeRateService, ExchangeRateService>();
        return services;
    }
}
