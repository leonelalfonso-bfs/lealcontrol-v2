using System;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Crm.Domain.Settings;

public sealed class CompanySettings
{
    public TenantId TenantId { get; set; } = new(Guid.Empty);

    public string LegalName { get; set; } = "LEAL CONTROL ERP S.A.";

    public string? TradeName { get; set; } = "Leal Control Metrología";

    public string DocumentType { get; set; } = "Cuit";

    public string DocumentNumber { get; set; } = "30715489629";

    public string TaxCondition { get; set; } = "ResponsableInscripto";

    public string IibbRegime { get; set; } = "ConvenioMultilateral";

    public string? IibbNumber { get; set; } = "30-71548962-9";

    public string? Email { get; set; } = "contacto@lealcontrol.com";

    public string? Phone { get; set; } = "341-555-0000";

    public string? WhatsApp { get; set; } = "5493415550000";

    public string? Website { get; set; } = "www.lealcontrol.com";

    public string? FiscalStreet { get; set; } = "Luis Braile 705";

    public string? FiscalCity { get; set; } = "San Lorenzo";

    public string? FiscalProvince { get; set; } = "SantaFe";

    public string? FiscalPostalCode { get; set; } = "2200";

    public string? LogoUrl { get; set; }

    public string? ArcaCertificateCrt { get; set; }

    public string? ArcaCertificateKey { get; set; }

    public string ArcaEnvironment { get; set; } = "Homologacion";

    public string? ArcaSignerCuit { get; set; } = "30715489629";

    public string? BankName { get; set; } = "Banco Macro";

    public string? BankCbu { get; set; } = "2850001240000012345678";

    public string? BankAlias { get; set; } = "LEAL.CONTROL.ERP";

    public int DefaultQuoteValidDays { get; set; } = 15;

    public int DefaultDeliveryDays { get; set; } = 7;

    public string? DefaultWarranty { get; set; } = "12 meses para repuestos y 6 meses para servicios";

    public string? DefaultPaymentTerms { get; set; } = "Contado / 30 días con e-Cheq";

    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
}
