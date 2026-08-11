using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Customers.Models;
using MediatR;

namespace LealControl.Modules.Crm.Application.Customers.RegisterCustomer;

public sealed record RegisterCustomerCommand(CustomerWriteModel Model)
    : IRequest<Result<CustomerDetailDto>>;
