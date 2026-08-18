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
        string? notes)
    {
        var formatted = $"{pointOfSale:D4}-{invoiceNumber:D8}";
        var utcDueDate = dueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(dueDate, DateTimeKind.Utc)
            : dueDate.ToUniversalTime();

        return new Invoice(
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
            DateTime.UtcNow,
            utcDueDate,
            currency,
            exchangeRate <= 0 ? 1.0m : exchangeRate,
            0, 0, 0, 0, 0, 0, 0,
            null, null, null,
            "Draft",
            null,
            notes,
            DateTime.UtcNow);
    }

    public void AddItem(
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        decimal unitPrice,
        decimal vatRate)
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
            tot);

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

    public void Authorize(string cae, DateTime caeDueDate, string qrUrl, string? rawResponse)
    {
        var utcCaeDue = caeDueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(caeDueDate, DateTimeKind.Utc)
            : caeDueDate.ToUniversalTime();

        Cae = cae;
        CaeDueDate = utcCaeDue;
        QrUrl = qrUrl;
        AfipRawResponse = rawResponse;
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
        decimal total)
        : base(id)
    {
        InvoiceId = invoiceId;
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
