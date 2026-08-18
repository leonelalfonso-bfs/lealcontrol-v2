namespace LealControl.Modules.Directory.Contracts.Customers;

/// <summary>
/// Contrato neutral del dato maestro de clientes. CRM, Ventas y otros módulos
/// pueden consumirlo sin depender entre sí.
/// </summary>
public interface ICustomerDirectory
{
    Task<CustomerSummary?> FindAsync(Guid customerId, CancellationToken cancellationToken = default);
    Task<bool> ExistsAsync(Guid customerId, CancellationToken cancellationToken = default);
}
