using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Crm.Domain.Settings;

public sealed class CompanySettings
{
    public TenantId TenantId { get; set; } = new(Guid.Empty);

    public string LegalName { get; set; } = string.Empty;

    public string? TradeName { get; set; }

    public string DocumentType { get; set; } = "Cuit";

    public string DocumentNumber { get; set; } = string.Empty;

    public string TaxCondition { get; set; } = "ResponsableInscripto";

    public string IibbRegime { get; set; } = "ConvenioMultilateral";

    public string? IibbNumber { get; set; }

    public string? ActivityStartDate { get; set; }

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public string? WhatsApp { get; set; }

    public string? Website { get; set; }

    public string? FiscalStreet { get; set; }

    public string? FiscalCity { get; set; }

    public string? FiscalProvince { get; set; }

    public string? FiscalPostalCode { get; set; }

    public string? LogoUrl { get; set; }

    public string? ArcaCertificateCrt { get; set; }

    public string? ArcaCertificateKey { get; set; }

    public string ArcaEnvironment { get; set; } = "Homologacion";

    public string? ArcaSignerCuit { get; set; }

    // Punto de venta RECE que usa este sistema. Si está fijado, no se emite por otro
    // (evita mezclar numeración con otro sistema de facturación de la misma empresa).
    public int? ArcaPointOfSale { get; set; }

    public string? BankName { get; set; }

    public string? BankCbu { get; set; }

    public string? BankAlias { get; set; }

    public int DefaultQuoteValidDays { get; set; } = 15;

    public int DefaultDeliveryDays { get; set; } = 7;

    public string? DefaultWarranty { get; set; }

    public string? DefaultPaymentTerms { get; set; }

    // Diseño y textos de los documentos impresos (presupuesto, remito, factura, orden de compra).
    // JSON que arma el frontend; se guarda por empresa para que todos los usuarios vean lo mismo.
    public string? DocumentTemplatesJson { get; set; }

    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
