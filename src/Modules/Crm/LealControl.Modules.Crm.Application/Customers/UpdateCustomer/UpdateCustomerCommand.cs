using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Customers.Models;
using MediatR;

namespace LealControl.Modules.Crm.Application.Customers.UpdateCustomer;

public sealed record UpdateCustomerCommand(Guid CustomerId, CustomerWriteModel Model)
    : IRequest<Result<CustomerDetailDto>>;
