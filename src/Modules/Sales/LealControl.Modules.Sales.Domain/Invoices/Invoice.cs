using System;
using System.Collections.Generic;
using System.Linq;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Invoices;

public sealed class Invoice : Entity<Guid>
{
    private readonly List<InvoiceItem> _items = new();

    private Invoice()
    {
    }

    public Invoice(
        Guid id,
        TenantId tenantId,
        string invoiceType,
        int pointOfSale,
        int invoiceNumber,
        string formattedNumber,
        Guid? orderId,
        Guid? remitoId,
        Guid customerId,
        string customerName,
        string customerDocument,
        string customerTaxCondition,
        string? customerAddress,
        DateTime issueDate,
        DateTime dueDate,
        string currency,
        decimal exchangeRate,
        decimal subtotal,
        decimal iva21,
        decimal iva105,
        decimal iva27,
        decimal exemptAmount,
        decimal iibbPerception,
        decimal total,
        string? cae,
        DateTime? caeDueDate,
        string? qrUrl,
        string status,
        string? afipRawResponse,
        string? notes,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        InvoiceType = invoiceType;
        PointOfSale = pointOfSale;
        InvoiceNumber = invoiceNumber;
        FormattedNumber = formattedNumber;
        OrderId = orderId;
        RemitoId = remitoId;
        CustomerId = customerId;
        CustomerName = customerName;
        CustomerDocument = customerDocument;
        CustomerTaxCondition = customerTaxCondition;
        CustomerAddress = customerAddress;
        IssueDate = issueDate;
        DueDate = dueDate;
        Currency = currency;
        ExchangeRate = exchangeRate;
        Subtotal = subtotal;
        Iva21 = iva21;
        Iva105 = iva105;
        Iva27 = iva27;
        ExemptAmount = exemptAmount;
        IibbPerception = iibbPerception;
        Total = total;
        Cae = cae;
        CaeDueDate = caeDueDate;
        QrUrl = qrUrl;
        Status = status;
        AfipRawResponse = afipRawResponse;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }

    public string InvoiceType { get; private set; } = "A"; // A, B, C, M, NC_A, NC_B, ND_A, ND_B, Proforma

    public int PointOfSale { get; private set; } = 1;

    public int InvoiceNumber { get; private set; } = 1;

    public string FormattedNumber { get; private set; } = string.Empty;

    public Guid? OrderId { get; private set; }

    public Guid? RemitoId { get; private set; }

    public Guid CustomerId { get; private set; }

    public string CustomerName { get; private set; } = string.Empty;

    public string CustomerDocument { get; private set; } = string.Empty;

    public string CustomerTaxCondition { get; private set; } = "ResponsableInscripto";

    public string? CustomerAddress { get; private set; }

    public DateTime IssueDate { get; private set; }

    public DateTime DueDate { get; private set; }

    // 0 = pendiente de clasificar; 1 = productos; 2 = servicios; 3 = ambos.
    public int FiscalConcept { get; private set; }

    public DateTime? ServiceFrom { get; private set; }

    public DateTime? ServiceTo { get; private set; }

    // Factura original de una nota de crédito o débito (se informa a ARCA como CbteAsoc).
    public Guid? AssociatedInvoiceId { get; private set; }

    // Comprobante en moneda extranjera que se cancela en esa misma moneda (CanMisMonExt = S).
    public bool PaidInForeignCurrency { get; private set; }

    // Cotización BNA pactada para cancelar en pesos ("Divisa" o "Billete"), del día hábil anterior al pago.
    public string? ExchangeRateType { get; private set; }

    // Nota de débito/crédito que documenta la diferencia de cambio de una imputación de cobro.
    public Guid? ExchangeDifferenceImputationId { get; private set; }

    // Factura de Crédito Electrónica: CBU y alias donde cobra la empresa, y modalidad de
    // transferencia (SCA o ADC). En sus notas, si son de anulación (el cliente la rechazó).
    public string? FceCbu { get; private set; }
    public string? FceAlias { get; private set; }
    public string? FceTransferMode { get; private set; }
    public bool? FceCancellation { get; private set; }

    public string Currency { get; private set; } = "ARS";

    public decimal ExchangeRate { get; private set; } = 1.0m;

    public decimal Subtotal { get; private set; }

    public decimal Iva21 { get; private set; }

    public decimal Iva105 { get; private set; }

    public decimal Iva27 { get; private set; }

    public decimal ExemptAmount { get; private set; }

    public decimal IibbPerception { get; private set; }

    public decimal Total { get; private set; }

    public string? Cae { get; private set; }

    public DateTime? CaeDueDate { get; private set; }

    public string? QrUrl { get; private set; }

    public string Status { get; private set; } = "Draft"; // Draft, Authorized, Rejected, Cancelled

