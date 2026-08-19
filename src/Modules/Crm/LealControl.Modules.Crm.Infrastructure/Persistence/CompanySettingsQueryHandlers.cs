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

internal sealed class CompanySettingsQueryHandler
    : IRequestHandler<GetCompanySettingsQuery, Result<CompanySettingsDto>>,
      IRequestHandler<UpdateCompanySettingsCommand, Result<CompanySettingsDto>>,
      IRequestHandler<UploadArcaCertificateCommand, Result<CompanySettingsDto>>,
      IRequestHandler<ListTenantUsersQuery, Result<IReadOnlyList<TenantUserDto>>>,
      IRequestHandler<CreateTenantUserCommand, Result<TenantUserDto>>
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
        var m = request.Model;

        settings.LegalName = string.IsNullOrWhiteSpace(m.LegalName) ? settings.LegalName : m.LegalName.Trim();
        settings.TradeName = m.TradeName?.Trim();
        settings.DocumentType = string.IsNullOrWhiteSpace(m.DocumentType) ? "Cuit" : m.DocumentType.Trim();
        settings.DocumentNumber = string.IsNullOrWhiteSpace(m.DocumentNumber) ? settings.DocumentNumber : m.DocumentNumber.Trim();
        settings.TaxCondition = string.IsNullOrWhiteSpace(m.TaxCondition) ? settings.TaxCondition : m.TaxCondition.Trim();
        settings.IibbRegime = string.IsNullOrWhiteSpace(m.IibbRegime) ? settings.IibbRegime : m.IibbRegime.Trim();
        settings.IibbNumber = m.IibbNumber?.Trim();
        settings.ActivityStartDate = m.ActivityStartDate?.Trim();
        settings.Email = m.Email?.Trim();
        settings.Phone = m.Phone?.Trim();
        settings.WhatsApp = m.WhatsApp?.Trim();
        settings.Website = m.Website?.Trim();
        settings.FiscalStreet = m.FiscalStreet?.Trim();
        settings.FiscalCity = m.FiscalCity?.Trim();
        settings.FiscalProvince = m.FiscalProvince?.Trim();
        settings.FiscalPostalCode = m.FiscalPostalCode?.Trim();
        settings.LogoUrl = m.LogoUrl;
        settings.ArcaEnvironment = string.IsNullOrWhiteSpace(m.ArcaEnvironment) ? "Homologacion" : m.ArcaEnvironment.Trim();
        settings.ArcaSignerCuit = m.ArcaSignerCuit?.Trim();
        settings.BankName = m.BankName?.Trim();
        settings.BankCbu = m.BankCbu?.Trim();
        settings.BankAlias = m.BankAlias?.Trim();
        settings.DefaultQuoteValidDays = m.DefaultQuoteValidDays > 0 ? m.DefaultQuoteValidDays : 15;
        settings.DefaultDeliveryDays = m.DefaultDeliveryDays > 0 ? m.DefaultDeliveryDays : 7;
        settings.DefaultWarranty = m.DefaultWarranty?.Trim();
        settings.DefaultPaymentTerms = m.DefaultPaymentTerms?.Trim();
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
        settings.ArcaEnvironment = string.IsNullOrWhiteSpace(request.Environment) ? "Homologacion" : request.Environment;
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
            // Seed default admin user for tenant
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
            u.CreatedAtUtc)).ToList();

        return Result<IReadOnlyList<TenantUserDto>>.Success(dtos);
    }

    public async Task<Result<TenantUserDto>> Handle(CreateTenantUserCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var user = TenantUser.Create(tenantId, request.FullName, request.Email, request.Role);
        _dbContext.TenantUsers.Add(user);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<TenantUserDto>.Success(new TenantUserDto(
            user.Id,
            user.FullName,
            user.Email,
            user.Role,
            user.IsActive,
            user.CreatedAtUtc));
    }

    private async Task<CompanySettings> GetOrInitSettingsAsync(TenantId tenantId, CancellationToken cancellationToken)
    {
        var settings = await _dbContext.CompanySettings.FirstOrDefaultAsync(s => s.TenantId == tenantId, cancellationToken);
        if (settings == null)
        {
            settings = new CompanySettings { TenantId = tenantId };
            _dbContext.CompanySettings.Add(settings);
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        return settings;
    }

    private static CompanySettingsDto MapToDto(CompanySettings s)
    {
        return new CompanySettingsDto(
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
            !string.IsNullOrWhiteSpace(s.ArcaCertificateCrt),
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
}
