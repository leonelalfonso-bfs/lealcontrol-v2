using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Application.Settings;
using LealControl.Modules.Crm.Domain.Settings;
using LealControl.Modules.Crm.Infrastructure.Arca;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

public sealed class CompanySettingsQueryHandler :
      IRequestHandler<GetCompanySettingsQuery, Result<CompanySettingsDto>>,
      IRequestHandler<UpdateCompanySettingsCommand, Result<CompanySettingsDto>>,
      IRequestHandler<UploadArcaCertificateCommand, Result<CompanySettingsDto>>,
      IRequestHandler<GenerateArcaCsrCommand, Result<ArcaCsrResultDto>>,
      IRequestHandler<GetDocumentTemplatesQuery, Result<string?>>,
      IRequestHandler<SaveDocumentTemplatesCommand, Result<string?>>,
      IRequestHandler<ListTenantUsersQuery, Result<IReadOnlyList<TenantUserDto>>>,
      IRequestHandler<CreateTenantUserCommand, Result<TenantUserDto>>,
      IRequestHandler<UpdateTenantUserCommand, Result<TenantUserDto>>,
      IRequestHandler<DeleteTenantUserCommand, Result<bool>>
{
    private readonly CrmDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public CompanySettingsQueryHandler(CrmDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public async Task<Result<CompanySettingsDto>> Handle(GetCompanySettingsQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var settings = await GetOrInitSettingsAsync(tenantId, cancellationToken);
        return Result<CompanySettingsDto>.Success(MapToDto(settings));
    }

    public async Task<Result<CompanySettingsDto>> Handle(UpdateCompanySettingsCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var settings = await GetOrInitSettingsAsync(tenantId, cancellationToken);
        var model = request.Model;

        settings.LegalName = model.LegalName;
        settings.TradeName = model.TradeName;
        settings.DocumentType = model.DocumentType;
        settings.DocumentNumber = model.DocumentNumber;
        settings.TaxCondition = model.TaxCondition;
        settings.IibbRegime = model.IibbRegime;
        settings.IibbNumber = model.IibbNumber;
        settings.ActivityStartDate = model.ActivityStartDate;
        settings.Email = model.Email;
        settings.Phone = model.Phone;
        settings.WhatsApp = model.WhatsApp;
        settings.Website = model.Website;
        settings.FiscalStreet = model.FiscalStreet;
        settings.FiscalCity = model.FiscalCity;
        settings.FiscalProvince = model.FiscalProvince;
        settings.FiscalPostalCode = model.FiscalPostalCode;
        settings.LogoUrl = model.LogoUrl;
        settings.ArcaEnvironment = model.ArcaEnvironment;
        settings.ArcaSignerCuit = model.ArcaSignerCuit;
        settings.ArcaPointOfSale = model.ArcaPointOfSale is >= 1 and <= 99998 ? model.ArcaPointOfSale : null;
        settings.BankName = model.BankName;
        settings.BankCbu = model.BankCbu;
        settings.BankAlias = model.BankAlias;
        settings.DefaultQuoteValidDays = model.DefaultQuoteValidDays;
        settings.DefaultDeliveryDays = model.DefaultDeliveryDays;
        settings.DefaultWarranty = model.DefaultWarranty;
        settings.DefaultPaymentTerms = model.DefaultPaymentTerms;
        settings.UpdatedAtUtc = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<CompanySettingsDto>.Success(MapToDto(settings));
    }

    public async Task<Result<string?>> Handle(GetDocumentTemplatesQuery request, CancellationToken cancellationToken)
    {
        var settings = await GetOrInitSettingsAsync(_tenantContext.TenantId, cancellationToken);
        return Result<string?>.Success(settings.DocumentTemplatesJson);
    }

    public async Task<Result<string?>> Handle(SaveDocumentTemplatesCommand request, CancellationToken cancellationToken)
    {
        if (request.Json.Length > MaxDocumentTemplatesLength)
            return Result<string?>.Failure(Error.Validation(
                "Crm.Settings.TemplatesTooLarge", "Las plantillas superan el tamaño permitido."));

        var settings = await GetOrInitSettingsAsync(_tenantContext.TenantId, cancellationToken);
        settings.DocumentTemplatesJson = request.Json;
        settings.UpdatedAtUtc = DateTime.UtcNow;
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<string?>.Success(settings.DocumentTemplatesJson);
    }

    private const int MaxDocumentTemplatesLength = 200_000;

    public async Task<Result<CompanySettingsDto>> Handle(UploadArcaCertificateCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var settings = await GetOrInitSettingsAsync(tenantId, cancellationToken);

        var certificatePem = string.IsNullOrWhiteSpace(request.CertificateCrt)
            ? settings.ArcaCertificateCrt
            : request.CertificateCrt;
        var privateKey = string.IsNullOrWhiteSpace(request.CertificateKey)
            ? settings.ArcaCertificateKey
            : request.CertificateKey;
        if (!ArcaCertificateLoader.TryLoad(certificatePem, privateKey, out var certificate, out var certificateError)
            || certificate is null)
        {
            return Result<CompanySettingsDto>.Failure(Error.Validation(
                "Crm.Arca.CertificateInvalid", certificateError ?? "El certificado y la clave privada no son válidos."));
        }
        using (certificate)
        {
            if (certificate.NotAfter.ToUniversalTime() <= DateTime.UtcNow)
                return Result<CompanySettingsDto>.Failure(Error.Validation(
                    "Crm.Arca.CertificateExpired", "El certificado de ARCA está vencido."));
        }

        settings.ArcaCertificateCrt = certificatePem;
        settings.ArcaCertificateKey = privateKey;
        settings.ArcaEnvironment = request.Environment;
        settings.ArcaSignerCuit = request.SignerCuit;
        settings.UpdatedAtUtc = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<CompanySettingsDto>.Success(MapToDto(settings));
    }

    public async Task<Result<ArcaCsrResultDto>> Handle(GenerateArcaCsrCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var settings = await GetOrInitSettingsAsync(tenantId, cancellationToken);

        var cuitDigits = new string((request.SignerCuit ?? string.Empty).Where(char.IsDigit).ToArray());
        if (cuitDigits.Length != 11)
        {
            return Result<ArcaCsrResultDto>.Failure(
                Error.Validation("Crm.Arca.InvalidCuit", "El CUIT del firmante debe contener exactamente 11 dígitos."));
        }

        var organization = SanitizeDnValue(
            string.IsNullOrWhiteSpace(request.OrganizationName)
                ? (settings.LegalName ?? "Empresa")
                : request.OrganizationName);
        var commonName = SanitizeDnValue(
            string.IsNullOrWhiteSpace(request.CommonName)
                ? "LealControl"
                : request.CommonName);

        if (string.IsNullOrWhiteSpace(organization) || string.IsNullOrWhiteSpace(commonName))
        {
            return Result<ArcaCsrResultDto>.Failure(
                Error.Validation("Crm.Arca.InvalidSubject", "La organización y el alias (CN) del certificado son obligatorios."));
        }

        string privateKeyPem;
        string csrPem;
        try
        {
            using var rsa = RSA.Create(2048);
            // DN oficial ARCA/AFIP: /C=AR/O=…/CN=…/serialNumber=CUIT ###########
            var dn = new X500DistinguishedName(
                $"C=AR, O={QuoteDn(organization)}, CN={QuoteDn(commonName)}, SERIALNUMBER=\"CUIT {cuitDigits}\"");
            var certificateRequest = new CertificateRequest(
                dn,
                rsa,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);

            var csrDer = certificateRequest.CreateSigningRequest();
            csrPem = ToPem("CERTIFICATE REQUEST", csrDer);
            privateKeyPem = rsa.ExportRSAPrivateKeyPem();
        }
        catch (Exception ex)
        {
            return Result<ArcaCsrResultDto>.Failure(
                Error.Failure("Crm.Arca.CsrGenerationFailed", $"No se pudo generar el archivo de consulta: {ex.Message}"));
        }

        var environment = string.IsNullOrWhiteSpace(request.Environment)
            ? settings.ArcaEnvironment
            : request.Environment.Trim();

        // Nueva clave ⇒ el CRT anterior ya no corresponde.
        settings.ArcaCertificateKey = privateKeyPem;
        settings.ArcaCertificateCrt = null;
        settings.ArcaSignerCuit = cuitDigits;
        settings.ArcaEnvironment = environment;
        settings.UpdatedAtUtc = DateTime.UtcNow;

        await _dbContext.SaveChangesAsync(cancellationToken);

        var fileBase = $"pedido_arca_{cuitDigits}";
        return Result<ArcaCsrResultDto>.Success(new ArcaCsrResultDto(
            csrPem,
            privateKeyPem,
            $"{fileBase}.csr",
            $"privada_arca_{cuitDigits}.key",
            MapToDto(settings)));
    }

    private static string SanitizeDnValue(string value)
    {
        var trimmed = value.Trim();
        // Evitar caracteres que rompen el DN o el alta en ARCA.
        var cleaned = new StringBuilder(trimmed.Length);
        foreach (var ch in trimmed)
        {
            if (ch is '<' or '>' or '\0' or '\r' or '\n')
                continue;
            cleaned.Append(ch);
        }
        return cleaned.ToString().Trim();
    }

    private static string QuoteDn(string value)
    {
        var escaped = value.Replace("\\", "\\\\", StringComparison.Ordinal).Replace("\"", "\\\"", StringComparison.Ordinal);
        return $"\"{escaped}\"";
    }

    private static string ToPem(string label, byte[] der)
    {
        var base64 = Convert.ToBase64String(der);
        var sb = new StringBuilder();
        sb.Append("-----BEGIN ").Append(label).AppendLine("-----");
        for (var i = 0; i < base64.Length; i += 64)
        {
            var len = Math.Min(64, base64.Length - i);
            sb.AppendLine(base64.Substring(i, len));
        }
        sb.Append("-----END ").Append(label).AppendLine("-----");
        return sb.ToString();
    }

    public async Task<Result<IReadOnlyList<TenantUserDto>>> Handle(ListTenantUsersQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var profiles = await PermissionProfilesBootstrap.EnsureSystemProfilesAsync(_dbContext, tenantId, cancellationToken);
        var users = await _dbContext.TenantUsers
            .AsNoTracking()
            .Where(u => u.TenantId == tenantId)
            .OrderBy(u => u.FullName)
            .ToListAsync(cancellationToken);

        IReadOnlyList<TenantUserDto> dtos = users.Select(u => ToDto(u, profiles)).ToList();
        return Result<IReadOnlyList<TenantUserDto>>.Success(dtos);
    }

    internal static TenantUserDto ToDto(TenantUser u, IReadOnlyCollection<PermissionProfile> profiles)
    {
        var profile = profiles.FirstOrDefault(p => p.Id == u.ProfileId);
        var effective = u.EffectivePermissions(profile);
        var overrides = PermissionCatalog.ReadOverrides(u.PermissionOverridesJson);
        return new TenantUserDto(u.Id, u.FullName, u.Email, u.Role, u.IsActive, u.CreatedAtUtc, u.AllowedModulesJson,
            u.IsTechnicalDirector, u.ProfileId, profile?.Name, overrides.IsEmpty ? null : overrides,
            effective.Modules, effective.Sensitive);
    }

    /// <summary>Siempre tiene que quedar al menos un usuario activo que administre la configuración.</summary>
    private async Task<bool> WouldLeaveNoAdministratorAsync(TenantId tenantId, Guid userId, bool stillAdmin, CancellationToken ct)
    {
        if (stillAdmin) return false;
        var profiles = await _dbContext.PermissionProfiles.AsNoTracking().Where(p => p.TenantId == tenantId).ToListAsync(ct);
        var others = await _dbContext.TenantUsers.AsNoTracking()
            .Where(u => u.TenantId == tenantId && u.IsActive && u.Id != userId).ToListAsync(ct);
        return !others.Any(u => u.EffectivePermissions(profiles.FirstOrDefault(p => p.Id == u.ProfileId))
            .LevelOf(PermissionCatalog.Administration) >= PermissionLevel.Admin);
    }

    private async Task<Result<PermissionProfile>> ResolveProfileAsync(TenantId tenantId, Guid? profileId, string role, CancellationToken ct)
    {
        var profiles = await PermissionProfilesBootstrap.EnsureSystemProfilesAsync(_dbContext, tenantId, ct);
        if (profileId is { } id)
        {
            var chosen = profiles.FirstOrDefault(p => p.Id == id);
            return chosen is null
                ? Result<PermissionProfile>.Failure(Error.Validation("Crm.Permissions.ProfileNotFound", "El perfil elegido no existe."))
                : Result<PermissionProfile>.Success(chosen);
        }
        var key = SystemProfiles.ForLegacyRole(role);
        return Result<PermissionProfile>.Success(profiles.First(p => p.SystemKey == key));
    }

    public async Task<Result<TenantUserDto>> Handle(CreateTenantUserCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var profile = await ResolveProfileAsync(tenantId, request.ProfileId, request.Role, cancellationToken);
        if (!profile.IsSuccess) return Result<TenantUserDto>.Failure(profile.Error);

        var user = TenantUser.Create(tenantId, request.FullName, request.Email, request.Role, initialPassword: request.Password, allowedModulesJson: request.AllowedModulesJson);
        if (request.IsTechnicalDirector)
        {
            user.SetTechnicalDirector(true);
        }
        // Sin perfil explícito se respeta la lista de módulos que llegó (compatibilidad).
        user.ApplyPermissions(profile.Value, request.ProfileId is null
            ? PermissionProfilesBootstrap.OverridesPreservingModules(profile.Value, request.AllowedModulesJson)
            : request.Overrides);

        _dbContext.TenantUsers.Add(user);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<TenantUserDto>.Success(ToDto(user, [profile.Value]));
    }

    public async Task<Result<TenantUserDto>> Handle(UpdateTenantUserCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var user = await _dbContext.TenantUsers.FirstOrDefaultAsync(u => u.Id == request.Id && u.TenantId == tenantId, cancellationToken);
        if (user == null)
        {
            return Result<TenantUserDto>.Failure(new Error("UserNotFound", "Usuario no encontrado."));
        }

        user.Update(request.FullName, request.Role, request.IsActive, request.AllowedModulesJson, request.Password, request.IsTechnicalDirector);

        PermissionProfile? profile = null;
        if (request.ProfileId is not null)
        {
            var resolved = await ResolveProfileAsync(tenantId, request.ProfileId, request.Role, cancellationToken);
            if (!resolved.IsSuccess) return Result<TenantUserDto>.Failure(resolved.Error);
            profile = resolved.Value;
            user.ApplyPermissions(profile, request.Overrides);
        }
        else if (user.ProfileId is { } currentId)
        {
            // Pantallas viejas (sin perfil): el perfil y las excepciones mandan.
            profile = await _dbContext.PermissionProfiles.FirstOrDefaultAsync(p => p.Id == currentId, cancellationToken);
            if (profile is not null) user.ApplyPermissions(profile, PermissionCatalog.ReadOverrides(user.PermissionOverridesJson));
        }

        var stillAdmin = user.IsActive && user.EffectivePermissions(profile).LevelOf(PermissionCatalog.Administration) >= PermissionLevel.Admin;
        if (await WouldLeaveNoAdministratorAsync(tenantId, user.Id, stillAdmin, cancellationToken))
            return Result<TenantUserDto>.Failure(Error.Validation("Crm.Permissions.LastAdmin",
                "Tiene que quedar al menos un usuario activo que administre la configuración y los usuarios."));

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<TenantUserDto>.Success(ToDto(user, profile is null ? [] : [profile]));
    }

    public async Task<Result<bool>> Handle(DeleteTenantUserCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var user = await _dbContext.TenantUsers
            .FirstOrDefaultAsync(u => u.Id == request.Id && u.TenantId == tenantId, cancellationToken);

        if (user == null)
        {
            return Result<bool>.Success(true);
        }

        if (await WouldLeaveNoAdministratorAsync(tenantId, user.Id, stillAdmin: false, cancellationToken))
        {
            return Result<bool>.Failure(new Error(
                "LastAdmin",
                "No podés eliminar el único administrador activo de la empresa."));
        }

        _dbContext.TenantUsers.Remove(user);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    private async Task<CompanySettings> GetOrInitSettingsAsync(TenantId tenantId, CancellationToken cancellationToken)
    {
        var settings = await _dbContext.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, cancellationToken);
        if (settings == null)
        {
            settings = new CompanySettings
            {
                TenantId = tenantId,
                DocumentType = "Cuit",
                TaxCondition = "ResponsableInscripto",
                IibbRegime = "ConvenioMultilateral",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow
            };
            _dbContext.CompanySettings.Add(settings);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        return settings;
    }

    private static CompanySettingsDto MapToDto(CompanySettings s) => new(
        s.TenantId.Value,
        s.LegalName,
        s.TradeName,
        s.DocumentType,
        s.DocumentNumber,
        s.TaxCondition,
        s.IibbRegime,
        s.IibbNumber,
        s.ActivityStartDate,
        s.Email,
        s.Phone,
        s.WhatsApp,
        s.Website,
        s.FiscalStreet,
        s.FiscalCity,
        s.FiscalProvince,
        s.FiscalPostalCode,
        s.LogoUrl,
        null, // Never return certificate material to browsers.
        null, // The private key is only returned once when generating the CSR.
        s.ArcaEnvironment,
        s.ArcaSignerCuit,
        s.BankName,
        s.BankCbu,
        s.BankAlias,
        s.DefaultQuoteValidDays,
        s.DefaultDeliveryDays,
        s.DefaultWarranty,
        s.DefaultPaymentTerms,
        !string.IsNullOrWhiteSpace(s.ArcaCertificateCrt),
        !string.IsNullOrWhiteSpace(s.ArcaCertificateKey),
        s.ArcaPointOfSale);
}
