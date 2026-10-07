using LealControl.BuildingBlocks.Persistence;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Domain.Orders;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Sales.Infrastructure.Persistence.Repositories;

internal sealed class OrderRepository : IOrderRepository
{
    private readonly SalesDbContext _dbContext;

    public OrderRepository(SalesDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Order?> GetByIdAsync(OrderId id, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Orders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
    }

    public async Task<Order?> GetByOrderNumberAsync(TenantId tenantId, string orderNumber, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Orders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.OrderNumber == orderNumber, cancellationToken);
    }

    public async Task<Order?> GetByQuoteIdAsync(TenantId tenantId, Guid quoteId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Orders
            .Include(o => o.Lines)
            .FirstOrDefaultAsync(o => o.TenantId == tenantId && o.QuoteId == quoteId, cancellationToken);
    }

    public async Task<Order?> GetOpenByQuoteIdAsync(TenantId tenantId, Guid quoteId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Orders
            .Include(o => o.Lines)
            .Where(o => o.TenantId == tenantId && o.QuoteId == quoteId && o.Status != OrderStatus.Cancelled)
            .OrderByDescending(o => o.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, string? search = null, OrderStatus? status = null, CancellationToken cancellationToken = default)
    {
        var query = _dbContext.Orders
            .Include(o => o.Lines)
            .Where(o => o.TenantId == tenantId);

        if (status.HasValue)
        {
            query = query.Where(o => o.Status == status.Value);
        }

        foreach (var token in SearchText.Parse(search))
        {
            var text = token.Text;
            query = query.Where(o => SearchText.Fold(o.OrderNumber).Contains(text)
                                  || (o.QuoteNumber != null && SearchText.Fold(o.QuoteNumber).Contains(text))
                                  || (o.OwnerName != null && SearchText.Fold(o.OwnerName).Contains(text))
                                  || (o.Notes != null && SearchText.Fold(o.Notes).Contains(text)));
        }

        return await query
            .OrderByDescending(o => o.CreatedAtUtc)
            .ToListAsync(cancellationToken);
    }

    public async Task<int> GetCountAsync(TenantId tenantId, CancellationToken cancellationToken = default)
    {
        return await _dbContext.Orders
            .CountAsync(o => o.TenantId == tenantId, cancellationToken);
    }

    public async Task AddAsync(Order order, CancellationToken cancellationToken = default)
    {
        await _dbContext.Orders.AddAsync(order, cancellationToken);
    }

    public void Update(Order order)
    {
        _dbContext.Orders.Update(order);
    }
}
