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
    string? DefaultPaymentTerms,
    bool HasArcaCertificateCrt = false,
    bool HasArcaCertificateKey = false,
    int? ArcaPointOfSale = null);

public sealed record UpdateCompanySettingsCommand(CompanySettingsDto Model)
    : IRequest<Result<CompanySettingsDto>>;

/// <summary>Plantillas de documentos de la empresa (JSON del frontend); null si nunca se guardaron.</summary>
public sealed record GetDocumentTemplatesQuery : IRequest<Result<string?>>;

public sealed record SaveDocumentTemplatesCommand(string Json) : IRequest<Result<string?>>;

public sealed record UploadArcaCertificateCommand(string? CertificateCrt, string? CertificateKey, string Environment, string SignerCuit)
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
    bool IsTechnicalDirector = false,
    Guid? ProfileId = null,
    string? ProfileName = null,
    LealControl.Modules.Crm.Domain.Settings.PermissionOverrides? Overrides = null,
    IReadOnlyDictionary<string, LealControl.Modules.Crm.Domain.Settings.PermissionLevel>? EffectiveModules = null,
    LealControl.Modules.Crm.Domain.Settings.SensitivePermissions? EffectiveSensitive = null);

/// <summary>
/// Alta de usuario. Con <paramref name="ProfileId"/> los módulos y el rol salen del perfil y las
/// excepciones; sin perfil se usa el de fábrica que corresponde al rol.
/// </summary>
public sealed record CreateTenantUserCommand(string FullName, string Email, string Role, string? Password = null, string? AllowedModulesJson = null, bool IsTechnicalDirector = false,
    Guid? ProfileId = null, LealControl.Modules.Crm.Domain.Settings.PermissionOverrides? Overrides = null)
    : IRequest<Result<TenantUserDto>>;

public sealed record UpdateTenantUserCommand(Guid Id, string FullName, string Role, bool IsActive, string? Password = null, string? AllowedModulesJson = null, bool? IsTechnicalDirector = null,
    Guid? ProfileId = null, LealControl.Modules.Crm.Domain.Settings.PermissionOverrides? Overrides = null)
    : IRequest<Result<TenantUserDto>>;

public sealed record PermissionModuleDto(string Key, string Label, string Description);

public sealed record PermissionCatalogDto(IReadOnlyList<PermissionModuleDto> Modules);

public sealed record PermissionProfileDto(
    Guid Id,
    string Name,
    string? Description,
    string? SystemKey,
    bool IsLocked,
    IReadOnlyDictionary<string, LealControl.Modules.Crm.Domain.Settings.PermissionLevel> Matrix,
    bool SeeAmounts,
    bool SeeCosts,
    bool SeeSalaries,
    int UserCount);

public sealed record ListPermissionProfilesQuery : IRequest<Result<IReadOnlyList<PermissionProfileDto>>>;

/// <summary>Crea (sin Id) o edita un perfil. Al crear, <paramref name="CopyFromId"/> hereda el rol base de ese perfil.</summary>
public sealed record SavePermissionProfileCommand(
    Guid? Id,
    string Name,
    string? Description,
    Dictionary<string, LealControl.Modules.Crm.Domain.Settings.PermissionLevel> Matrix,
    bool SeeAmounts,
    bool SeeCosts,
    bool SeeSalaries,
    Guid? CopyFromId = null) : IRequest<Result<PermissionProfileDto>>;

public sealed record DeletePermissionProfileCommand(Guid Id) : IRequest<Result<bool>>;

public sealed record DeleteTenantUserCommand(Guid Id) : IRequest<Result<bool>>;

public sealed record GetCompanySettingsQuery : IRequest<Result<CompanySettingsDto>>;

public sealed record ListTenantUsersQuery : IRequest<Result<IReadOnlyList<TenantUserDto>>>;
