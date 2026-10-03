using LealControl.BuildingBlocks.Tenancy;

namespace LealControl.Modules.Sales.Domain.Invoices;

// Persiste el número ANTES de llamar a FECAESolicitar. Una respuesta perdida
// obliga a consultar FECompConsultar sobre este mismo número.
public sealed class FiscalAuthorizationAttempt
{
    private FiscalAuthorizationAttempt() { }

    public Guid Id { get; private set; }
    public TenantId TenantId { get; private set; }
    public Guid InvoiceId { get; private set; }
    public int PointOfSale { get; private set; }
    public int VoucherType { get; private set; }
    public long VoucherNumber { get; private set; }
    public string IssuerCuit { get; private set; } = string.Empty;
    public bool Production { get; private set; }
    public string RequestHash { get; private set; } = string.Empty;
    public string RecipientDocument { get; private set; } = string.Empty;
    public decimal Total { get; private set; }
    public string Status { get; private set; } = "Reserved";
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime? ResolvedAtUtc { get; private set; }
    public string? Cae { get; private set; }
    public DateTime? CaeDueDate { get; private set; }

    public static FiscalAuthorizationAttempt Reserve(
        TenantId tenantId, Guid invoiceId, int pointOfSale, int voucherType,
        long voucherNumber, string issuerCuit, bool production, string requestHash, string recipientDocument, decimal total)
    {
        if (invoiceId == Guid.Empty || pointOfSale <= 0 || voucherType <= 0 || voucherNumber is < 1 or > 99_999_999
            || issuerCuit.Length != 11 || !issuerCuit.All(ch => ch is >= '0' and <= '9')
            || requestHash.Length != 64 || !requestHash.All(Uri.IsHexDigit)
            || string.IsNullOrWhiteSpace(recipientDocument) || total <= 0)
            throw new ArgumentException("La reserva fiscal contiene datos inválidos.");

        return new FiscalAuthorizationAttempt
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            InvoiceId = invoiceId,
            PointOfSale = pointOfSale,
            VoucherType = voucherType,
            VoucherNumber = voucherNumber,
            IssuerCuit = issuerCuit,
            Production = production,
            RequestHash = requestHash.ToLowerInvariant(),
            RecipientDocument = recipientDocument,
            Total = total,
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    // Debe confirmarse en base antes de iniciar la única solicitud a WSFE.
    // Tras este punto un corte deja el resultado incierto: consultar, nunca reenviar.
    public void MarkDispatching()
    {
        if (Status != "Reserved") throw new InvalidOperationException("Solo una reserva sin enviar puede iniciar el envío fiscal.");
        Status = "Pending";
    }

    public void MarkUnknown()
    {
        if (Status != "Pending") throw new InvalidOperationException("Solo una solicitud pendiente puede quedar indeterminada.");
        Status = "Unknown";
    }

    public void Confirm(string cae, DateTime caeDueDate)
    {
        if (Status is not ("Pending" or "Unknown") || cae.Length != 14 || !cae.All(char.IsDigit))
            throw new InvalidOperationException("La confirmación fiscal no es válida para esta reserva.");
        Status = "Confirmed";
        Cae = cae;
        CaeDueDate = caeDueDate.Kind == DateTimeKind.Unspecified
            ? DateTime.SpecifyKind(caeDueDate, DateTimeKind.Utc)
            : caeDueDate.ToUniversalTime();
        ResolvedAtUtc = DateTime.UtcNow;
    }

    public void Reject()
    {
        if (Status != "Pending") throw new InvalidOperationException("No se puede rechazar una reserva indeterminada.");
        Status = "Rejected";
        ResolvedAtUtc = DateTime.UtcNow;
    }
}
