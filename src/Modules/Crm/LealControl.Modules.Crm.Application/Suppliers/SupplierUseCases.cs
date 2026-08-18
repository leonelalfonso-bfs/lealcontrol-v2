using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Crm.Application.Suppliers;

public sealed record SupplierDto(
    Guid Id,
    string LegalName,
    string? TradeName,
    string DocumentType,
    string DocumentNumber,
    string TaxCondition,
    string? Email,
    string? Phone,
    string? ContactName,
    string? FiscalStreet,
    string? FiscalCity,
    string? FiscalProvince,
    string? FiscalPostalCode,
    int? PaymentTermsDays,
    string? Notes,
    DateTime CreatedAtUtc);

public sealed record SupplierWriteDto(
    string LegalName,
    string? TradeName,
    string DocumentType,
    string DocumentNumber,
    string TaxCondition,
    string? Email,
    string? Phone,
    string? ContactName,
    string? FiscalStreet,
    string? FiscalCity,
    string? FiscalProvince,
    string? FiscalPostalCode,
    int? PaymentTermsDays,
    string? Notes);

public sealed record CreateSupplierCommand(SupplierWriteDto Model) : IRequest<Result<SupplierDto>>;

public sealed record UpdateSupplierCommand(Guid Id, SupplierWriteDto Model) : IRequest<Result<SupplierDto>>;

public sealed record DeleteSupplierCommand(Guid Id) : IRequest<Result<bool>>;

public sealed record ListSuppliersQuery(string? Search) : IRequest<Result<IReadOnlyList<SupplierDto>>>;

public sealed record GetSupplierByIdQuery(Guid Id) : IRequest<Result<SupplierDto>>;
