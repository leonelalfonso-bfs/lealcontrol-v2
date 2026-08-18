namespace LealControl.Modules.Directory.Contracts.Customers;

public sealed record CustomerSummary(
    Guid Id,
    string LegalName,
    string? TradeName,
    string DocumentType,
    string DocumentNumber,
    string TaxCondition,
    string Status,
    bool IsCustomer,
    bool IsSupplier,
    string? Email,
    string? Phone);
