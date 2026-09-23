using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Orders;

public interface IOrderRepository
{
    Task<Order?> GetByIdAsync(OrderId id, CancellationToken cancellationToken = default);

    Task<Order?> GetByOrderNumberAsync(TenantId tenantId, string orderNumber, CancellationToken cancellationToken = default);

    Task<Order?> GetByQuoteIdAsync(TenantId tenantId, Guid quoteId, CancellationToken cancellationToken = default);

    Task<Order?> GetOpenByQuoteIdAsync(TenantId tenantId, Guid quoteId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<Order>> ListAsync(TenantId tenantId, string? search = null, OrderStatus? status = null, CancellationToken cancellationToken = default);

    Task<int> GetCountAsync(TenantId tenantId, CancellationToken cancellationToken = default);

    Task AddAsync(Order order, CancellationToken cancellationToken = default);

    void Update(Order order);
}