    public string? AfipRawResponse { get; private set; }

    public string? Notes { get; private set; }

    public DateTime CreatedAtUtc { get; private set; }

    public IReadOnlyList<InvoiceItem> Items => _items.AsReadOnly();

    public static Invoice Create(
        TenantId tenantId,
        string invoiceType,
        int pointOfSale,
        int invoiceNumber,
        Guid? orderId,
        Guid? remitoId,
        Guid customerId,
        string customerName,
        string customerDocument,
        string customerTaxCondition,
        string? customerAddress,
        DateTime dueDate,
        string currency,
        decimal exchangeRate,
        string? notes,
        DateTime? issueDate = null,
        int fiscalConcept = 0,
        DateTime? serviceFrom = null,
        DateTime? serviceTo = null,
        Guid? associatedInvoiceId = null,
        bool paidInForeignCurrency = false,
        string? exchangeRateType = null,
        Guid? exchangeDifferenceImputationId = null,
        string? fceCbu = null,
        string? fceAlias = null,
        string? fceTransferMode = null,
        bool? fceCancellation = null)
    {
        var formatted = $"{pointOfSale:D4}-{invoiceNumber:D8}";
        var utcIssueDate = issueDate is null ? DateTime.UtcNow
            : issueDate.Value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(issueDate.Value, DateTimeKind.Utc)
                : issueDate.Value.ToUniversalTime();
        var utcDueDate = dueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(dueDate, DateTimeKind.Utc)
            : dueDate.ToUniversalTime();

        var invoice = new Invoice(
            Guid.NewGuid(),
            tenantId,
            invoiceType,
            pointOfSale,
            invoiceNumber,
            formatted,
            orderId,
            remitoId,
            customerId,
            customerName,
            customerDocument,
            customerTaxCondition,
            customerAddress,
            utcIssueDate,
            utcDueDate,
            currency,
            exchangeRate <= 0 ? 1.0m : exchangeRate,
            0, 0, 0, 0, 0, 0, 0,
            null, null, null,
            "Draft",
            null,
            notes,
            DateTime.UtcNow);
        invoice.SetFiscalDetails(fiscalConcept, serviceFrom, serviceTo);
        invoice.AssociatedInvoiceId = associatedInvoiceId;
        invoice.PaidInForeignCurrency = currency != "ARS" && paidInForeignCurrency;
        invoice.ExchangeRateType = currency != "ARS" && exchangeRateType is "Divisa" or "Billete" ? exchangeRateType : null;
        invoice.ExchangeDifferenceImputationId = exchangeDifferenceImputationId;
        if (FiscalVoucherCodes.IsFce(invoiceType))
        {
            invoice.FceCbu = string.IsNullOrWhiteSpace(fceCbu) ? null : new string(fceCbu.Where(char.IsDigit).ToArray());
            invoice.FceAlias = string.IsNullOrWhiteSpace(fceAlias) ? null : fceAlias.Trim();
            invoice.FceTransferMode = fceTransferMode is "ADC" ? "ADC" : "SCA";
            invoice.FceCancellation = fceCancellation;
        }
        return invoice;
    }

    // Solo en borradores sin reserva fiscal: alinea la cotización con la oficial de ARCA.
    public void ApplyExchangeRate(decimal rate)
    {
        if (Status != "Draft" || Cae is not null)
            throw new InvalidOperationException("Solo se puede cambiar la cotización de un borrador.");
        if (Currency == "ARS" || rate <= 0m)
            throw new ArgumentException("Cotización inválida.");
        ExchangeRate = rate;
    }

    public void SetFiscalDetails(int concept, DateTime? from, DateTime? to)
    {
        if (Status != "Draft")
            throw new InvalidOperationException("Solo se pueden cambiar datos fiscales de un borrador.");
        if (concept < 0 || concept > 3)
            throw new ArgumentOutOfRangeException(nameof(concept), "Concepto fiscal inválido.");
        if (concept is 2 or 3)
        {
            if (!from.HasValue || !to.HasValue)
                throw new ArgumentException("Indicá el período del servicio.");
            if (to.Value.Date < from.Value.Date)
                throw new ArgumentException("El fin del servicio no puede ser anterior al inicio.");
            if (DueDate.Date < IssueDate.Date)
                throw new ArgumentException("El vencimiento de pago no puede ser anterior a la emisión.");
        }
        else if (from.HasValue || to.HasValue)
        {
            throw new ArgumentException("Las fechas de servicio requieren concepto servicios o mixto.");
        }

        FiscalConcept = concept;
        ServiceFrom = from.HasValue ? NormalizeUtc(from.Value) : null;
        ServiceTo = to.HasValue ? NormalizeUtc(to.Value) : null;
    }

