namespace LealControl.Modules.Sales.Domain.Orders;

public enum OrderStatus
{
    Draft,
    Confirmed,
    InPreparation,
    Dispatched,
    Delivered,
    Invoiced,
    Cancelled
}
