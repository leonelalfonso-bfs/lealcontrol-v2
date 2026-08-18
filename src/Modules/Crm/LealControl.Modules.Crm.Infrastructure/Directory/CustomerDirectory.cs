using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Directory.Contracts.Customers;
using LealControl.Modules.Crm.Domain.Customers;

namespace LealControl.Modules.Crm.Infrastructure.Directory;

internal sealed class CustomerDirectory : ICustomerDirectory
{
    private readonly ICustomerRepository _customers;

    public CustomerDirectory(ICustomerRepository customers) => _customers = customers;

    public async Task<CustomerSummary?> FindAsync(Guid customerId, CancellationToken cancellationToken = default)
    {
        var customer = await _customers.GetByIdAsync(new CustomerId(customerId), cancellationToken);
        if (customer is null || customer.IsDeleted)
        {
            return null;
        }

        return new CustomerSummary(
            customer.Id.Value,
            customer.LegalName,
            customer.TradeName,
            customer.Document.Type.ToString(),
            customer.Document.Number,
            customer.TaxCondition.ToString(),
            customer.Status.ToString(),
            customer.IsCustomer,
            customer.IsSupplier,
            customer.Email?.Value,
            customer.Phone?.Value);
    }

    public async Task<bool> ExistsAsync(Guid customerId, CancellationToken cancellationToken = default) =>
        await FindAsync(customerId, cancellationToken) is not null;
}
