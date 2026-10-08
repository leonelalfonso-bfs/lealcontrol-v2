using System;
using LealControl.Modules.Communications.Infrastructure.Services;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

public sealed class Conversation
{
    private Conversation() { }

    public Guid Id { get; private set; }
    public Guid TenantId { get; private set; }
    public string ChannelType { get; private set; } = CommunicationChannelHelper.Email;
    public string ThreadKey { get; private set; } = string.Empty;
    public string ParticipantId { get; private set; } = string.Empty;
    public string ParticipantName { get; private set; } = string.Empty;
    public string? ParticipantEmail { get; private set; }
    public string? ParticipantPhone { get; private set; }
    public string? LastMessagePreview { get; private set; }
    public DateTime LastMessageAtUtc { get; private set; }
    public int UnreadCount { get; private set; }
    public Guid? RelatedLeadId { get; private set; }
    public Guid? RelatedCustomerId { get; private set; }
    public Guid? RelatedQuoteId { get; private set; }
    public Guid? RelatedOrderId { get; private set; }
    public Guid? RelatedInvoiceId { get; private set; }
    public Guid? RelatedOpportunityId { get; private set; }
    /// <summary>Descartada con "ignorar este contacto": lo que llegue después no vuelve a la bandeja.</summary>
    public bool IgnoreParticipant { get; private set; }
    public string Status { get; private set; } = "open";
    public Guid? AssignedToUserId { get; private set; }
    public bool SuggestionDismissed { get; private set; }
    public DateTime? LastIncomingAtUtc { get; private set; }
    public DateTime CreatedAtUtc { get; private set; }
    public DateTime UpdatedAtUtc { get; private set; }

    public static Conversation Create(
        Guid tenantId,
        string channelType,
        string threadKey,
        string participantId,
        string participantName,
        string? participantEmail,
        string? participantPhone,
        string messagePreview,
        DateTime occurredAtUtc,
        EmailDirection direction)
    {
        var now = DateTime.UtcNow;
        var conv = new Conversation
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ChannelType = channelType,
            ThreadKey = threadKey,
            ParticipantId = participantId,
            ParticipantName = string.IsNullOrWhiteSpace(participantName) ? participantId : participantName,
            ParticipantEmail = participantEmail,
            ParticipantPhone = participantPhone,
            LastMessagePreview = messagePreview,
            LastMessageAtUtc = occurredAtUtc,
            UnreadCount = direction == EmailDirection.Incoming ? 1 : 0,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };
        return conv;
    }

    public void RecordMessage(EmailDirection direction, string preview, DateTime occurredAtUtc, string? participantName)
    {
        if (!string.IsNullOrWhiteSpace(participantName) && !IsGenericName(participantName))
        {
            ParticipantName = participantName;
        }

        if (occurredAtUtc >= LastMessageAtUtc)
        {
            LastMessageAtUtc = occurredAtUtc;
            LastMessagePreview = preview;
        }

        if (direction == EmailDirection.Incoming)
        {
            UnreadCount++;
            LastIncomingAtUtc = occurredAtUtc;
        }

        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void MarkRead()
    {
        UnreadCount = 0;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void LinkLead(Guid leadId)
    {
        RelatedLeadId = leadId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void LinkCustomer(Guid customerId)
    {
        RelatedCustomerId = customerId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void LinkOpportunity(Guid opportunityId)
    {
        RelatedOpportunityId = opportunityId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public const string DiscardedStatus = "discarded";

    public bool IsDiscarded => Status == DiscardedStatus;

    /// <summary>Sale de la bandeja (no del teléfono). El contenido de los mensajes se borra aparte.</summary>
    public void Discard(bool ignoreParticipant)
    {
        Status = DiscardedStatus;
        IgnoreParticipant = ignoreParticipant;
        UnreadCount = 0;
        LastMessagePreview = null;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    /// <summary>
    /// Llega un mensaje a una conversación descartada: vuelve a la bandeja, salvo que se haya
    /// pedido ignorar el contacto. Devuelve false si el mensaje se tiene que guardar sin contenido.
    /// </summary>
    public bool AcceptMessageAfterDiscard(EmailDirection direction)
    {
        if (!IsDiscarded) return true;
        if (IgnoreParticipant) return false;
        if (direction != EmailDirection.Incoming) return false;
        Status = "open";
        UpdatedAtUtc = DateTime.UtcNow;
        return true;
    }

    public void LinkDocument(Guid? quoteId, Guid? orderId, Guid? invoiceId)
    {
        if (quoteId.HasValue) RelatedQuoteId = quoteId;
        if (orderId.HasValue) RelatedOrderId = orderId;
        if (invoiceId.HasValue) RelatedInvoiceId = invoiceId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void UpdateParticipantContact(string? email, string? phone)
    {
        if (!string.IsNullOrWhiteSpace(email)) ParticipantEmail = email;
        if (!string.IsNullOrWhiteSpace(phone)) ParticipantPhone = phone;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void AssignTo(Guid? userId)
    {
        AssignedToUserId = userId;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void SetStatus(string status)
    {
        Status = string.IsNullOrWhiteSpace(status) ? "open" : status.Trim().ToLowerInvariant();
        UpdatedAtUtc = DateTime.UtcNow;
    }

    public void DismissSuggestion()
    {
        SuggestionDismissed = true;
        UpdatedAtUtc = DateTime.UtcNow;
    }

    private static bool IsGenericName(string name)
    {
        var n = name.ToLowerInvariant();
        return n.Contains("oficial") || n.StartsWith("contacto ") || n == "usuario" || n == "desconocido";
    }
}
