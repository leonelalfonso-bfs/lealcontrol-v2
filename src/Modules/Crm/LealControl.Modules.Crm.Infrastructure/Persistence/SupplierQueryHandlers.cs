using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Results;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Application.Suppliers;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.Suppliers;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace LealControl.Modules.Crm.Infrastructure.Persistence;

internal sealed class SupplierConfiguration : IEntityTypeConfiguration<Supplier>
{
    public void Configure(EntityTypeBuilder<Supplier> builder)
    {
        builder.ToTable("suppliers", "crm");

        builder.HasKey(s => s.Id);

        builder.Property(s => s.TenantId)
            .HasConversion(id => id.Value, value => new TenantId(value));

        builder.Property(s => s.LegalName).HasMaxLength(256).IsRequired();
        builder.Property(s => s.TradeName).HasMaxLength(256);
        builder.Property(s => s.DocumentType).HasMaxLength(20).IsRequired();
        builder.Property(s => s.DocumentNumber).HasMaxLength(20).IsRequired();
        builder.Property(s => s.TaxCondition).HasMaxLength(64).IsRequired();
        builder.Property(s => s.Email).HasMaxLength(128);
        builder.Property(s => s.Phone).HasMaxLength(64);
        builder.Property(s => s.ContactName).HasMaxLength(128);
        builder.Property(s => s.FiscalStreet).HasMaxLength(256);
        builder.Property(s => s.FiscalCity).HasMaxLength(128);
        builder.Property(s => s.FiscalProvince).HasMaxLength(64);
        builder.Property(s => s.FiscalPostalCode).HasMaxLength(20);
    }
}

internal sealed class SupplierQueryHandlers
    : IRequestHandler<ListSuppliersQuery, Result<IReadOnlyList<SupplierDto>>>,
      IRequestHandler<GetSupplierByIdQuery, Result<SupplierDto>>,
      IRequestHandler<CreateSupplierCommand, Result<SupplierDto>>,
      IRequestHandler<UpdateSupplierCommand, Result<SupplierDto>>,
      IRequestHandler<DeleteSupplierCommand, Result<bool>>
{
    private readonly CrmDbContext _dbContext;
    private readonly ITenantContext _tenantContext;

    public SupplierQueryHandlers(CrmDbContext dbContext, ITenantContext tenantContext)
    {
        _dbContext = dbContext;
        _tenantContext = tenantContext;
    }

    public async Task<Result<IReadOnlyList<SupplierDto>>> Handle(ListSuppliersQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var query = _dbContext.Suppliers.AsNoTracking().Where(s => s.TenantId == tenantId);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(s => s.LegalName.ToLower().Contains(search)
                                  || s.DocumentNumber.Contains(search)
                                  || (s.TradeName != null && s.TradeName.ToLower().Contains(search)));
        }

        var suppliers = await query.OrderBy(s => s.LegalName).ToListAsync(cancellationToken);

        IReadOnlyList<SupplierDto> dtos = suppliers.Select(MapToDto).ToList();
        return Result<IReadOnlyList<SupplierDto>>.Success(dtos);
    }

    public async Task<Result<SupplierDto>> Handle(GetSupplierByIdQuery request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var supplier = await _dbContext.Suppliers
            .AsNoTracking()
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.TenantId == tenantId, cancellationToken);

        if (supplier == null)
        {
            return Result<SupplierDto>.Failure(Error.NotFound("Crm.Supplier.NotFound", $"Proveedor {request.Id} no encontrado."));
        }

        return Result<SupplierDto>.Success(MapToDto(supplier));
    }

    public async Task<Result<SupplierDto>> Handle(CreateSupplierCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var m = request.Model;

        var supplier = Supplier.Create(
            tenantId,
            m.LegalName,
            m.TradeName,
            m.DocumentType,
            m.DocumentNumber,
            m.TaxCondition,
            m.Email,
            m.Phone,
            m.ContactName,
            m.FiscalStreet,
            m.FiscalCity,
            m.FiscalProvince,
            m.FiscalPostalCode,
            m.PaymentTermsDays,
            m.Notes);

        _dbContext.Suppliers.Add(supplier);
        await _dbContext.SaveChangesAsync(cancellationToken);

        return Result<SupplierDto>.Success(MapToDto(supplier));
    }

    public async Task<Result<SupplierDto>> Handle(UpdateSupplierCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var m = request.Model;

        var supplier = await _dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.TenantId == tenantId, cancellationToken);

        if (supplier == null)
        {
            return Result<SupplierDto>.Failure(Error.NotFound("Crm.Supplier.NotFound", $"Proveedor {request.Id} no encontrado."));
        }

        supplier.Update(
            m.LegalName,
            m.TradeName,
            m.DocumentType,
            m.DocumentNumber,
            m.TaxCondition,
            m.Email,
            m.Phone,
            m.ContactName,
            m.FiscalStreet,
            m.FiscalCity,
            m.FiscalProvince,
            m.FiscalPostalCode,
            m.PaymentTermsDays,
            m.Notes);

        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<SupplierDto>.Success(MapToDto(supplier));
    }

    public async Task<Result<bool>> Handle(DeleteSupplierCommand request, CancellationToken cancellationToken)
    {
        var tenantId = _tenantContext.TenantId;
        var supplier = await _dbContext.Suppliers
            .FirstOrDefaultAsync(s => s.Id == request.Id && s.TenantId == tenantId, cancellationToken);

        if (supplier == null) return Result<bool>.Success(true);

        _dbContext.Suppliers.Remove(supplier);
        await _dbContext.SaveChangesAsync(cancellationToken);
        return Result<bool>.Success(true);
    }

    private static SupplierDto MapToDto(Supplier s)
    {
        return new SupplierDto(
            s.Id,
            s.LegalName,
            s.TradeName,
            s.DocumentType,
            s.DocumentNumber,
            s.TaxCondition,
            s.Email,
            s.Phone,
            s.ContactName,
            s.FiscalStreet,
            s.FiscalCity,
            s.FiscalProvince,
            s.FiscalPostalCode,
            s.PaymentTermsDays,
            s.Notes,
            s.CreatedAtUtc);
    }
}
