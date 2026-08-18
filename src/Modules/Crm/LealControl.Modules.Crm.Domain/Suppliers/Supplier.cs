using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Crm.Domain.Suppliers;

public sealed class Supplier : Entity<Guid>
{
    private Supplier()
    {
    }

    public Supplier(
        Guid id,
        TenantId tenantId,
        string legalName,
        string? tradeName,
        string documentType,
        string documentNumber,
        string taxCondition,
        string? email,
        string? phone,
        string? contactName,
        string? fiscalStreet,
        string? fiscalCity,
        string? fiscalProvince,
        string? fiscalPostalCode,
        int? paymentTermsDays,
        string? notes,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        LegalName = legalName;
        TradeName = tradeName;
        DocumentType = documentType;
        DocumentNumber = documentNumber;
        TaxCondition = taxCondition;
        Email = email;
        Phone = phone;
        ContactName = contactName;
        FiscalStreet = fiscalStreet;
        FiscalCity = fiscalCity;
        FiscalProvince = fiscalProvince;
        FiscalPostalCode = fiscalPostalCode;
        PaymentTermsDays = paymentTermsDays;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string LegalName { get; private set; } = string.Empty;

    public string? TradeName { get; private set; }

    public string DocumentType { get; private set; } = "Cuit";

    public string DocumentNumber { get; private set; } = string.Empty;

    public string TaxCondition { get; private set; } = "ResponsableInscripto";

    public string? Email { get; private set; }

    public string? Phone { get; private set; }

    public string? ContactName { get; private set; }

    public string? FiscalStreet { get; private set; }

    public string? FiscalCity { get; private set; }

    public string? FiscalProvince { get; private set; }

    public string? FiscalPostalCode { get; private set; }

    public int? PaymentTermsDays { get; private set; }

    public string? Notes { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public static Supplier Create(
        TenantId tenantId,
        string legalName,
        string? tradeName,
        string documentType,
        string documentNumber,
        string taxCondition,
        string? email,
        string? phone,
        string? contactName,
        string? fiscalStreet,
        string? fiscalCity,
        string? fiscalProvince,
        string? fiscalPostalCode,
        int? paymentTermsDays,
        string? notes)
    {
        return new Supplier(
            Guid.NewGuid(),
            tenantId,
            legalName.Trim(),
            tradeName?.Trim(),
            string.IsNullOrWhiteSpace(documentType) ? "Cuit" : documentType.Trim(),
            documentNumber.Trim(),
            string.IsNullOrWhiteSpace(taxCondition) ? "ResponsableInscripto" : taxCondition.Trim(),
            email?.Trim(),
            phone?.Trim(),
            contactName?.Trim(),
            fiscalStreet?.Trim(),
            fiscalCity?.Trim(),
            fiscalProvince?.Trim(),
            fiscalPostalCode?.Trim(),
            paymentTermsDays,
            notes?.Trim(),
            DateTime.UtcNow);
    }

    public void Update(
        string legalName,
        string? tradeName,
        string documentType,
        string documentNumber,
        string taxCondition,
        string? email,
        string? phone,
        string? contactName,
        string? fiscalStreet,
        string? fiscalCity,
        string? fiscalProvince,
        string? fiscalPostalCode,
        int? paymentTermsDays,
        string? notes)
    {
        LegalName = legalName.Trim();
        TradeName = tradeName?.Trim();
        DocumentType = string.IsNullOrWhiteSpace(documentType) ? "Cuit" : documentType.Trim();
        DocumentNumber = documentNumber.Trim();
        TaxCondition = string.IsNullOrWhiteSpace(taxCondition) ? "ResponsableInscripto" : taxCondition.Trim();
        Email = email?.Trim();
        Phone = phone?.Trim();
        ContactName = contactName?.Trim();
        FiscalStreet = fiscalStreet?.Trim();
        FiscalCity = fiscalCity?.Trim();
        FiscalProvince = fiscalProvince?.Trim();
        FiscalPostalCode = fiscalPostalCode?.Trim();
        PaymentTermsDays = paymentTermsDays;
        Notes = notes?.Trim();
    }
}