    private static DateTime NormalizeUtc(DateTime date) => date.Kind == DateTimeKind.Unspecified
        ? DateTime.SpecifyKind(date, DateTimeKind.Utc)
        : date.ToUniversalTime();

    public void AddItem(
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal vatRate,
        Guid? remitoItemId = null)
    {
        var net = Math.Round(quantity * unitPrice, 2);
        var vat = Math.Round(net * (vatRate / 100m), 2);
        var tot = net + vat;

        var item = new InvoiceItem(
            Guid.NewGuid(),
            Id,
            productId,
            code,
            description,
            quantity,
            unitPrice,
            vatRate,
            net,
            vat,
            tot,
            remitoItemId);

        _items.Add(item);
        RecalculateTotals();
    }

    public void RecalculateTotals()
    {
        Subtotal = _items.Sum(i => i.NetSubtotal);
        Iva21 = _items.Where(i => Math.Abs(i.VatRate - 21.0m) < 0.01m).Sum(i => i.VatAmount);
        Iva105 = _items.Where(i => Math.Abs(i.VatRate - 10.5m) < 0.01m).Sum(i => i.VatAmount);
        Iva27 = _items.Where(i => Math.Abs(i.VatRate - 27.0m) < 0.01m).Sum(i => i.VatAmount);
        ExemptAmount = _items.Where(i => i.VatRate == 0).Sum(i => i.NetSubtotal);
        Total = Subtotal + Iva21 + Iva105 + Iva27 + IibbPerception;
    }

    // Solo se invoca después de confirmar FECompConsultar contra la reserva persistida.
    // El número del borrador es provisorio; este método asigna el oficial.
    public void ConfirmFiscalAuthorization(FiscalAuthorizationAttempt attempt, string expectedRequestHash, string qrUrl)
    {
        ArgumentNullException.ThrowIfNull(attempt);
        if (string.IsNullOrWhiteSpace(expectedRequestHash) ||
            !string.Equals(attempt.RequestHash, expectedRequestHash, StringComparison.OrdinalIgnoreCase) ||
            Status != "Draft" || Cae is not null || attempt.Status != "Confirmed" ||
            attempt.InvoiceId != Id || attempt.TenantId.Value != TenantId.Value ||
            attempt.PointOfSale != PointOfSale ||
            FiscalVoucherCodes.For(InvoiceType) != attempt.VoucherType ||
            attempt.VoucherNumber <= 0 || attempt.VoucherNumber > 99_999_999 ||
            attempt.Total != Total ||
            attempt.RecipientDocument != FiscalVoucherCodes.ReceiverDocument(CustomerDocument) ||
            attempt.Cae is null || attempt.CaeDueDate is null ||
            !Uri.TryCreate(qrUrl, UriKind.Absolute, out var qr) || qr.Scheme != Uri.UriSchemeHttps ||
            (qr.Host != "www.afip.gob.ar" && qr.Host != "www.arca.gob.ar") ||
            qr.AbsolutePath != "/fe/qr/")
            throw new InvalidOperationException("La reserva fiscal confirmada no corresponde al borrador.");

        InvoiceNumber = checked((int)attempt.VoucherNumber);
        FormattedNumber = $"{PointOfSale:D4}-{InvoiceNumber:D8}";
        Cae = attempt.Cae;
        CaeDueDate = attempt.CaeDueDate;
        QrUrl = qrUrl;
        AfipRawResponse = null;
        Status = "Authorized";
    }

    public void Reject(string rawResponse)
    {
        AfipRawResponse = rawResponse;
        Status = "Rejected";
    }

    public void Cancel()
    {
        Status = "Cancelled";
    }
}

public sealed class InvoiceItem : Entity<Guid>
{
    private InvoiceItem()
    {
    }

    public InvoiceItem(
        Guid id,
        Guid invoiceId,
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal vatRate,
        decimal netSubtotal,
        decimal vatAmount,
        decimal total,
        Guid? remitoItemId)
        : base(id)
    {
        InvoiceId = invoiceId;
        RemitoItemId = remitoItemId;
        ProductId = productId;
        Code = code;
        Description = description;
        Quantity = quantity;
        UnitPrice = unitPrice;
        VatRate = vatRate;
        NetSubtotal = netSubtotal;
        VatAmount = vatAmount;
        Total = total;
    }

    public Guid InvoiceId { get; private set; }

    public Guid? RemitoItemId { get; private set; }

    public Guid? ProductId { get; private set; }

    public string Code { get; private set; } = string.Empty;

    public string Description { get; private set; } = string.Empty;

    public decimal Quantity { get; private set; }

    public decimal UnitPrice { get; private set; }

    public decimal VatRate { get; private set; } = 21.0m;

    public decimal NetSubtotal { get; private set; }

    public decimal VatAmount { get; private set; }

    public decimal Total { get; private set; }
}
