using System;
using System.Collections.Generic;
using System.Linq;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Purchases;

public sealed class PurchaseInvoice : Entity<Guid>
{
    private readonly List<PurchaseInvoiceItem> _items = new();

    private PurchaseInvoice()
    {
    }

    public PurchaseInvoice(
        Guid id,
        TenantId tenantId,
        string invoiceType,
        int pointOfSale,
        long invoiceNumber,
        string formattedNumber,
        Guid? purchaseOrderId,
        Guid? purchaseReceptionId,
        Guid supplierId,
        string supplierName,
        string supplierDocument,
        string supplierTaxCondition,
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
        decimal ivaPerception,
        decimal otherTaxes,
        decimal total,
        string? cae,
        DateTime? caeDueDate,
        string status,
        string? notes,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        InvoiceType = invoiceType;
        PointOfSale = pointOfSale;
        InvoiceNumber = invoiceNumber;
        FormattedNumber = formattedNumber;
        PurchaseOrderId = purchaseOrderId;
        PurchaseReceptionId = purchaseReceptionId;
        SupplierId = supplierId;
        SupplierName = supplierName;
        SupplierDocument = supplierDocument;
        SupplierTaxCondition = supplierTaxCondition;
        IssueDate = issueDate;
        ImputationPeriod = MonthOf(issueDate);
        DueDate = dueDate;
        Currency = currency;
        ExchangeRate = exchangeRate;
        Subtotal = subtotal;
        Iva21 = iva21;
        Iva105 = iva105;
        Iva27 = iva27;
        ExemptAmount = exemptAmount;
        IibbPerception = iibbPerception;
        IvaPerception = ivaPerception;
        OtherTaxes = otherTaxes;
        Total = total;
        Cae = cae;
        CaeDueDate = caeDueDate;
        Status = status;
        Notes = notes;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }
    public string InvoiceType { get; private set; } = "A"; // A, B, C, M, NC_*, ND_*, TF_A/TF_B (tique factura), OC_A/OC_B (otros comp. RG 1415), X

    /// <summary>Compra sin factura (comprobante X): no es fiscal, no va al Libro IVA ni se constata en ARCA.</summary>
    public const string NonFiscalType = "X";
    public int PointOfSale { get; private set; } = 1;
    public long InvoiceNumber { get; private set; } = 1;
    public string FormattedNumber { get; private set; } = string.Empty;
    public Guid? PurchaseOrderId { get; private set; }
    public Guid? PurchaseReceptionId { get; private set; }
    public Guid SupplierId { get; private set; }
    public string SupplierName { get; private set; } = string.Empty;
    public string SupplierDocument { get; private set; } = string.Empty;
    public string SupplierTaxCondition { get; private set; } = "ResponsableInscripto";
    /// <summary>Jurisdicción (provincia) del proveedor al cargar la factura, para el Libro IVA Compras.</summary>
    public string? SupplierProvince { get; private set; }
    public DateTime IssueDate { get; private set; }

    /// <summary>
    /// Mes al que se imputa la compra (Libro IVA Compras y asiento), como primer día del mes. Por defecto el de la
    /// factura; si ese mes está cerrado en Contabilidad, el primer mes abierto. Nunca anterior al de la factura.
    /// </summary>
    public DateTime ImputationPeriod { get; private set; }

    /// <summary>Fecha del asiento: la de la factura si se imputa a su mes; si no, el primer día del mes imputado.</summary>
    public DateTime AccountingDate => ImputationPeriod > MonthOf(IssueDate) ? ImputationPeriod : IssueDate;

