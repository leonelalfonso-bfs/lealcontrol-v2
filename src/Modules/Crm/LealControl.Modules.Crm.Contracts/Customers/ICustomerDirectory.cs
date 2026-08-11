namespace LealControl.Modules.Crm.Contracts.Customers;

/// <summary>
/// Contrato público del módulo CRM. Otros módulos solo pueden depender de esto.
/// </summary>
public interface ICustomerDirectory
{
    Task<CustomerSummary?> FindAsync(Guid customerId, CancellationToken cancellationToken = default);

    Task<bool> ExistsAsync(Guid customerId, CancellationToken cancellationToken = default);
}
