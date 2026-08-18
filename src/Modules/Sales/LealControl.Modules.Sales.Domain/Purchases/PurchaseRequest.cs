using System;
using System.Collections.Generic;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Purchases;

public sealed class PurchaseRequest : Entity<Guid>
{
    private readonly List<PurchaseRequestItem> _items = new();
    private readonly List<PurchaseQuotation> _quotations = new();

    private PurchaseRequest()
    {
    }

    public PurchaseRequest(
        Guid id,
        TenantId tenantId,
        string requestNumber,
        string requestedBy,
        string department,
        string priority,
        DateTime? requiredDate,
        string reason,
        string status,
        string? rejectionReason,
        Guid? purchaseOrderId,
        DateTime createdAtUtc,
        DateTime updatedAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        RequestNumber = requestNumber;
        RequestedBy = requestedBy;
        Department = department;
        Priority = priority;
        RequiredDate = requiredDate;
        Reason = reason;
        Status = status;
        RejectionReason = rejectionReason;
        PurchaseOrderId = purchaseOrderId;
        CreatedAtUtc = createdAtUtc;
        UpdatedAtUtc = updatedAtUtc;
    }

    public TenantId TenantId { get; private set; }
    public string RequestNumber { get; private set; } = string.Empty;
    public string RequestedBy { get; private set; } = string.Empty;
    public string Department { get; private set; } = "Operaciones";
    public string Priority { get; private set; } = "Normal"; // Low, Normal, High, Urgent
    public DateTime? RequiredDate { get; private set; }
    public string Reason { get; private set; } = string.Empty;
    public string Status { get; private set; } = "Pending"; // Pending, Approved, Ordered, Rejected, Cancelled
    public string? RejectionReason { get; private set; }
    public Guid? PurchaseOrderId { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public IReadOnlyList<PurchaseRequestItem> Items => _items.AsReadOnly();
    public IReadOnlyList<PurchaseQuotation> Quotations => _quotations.AsReadOnly();

    public static PurchaseRequest Create(
        TenantId tenantId,
        string requestNumber,
        string requestedBy,
        string department,
        string priority,
        DateTime? requiredDate,
        string reason)
    {
        var now = DateTime.UtcNow;
        var utcRequired = requiredDate.HasValue
            ? (requiredDate.Value.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(requiredDate.Value, DateTimeKind.Utc)
                : requiredDate.Value.ToUniversalTime())
            : (DateTime?)null;

        return new PurchaseRequest(
            Guid.NewGuid(),
            tenantId,
            requestNumber,
            requestedBy,
            string.IsNullOrWhiteSpace(department) ? "Operaciones" : department,
            string.IsNullOrWhiteSpace(priority) ? "Normal" : priority,
            utcRequired,
            reason,
            "Pending",
            null,
            null,
            now,
            now);
    }

    public void AddItem(
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        string unitMeasure = "u",
        decimal estimatedUnitPrice = 0,
        string? notes = null)
    {
        var item = new PurchaseRequestItem(
            Guid.NewGuid(),
            Id,
            productId,
            code,
            description,
            quantity,
            unitMeasure,
            estimatedUnitPrice,
            notes);

        _items.Add(item);
    }

    public void AddQuotation(
        Guid supplierId,
        string supplierName,
        string? supplierQuoteRef,
        DateTime issueDate,
        string currency,
        decimal exchangeRate,
        decimal netAmount,
        decimal taxPercent,
        decimal taxAmount,
        decimal totalAmount,
        string? deliveryTime,
        string? paymentTerms,
        string? notes,
        string? attachmentBase64,
        string? attachmentFileName)
    {
        var utcIssue = issueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(issueDate, DateTimeKind.Utc)
            : issueDate.ToUniversalTime();

        var q = new PurchaseQuotation(
            Guid.NewGuid(),
            TenantId,
            Id,
            supplierId,
            supplierName,
            supplierQuoteRef,
            utcIssue,
            currency,
            exchangeRate,
            netAmount,
            taxPercent,
            taxAmount,
            totalAmount,
            deliveryTime,
            paymentTerms,
            notes,
            attachmentBase64,
            attachmentFileName,
            false,
            DateTime.UtcNow);

        _quotations.Add(q);
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SelectQuotation(Guid quotationId)
    {
        foreach (var q in _quotations)
        {
            if (q.Id == quotationId)
            {
                q.MarkSelected(true);
            }
            else
            {
                q.MarkSelected(false);
            }
        }
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Approve()
    {
        Status = "Approved";
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void Reject(string reason)
    {
        Status = "Rejected";
        RejectionReason = reason;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void LinkPurchaseOrder(Guid purchaseOrderId)
    {
        PurchaseOrderId = purchaseOrderId;
        Status = "Ordered";
        UpdatedAtUtc = DateTime.UtcNow;
    }
}

public sealed class PurchaseRequestItem : Entity<Guid>
{
    private PurchaseRequestItem()
    {
    }

    public PurchaseRequestItem(
        Guid id,
        Guid purchaseRequestId,
        Guid? productId,
        string code,
        string description,
        decimal quantity,
        string unitMeasure,
        decimal estimatedUnitPrice,
        string? notes)
        : base(id)
    {
        PurchaseRequestId = purchaseRequestId;
        ProductId = productId;
        Code = code;
        Description = description;
        Quantity = quantity;
        UnitMeasure = unitMeasure;
        EstimatedUnitPrice = estimatedUnitPrice;
        Notes = notes;
    }

    public Guid PurchaseRequestId { get; private set; }
    public Guid? ProductId { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public decimal Quantity { get; private set; }
    public string UnitMeasure { get; private set; } = "u";
    public decimal EstimatedUnitPrice { get; private set; }
    public string? Notes { get; private set; }
}

public sealed class PurchaseQuotation : Entity<Guid>
{
    private PurchaseQuotation()
    {
    }

    public PurchaseQuotation(
        Guid id,
        TenantId tenantId,
        Guid purchaseRequestId,
        Guid supplierId,
        string supplierName,
        string? supplierQuoteRef,
        DateTime issueDate,
        string currency,
        decimal exchangeRate,
        decimal netAmount,
        decimal taxPercent,
        decimal taxAmount,
        decimal totalAmount,
        string? deliveryTime,
        string? paymentTerms,
        string? notes,
        string? attachmentBase64,
        string? attachmentFileName,
        bool isSelected,
        DateTime createdAtUtc)
        : base(id)
    {
        TenantId = tenantId;
        PurchaseRequestId = purchaseRequestId;
        SupplierId = supplierId;
        SupplierName = supplierName;
        SupplierQuoteRef = supplierQuoteRef;
        IssueDate = issueDate;
        Currency = currency;
        ExchangeRate = exchangeRate;
        NetAmount = netAmount;
        TaxPercent = taxPercent;
        TaxAmount = taxAmount;
        TotalAmount = totalAmount;
        DeliveryTime = deliveryTime;
        PaymentTerms = paymentTerms;
        Notes = notes;
        AttachmentBase64 = attachmentBase64;
        AttachmentFileName = attachmentFileName;
        IsSelected = isSelected;
        CreatedAtUtc = createdAtUtc;
    }

    public TenantId TenantId { get; private set; }
    public Guid PurchaseRequestId { get; private set; }
    public Guid SupplierId { get; private set; }
    public string SupplierName { get; private set; } = string.Empty;
    public string? SupplierQuoteRef { get; private set; }
    public DateTime IssueDate { get; private set; }
    public string Currency { get; private set; } = "ARS";
    public decimal ExchangeRate { get; private set; } = 1;
    public decimal NetAmount { get; private set; }
    public decimal TaxPercent { get; private set; } = 21;
    public decimal TaxAmount { get; private set; }
    public decimal TotalAmount { get; private set; }
    public string? DeliveryTime { get; private set; }
    public string? PaymentTerms { get; private set; }
    public string? Notes { get; private set; }
    public string? AttachmentBase64 { get; private set; }
    public string? AttachmentFileName { get; private set; }
    public bool IsSelected { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }

    public void MarkSelected(bool selected)
    {
        IsSelected = selected;
    }
}
