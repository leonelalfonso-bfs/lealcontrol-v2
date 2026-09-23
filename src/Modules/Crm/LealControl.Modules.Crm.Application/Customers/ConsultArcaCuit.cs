using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Crm.Application.Customers;

public sealed record ArcaCuitLookupResult(
    string Cuit,
    string LegalName,
    string? TradeName,
    string TaxCondition,
    string? FiscalStreet,
    string? FiscalCity,
    string? FiscalProvince,
    string? FiscalPostalCode,
    bool IsActive);

public sealed record ConsultArcaCuitQuery(string Cuit) : IRequest<Result<ArcaCuitLookupResult>>;
