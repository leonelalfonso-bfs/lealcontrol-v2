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
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

public sealed class CompanySettingsQueryHandler :
      IRequestHandler<GetCompanySettingsQuery, Result<CompanySettingsDto>>,
      IRequestHandler<UpdateCompanySettingsCommand, Result<CompanySettingsDto>>,
      IRequestHandler<UploadArcaCertificateCommand, Result<CompanySettingsDto>>,
      IRequestHandler<GenerateArcaCsrCommand, Result<ArcaCsrResultDto>>,
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

    public async Task<Result<CompanySettingsDto>> Handle(UploadArcaCertificateCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var settings = await GetOrInitSettingsAsync(tenantId, cancellationToken);

        settings.ArcaCertificateCrt = request.CertificateCrt;
        settings.ArcaCertificateKey = request.CertificateKey;
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
        var users = await _dbContext.TenantUsers
            .AsNoTracking()
            .Where(u => u.TenantId == tenantId)
            .OrderBy(u => u.FullName)
            .ToListAsync(cancellationToken);

        if (users.Count == 0)
        {
            var adminUser = TenantUser.Create(tenantId, "Administrador Leal", "admin@lealcontrol.com", "Admin");
            var comUser = TenantUser.Create(tenantId, "Ventas Comercial", "ventas@lealcontrol.com", "Comercial");
            var tecUser = TenantUser.Create(tenantId, "Técnico Servicio", "servicio@lealcontrol.com", "Técnico");

            _dbContext.TenantUsers.AddRange(adminUser, comUser, tecUser);
            await _dbContext.SaveChangesAsync(cancellationToken);

            users = new List<TenantUser> { adminUser, comUser, tecUser };
        }

        IReadOnlyList<TenantUserDto> dtos = users.Select(u => new TenantUserDto(
            u.Id,
            u.FullName,
            u.Email,
            u.Role,
            u.IsActive,
            u.CreatedAtUtc,
            u.AllowedModulesJson,
            u.IsTechnicalDirector)).ToList();

        return Result<IReadOnlyList<TenantUserDto>>.Success(dtos);
    }

    public async Task<Result<TenantUserDto>> Handle(CreateTenantUserCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var user = TenantUser.Create(tenantId, request.FullName, request.Email, request.Role, initialPassword: request.Password, allowedModulesJson: request.AllowedModulesJson);
        if (request.IsTechnicalDirector)
        {
            user.SetTechnicalDirector(true);
        }

        _dbContext.TenantUsers.Add(user);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<TenantUserDto>.Success(new TenantUserDto(
            user.Id,
            user.FullName,
            user.Email,
            user.Role,
            user.IsActive,
            user.CreatedAtUtc,
            user.AllowedModulesJson,
            user.IsTechnicalDirector));
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
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<TenantUserDto>.Success(new TenantUserDto(
            user.Id,
            user.FullName,
            user.Email,
            user.Role,
            user.IsActive,
            user.CreatedAtUtc,
            user.AllowedModulesJson,
            user.IsTechnicalDirector));
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

        var isAdminRole = string.Equals(user.Role, "Admin", StringComparison.OrdinalIgnoreCase)
            || string.Equals(user.Role, "Administrador", StringComparison.OrdinalIgnoreCase);

        if (isAdminRole)
        {
            var activeAdminCount = await _dbContext.TenantUsers.CountAsync(
                u => u.TenantId == tenantId
                    && u.IsActive
                    && u.Id != user.Id
                    && (u.Role == "Admin" || u.Role == "Administrador"),
                cancellationToken);

            if (activeAdminCount == 0)
            {
                return Result<bool>.Failure(new Error(
                    "LastAdmin",
                    "No podés eliminar el único administrador activo de la empresa."));
            }
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
                LegalName = "LEAL CONTROL ERP S.A.",
                TradeName = "Leal Control Metrología",
                DocumentType = "Cuit",
                DocumentNumber = "30715489629",
                TaxCondition = "ResponsableInscripto",
                IibbRegime = "ConvenioMultilateral",
                Email = "contacto@lealcontrol.com",
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
        s.ArcaCertificateCrt,
        s.ArcaCertificateKey,
        s.ArcaEnvironment,
        s.ArcaSignerCuit,
        s.BankName,
        s.BankCbu,
        s.BankAlias,
        s.DefaultQuoteValidDays,
        s.DefaultDeliveryDays,
        s.DefaultWarranty,
        s.DefaultPaymentTerms);
}
