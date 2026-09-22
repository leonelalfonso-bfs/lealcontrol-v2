using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Crm.Application.Settings;

public sealed record CompanySettingsDto(
    Guid TenantId,
    string LegalName,
    string? TradeName,
    string DocumentType,
    string DocumentNumber,
    string TaxCondition,
    string IibbRegime,
    string? IibbNumber,
    string? ActivityStartDate,
    string? Email,
    string? Phone,
    string? WhatsApp,
    string? Website,
    string? FiscalStreet,
    string? FiscalCity,
    string? FiscalProvince,
    string? FiscalPostalCode,
    string? LogoUrl,
    string? ArcaCertificateCrt,
    string? ArcaCertificateKey,
    string ArcaEnvironment,
    string? ArcaSignerCuit,
    string? BankName,
    string? BankCbu,
    string? BankAlias,
    int DefaultQuoteValidDays,
    int DefaultDeliveryDays,
    string? DefaultWarranty,
    string? DefaultPaymentTerms);

public sealed record UpdateCompanySettingsCommand(CompanySettingsDto Model)
    : IRequest<Result<CompanySettingsDto>>;

public sealed record UploadArcaCertificateCommand(string CertificateCrt, string CertificateKey, string Environment, string SignerCuit)
    : IRequest<Result<CompanySettingsDto>>;

/// <summary>
/// Genera clave RSA 2048 + CSR (archivo de consulta / pedido) con el DN que exige ARCA/AFIP:
/// C=AR, O=…, CN=…, SERIALNUMBER="CUIT ###########"
/// </summary>
public sealed record GenerateArcaCsrCommand(
    string SignerCuit,
    string Environment,
    string? OrganizationName = null,
    string? CommonName = null)
    : IRequest<Result<ArcaCsrResultDto>>;

public sealed record ArcaCsrResultDto(
    string CsrPem,
    string PrivateKeyPem,
    string CsrFileName,
    string PrivateKeyFileName,
    CompanySettingsDto Settings);

public sealed record TenantUserDto(
    Guid Id,
    string FullName,
    string Email,
    string Role,
    bool IsActive,
    DateTime CreatedAtUtc,
    string? AllowedModulesJson = null,
    bool IsTechnicalDirector = false);

public sealed record CreateTenantUserCommand(string FullName, string Email, string Role, string? Password = null, string? AllowedModulesJson = null, bool IsTechnicalDirector = false)
    : IRequest<Result<TenantUserDto>>;

public sealed record UpdateTenantUserCommand(Guid Id, string FullName, string Role, bool IsActive, string? Password = null, string? AllowedModulesJson = null, bool? IsTechnicalDirector = null)
    : IRequest<Result<TenantUserDto>>;

public sealed record DeleteTenantUserCommand(Guid Id) : IRequest<Result<bool>>;

public sealed record GetCompanySettingsQuery : IRequest<Result<CompanySettingsDto>>;

public sealed record ListTenantUsersQuery : IRequest<Result<IReadOnlyList<TenantUserDto>>>;