    public static DateTime MonthOf(DateTime date) => new(date.Year, date.Month, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>Imputa a otro mes; devuelve el motivo si no se puede.</summary>
    public string? ImputeTo(DateTime period)
    {
        var month = MonthOf(period);
        if (month < MonthOf(IssueDate)) return "El período de imputación no puede ser anterior al mes de la factura.";
        ImputationPeriod = month;
        return null;
    }
    public DateTime DueDate { get; private set; }
    public string Currency { get; private set; } = "ARS";
    public decimal ExchangeRate { get; private set; } = 1.0m;
    public decimal Subtotal { get; private set; }
    public decimal Iva21 { get; private set; }
    public decimal Iva105 { get; private set; }
    public decimal Iva27 { get; private set; }
    public decimal ExemptAmount { get; private set; }
    public decimal IibbPerception { get; private set; }
    public decimal IvaPerception { get; private set; }
    public decimal OtherTaxes { get; private set; }
    public decimal InternalTaxes { get; private set; }
    public decimal GananciasPerception { get; private set; }
    public decimal MunicipalTaxes { get; private set; }
    public decimal Total { get; private set; }
    public string? Cae { get; private set; }
    public DateTime? CaeDueDate { get; private set; }
    public string Status { get; private set; } = "Recorded"; // Recorded, Paid, Cancelled
    public string? Notes { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    public IReadOnlyList<PurchaseInvoiceItem> Items => _items.AsReadOnly();

    public static PurchaseInvoice Create(
        TenantId tenantId,
        string invoiceType,
        int pointOfSale,
        long invoiceNumber,
        Guid? purchaseOrderId,
        Guid? purchaseReceptionId,
        Guid supplierId,
        string supplierName,
        string supplierDocument,
        string supplierTaxCondition,
        DateTime issueDate,
        DateTime dueDate,
        string currency,
        decimal exchangeRate,
        decimal iibbPerception,
        decimal ivaPerception,
        decimal otherTaxes,
        string? cae,
        DateTime? caeDueDate,
        string? notes,
        string? supplierProvince = null,
        decimal internalTaxes = 0,
        decimal gananciasPerception = 0,
        decimal municipalTaxes = 0)
    {
        var formatted = $"{pointOfSale:D4}-{invoiceNumber:D8}";
        var utcIssue = issueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(issueDate, DateTimeKind.Utc)
            : issueDate.ToUniversalTime();

        var utcDue = dueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(dueDate, DateTimeKind.Utc)
            : dueDate.ToUniversalTime();

        var utcCaeDue = caeDueDate.HasValue
            ? (caeDueDate.Value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(caeDueDate.Value, DateTimeKind.Utc)
                : caeDueDate.Value.ToUniversalTime())
            : (DateTime?)null;

        var invoice = new PurchaseInvoice(
            Guid.NewGuid(),
            tenantId,
            invoiceType,
            pointOfSale,
            invoiceNumber,
            formatted,
            purchaseOrderId,
            purchaseReceptionId,
            supplierId,
            supplierName,
            supplierDocument,
            supplierTaxCondition,
            utcIssue,
            utcDue,
            currency,
            exchangeRate <= 0 ? 1.0m : exchangeRate,
            0,
            0,
            0,
            0,
            0,
            iibbPerception,
            ivaPerception,
            otherTaxes,
            0,
            cae,
            utcCaeDue,
            "Recorded",
            notes,
            DateTime.UtcNow);
        invoice.SupplierProvince = string.IsNullOrWhiteSpace(supplierProvince) ? null : supplierProvince.Trim();
        invoice.InternalTaxes = internalTaxes;
        invoice.GananciasPerception = gananciasPerception;
        invoice.MunicipalTaxes = municipalTaxes;
        return invoice;
    }

    public void AddItem(
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal vatRate,
        Guid? expenseCategoryId = null)
    {
        var net = Math.Round(quantity * unitPrice, 2);
        var vat = Math.Round(net * (vatRate / 100m), 2);
        var tot = net + vat;

        var item = new PurchaseInvoiceItem(
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
            tot);
        item.Categorize(expenseCategoryId);

        _items.Add(item);
        RecalculateTotals();
    }

    public void LinkReception(Guid receptionId)
    {
        PurchaseReceptionId = receptionId;
    }

    public void Cancel(string? reason = null)
    {
        if (string.Equals(Status, "Cancelled", StringComparison.OrdinalIgnoreCase))
            return;

        Status = "Cancelled";
        if (!string.IsNullOrWhiteSpace(reason))
        {
            var tag = $"Anulada: {reason.Trim()}";
            Notes = string.IsNullOrWhiteSpace(Notes) ? tag : $"{Notes}\n{tag}";
        }
    }

    public void RecalculateTotals()
    {
        Subtotal = _items.Sum(i => i.NetSubtotal);
        Iva21 = _items.Where(i => Math.Abs(i.VatRate - 21.0m) < 0.01m).Sum(i => i.VatAmount);
        Iva105 = _items.Where(i => Math.Abs(i.VatRate - 10.5m) < 0.01m).Sum(i => i.VatAmount);
        Iva27 = _items.Where(i => Math.Abs(i.VatRate - 27.0m) < 0.01m).Sum(i => i.VatAmount);
        ExemptAmount = _items.Where(i => i.VatRate == 0).Sum(i => i.NetSubtotal);
        // El exento ya está dentro del Subtotal (es la suma de todos los netos): no se vuelve a sumar.
        Total = Subtotal + Iva21 + Iva105 + Iva27 + IibbPerception + IvaPerception + OtherTaxes
                + InternalTaxes + GananciasPerception + MunicipalTaxes;
    }
}

public sealed class PurchaseInvoiceItem : Entity<Guid>
{
    private PurchaseInvoiceItem()
    {
    }

    public PurchaseInvoiceItem(
        Guid id,
        Guid purchaseInvoiceId,
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal vatRate,
        decimal netSubtotal,
        decimal vatAmount,
        decimal total)
        : base(id)
    {
        PurchaseInvoiceId = purchaseInvoiceId;
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

    public Guid PurchaseInvoiceId { get; private set; }
    public Guid? ProductId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public decimal Quantity { get; private set; }
    public decimal UnitPrice { get; private set; }
    public decimal VatRate { get; private set; }
    public decimal NetSubtotal { get; private set; }
    public decimal VatAmount { get; private set; }
    public decimal Total { get; private set; }
    /// <summary>Rubro de compra o gasto de la línea (<see cref="ExpenseCategory"/>).</summary>
    public Guid? ExpenseCategoryId { get; private set; }

    /// <summary>El rubro no cambia importes ni asiento: se puede asignar también a facturas ya cargadas.</summary>
    public void Categorize(Guid? expenseCategoryId) => ExpenseCategoryId = expenseCategoryId;
}

public sealed class PurchaseArcaVoucher : Entity<Guid>
{
    private PurchaseArcaVoucher()
    {
    }

    public PurchaseArcaVoucher(
        Guid id,
        TenantId tenantId,
        DateTime issueDate,
        string voucherType,
        int voucherTypeCode,
        string invoiceLetter,
        int pointOfSale,
        long voucherNumber,
        string formattedNumber,
        string? cae,
        string issuerDocType,
        string issuerCuit,
        string issuerName,
        string currencyCode,
        decimal exchangeRate,
        decimal netAmount,
        decimal exemptAmount,
        decimal vatAmount,
        decimal otherTaxes,
        decimal totalAmount,
        Guid? supplierId,
        Guid? purchaseInvoiceId,
        string importBatch,
        string status,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        IssueDate = issueDate;
        VoucherType = voucherType;
        VoucherTypeCode = voucherTypeCode;
        InvoiceLetter = invoiceLetter;
        PointOfSale = pointOfSale;
        VoucherNumber = voucherNumber;
        FormattedNumber = formattedNumber;
        Cae = cae;
        IssuerDocType = issuerDocType;
        IssuerCuit = issuerCuit;
        IssuerName = issuerName;
        CurrencyCode = currencyCode;
        ExchangeRate = exchangeRate;
        NetAmount = netAmount;
        ExemptAmount = exemptAmount;
        VatAmount = vatAmount;
        OtherTaxes = otherTaxes;
        TotalAmount = totalAmount;
        SupplierId = supplierId;
        PurchaseInvoiceId = purchaseInvoiceId;
        ImportBatch = importBatch;
        Status = status;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }
    public DateTime IssueDate { get; private set; }
    public string VoucherType { get; private set; } = string.Empty;
    public int VoucherTypeCode { get; private set; }
    public string InvoiceLetter { get; private set; } = "A";
    public int PointOfSale { get; private set; }
    public long VoucherNumber { get; private set; }
    public string FormattedNumber { get; private set; } = string.Empty;
    public string? Cae { get; private set; }
    public string IssuerDocType { get; private set; } = "80";
    public string IssuerCuit { get; private set; } = string.Empty;
    public string IssuerName { get; private set; } = string.Empty;
    public string CurrencyCode { get; private set; } = "ARS";
    public decimal ExchangeRate { get; private set; } = 1.0m;
    public decimal NetAmount { get; private set; }
    public decimal ExemptAmount { get; private set; }
    public decimal VatAmount { get; private set; }
    public decimal OtherTaxes { get; private set; }
    public decimal TotalAmount { get; private set; }
    public Guid? SupplierId { get; private set; }
    public Guid? PurchaseInvoiceId { get; private set; }
    public string ImportBatch { get; private set; } = string.Empty;
    public string Status { get; private set; } = "Pending"; // Pending, Registered, Ignored
    public DateTime CreatedAtUtc { get; private set; }

    public static PurchaseArcaVoucher Create(
        TenantId tenantId,
        DateTime issueDate,
        string voucherType,
        int voucherTypeCode,
        string invoiceLetter,
        int pointOfSale,
        long voucherNumber,
        string? cae,
        string issuerDocType,
        string issuerCuit,
        string issuerName,
        string currencyCode,
        decimal exchangeRate,
        decimal netAmount,
        decimal exemptAmount,
        decimal vatAmount,
        decimal otherTaxes,
        decimal totalAmount,
        Guid? supplierId,
        string importBatch)
    {
        var formatted = $"{pointOfSale:D4}-{voucherNumber:D8}";
        var utcIssue = issueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(issueDate, DateTimeKind.Utc)
            : issueDate.ToUniversalTime();

        return new PurchaseArcaVoucher(
            Guid.NewGuid(),
            tenantId,
            utcIssue,
            voucherType,
            voucherTypeCode,
            invoiceLetter,
            pointOfSale,
            voucherNumber,
            formatted,
            cae,
            issuerDocType,
            issuerCuit,
            issuerName,
            string.IsNullOrWhiteSpace(currencyCode) ? "ARS" : currencyCode,
            exchangeRate <= 0 ? 1.0m : exchangeRate,
            netAmount,
            exemptAmount,
            vatAmount,
            otherTaxes,
            totalAmount,
            supplierId,
            null,
            importBatch,
            "Pending",
            DateTime.UtcNow);
    }

    public void LinkPurchase(Guid purchaseInvoiceId)
    {
        PurchaseInvoiceId = purchaseInvoiceId;
        Status = "Registered";
    }

    public void SetSupplier(Guid supplierId)
    {
        SupplierId = supplierId;
    }

    public void Ignore()
    {
        Status = "Ignored";
    }

    public void UpdateImportedData(
        string issuerName,
        string voucherType,
        int voucherTypeCode,
        string invoiceLetter,
        string currencyCode,
        decimal exchangeRate,
        decimal netAmount,
        decimal exemptAmount,
        decimal vatAmount,
        decimal otherTaxes,
        decimal totalAmount)
    {
        IssuerName = issuerName;
        VoucherType = voucherType;
        VoucherTypeCode = voucherTypeCode;
        InvoiceLetter = invoiceLetter;
        CurrencyCode = string.IsNullOrWhiteSpace(currencyCode) ? "ARS" : currencyCode;
        ExchangeRate = exchangeRate <= 0 ? 1.0m : exchangeRate;
        NetAmount = netAmount;
        ExemptAmount = exemptAmount;
        VatAmount = vatAmount;
        OtherTaxes = otherTaxes;
        TotalAmount = totalAmount;
    }
}
