using System;
using System.Collections.Generic;
using System.Linq;
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
      IRequestHandler<ListTenantUsersQuery, Result<IReadOnlyList<TenantUserDto>>>,
      IRequestHandler<CreateTenantUserCommand, Result<TenantUserDto>>,
      IRequestHandler<UpdateTenantUserCommand, Result<TenantUserDto>>
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
            u.AllowedModulesJson)).ToList();

        return Result<IReadOnlyList<TenantUserDto>>.Success(dtos);
    }

    public async Task<Result<TenantUserDto>> Handle(CreateTenantUserCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var user = TenantUser.Create(tenantId, request.FullName, request.Email, request.Role, allowedModulesJson: request.AllowedModulesJson);
        _dbContext.TenantUsers.Add(user);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<TenantUserDto>.Success(new TenantUserDto(
            user.Id,
            user.FullName,
            user.Email,
            user.Role,
            user.IsActive,
            user.CreatedAtUtc,
            user.AllowedModulesJson));
    }

    public async Task<Result<TenantUserDto>> Handle(UpdateTenantUserCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var user = await _dbContext.TenantUsers.FirstOrDefaultAsync(u => u.Id == request.Id && u.TenantId == tenantId, cancellationToken);
        if (user == null)
        {
            return Result<TenantUserDto>.Failure(new Error("UserNotFound", "Usuario no encontrado."));
        }

        user.Update(request.FullName, request.Role, request.IsActive, request.AllowedModulesJson);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<TenantUserDto>.Success(new TenantUserDto(
            user.Id,
            user.FullName,
            user.Email,
            user.Role,
            user.IsActive,
            user.CreatedAtUtc,
            user.AllowedModulesJson));
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
