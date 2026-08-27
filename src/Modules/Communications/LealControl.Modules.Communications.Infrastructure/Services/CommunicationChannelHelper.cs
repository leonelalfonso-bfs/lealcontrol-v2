using System.Text.RegularExpressions;

namespace LealControl.Modules.Communications.Infrastructure.Services;

public static class CommunicationChannelHelper
{
    public const string Email = "email";
    public const string WhatsApp = "whatsapp";
    public const string Instagram = "instagram";
    public const string Facebook = "facebook";

    public static string NormalizeWhatsAppPhone(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return string.Empty;
        var digits = Regex.Replace(input, @"[^\d]", "");
        if (string.IsNullOrWhiteSpace(digits)) return string.Empty;

        if (digits.StartsWith("549", StringComparison.Ordinal) && digits.Length >= 12)
            return digits;

        if (digits.StartsWith("54", StringComparison.Ordinal) && digits.Length >= 11 && !digits.StartsWith("549", StringComparison.Ordinal))
            return "549" + digits[2..];

        if (digits.Length == 10)
            return "549" + digits;

        return digits;
    }

    public static string ExtractWhatsAppParticipantId(string remoteJid)
    {
        if (string.IsNullOrWhiteSpace(remoteJid)) return string.Empty;
        var localPart = remoteJid.Split('@')[0].Split(':')[0];
        if (remoteJid.Contains("@lid", StringComparison.OrdinalIgnoreCase))
            return $"lid_{localPart}";

        return NormalizeWhatsAppPhone(localPart);
    }

    public static string WhatsAppThreadKey(string participantId) => $"wa_{participantId}";

    public static string WhatsAppInternetId(string messageId) => $"wa_{messageId}";

    public static string InstagramThreadKey(string participantId) => $"ig_{participantId}";

    public static string FacebookThreadKey(string participantId) => $"fb_{participantId}";

    public static string MetaInternetId(string channelType, string messageId)
    {
        var prefix = channelType.Equals(Instagram, StringComparison.OrdinalIgnoreCase) ? "ig" : "fb";
        return $"meta_{prefix}_{messageId}";
    }

    public static string MetaThreadKey(string channelType, string participantId)
    {
        return channelType.Equals(Instagram, StringComparison.OrdinalIgnoreCase)
            ? InstagramThreadKey(participantId)
            : FacebookThreadKey(participantId);
    }

    public static string FormatWhatsAppContactDisplay(string? contactName, string participantId)
    {
        if (!string.IsNullOrWhiteSpace(contactName) && !contactName.Equals(participantId, StringComparison.OrdinalIgnoreCase))
            return $"{contactName} (+{participantId})";

        return $"+{participantId}";
    }

    public static string InferChannelFromThreadKey(string threadKey, string internetMessageId)
    {
        if (threadKey.StartsWith("wa_", StringComparison.Ordinal) || internetMessageId.StartsWith("wa_", StringComparison.Ordinal))
            return WhatsApp;
        if (threadKey.StartsWith("ig_", StringComparison.Ordinal) || threadKey.StartsWith("meta_ig_", StringComparison.Ordinal)
            || internetMessageId.StartsWith("meta_ig_", StringComparison.Ordinal))
            return Instagram;
        if (threadKey.StartsWith("fb_", StringComparison.Ordinal) || threadKey.StartsWith("meta_fb_", StringComparison.Ordinal)
            || internetMessageId.StartsWith("meta_fb_", StringComparison.Ordinal))
            return Facebook;
        return Email;
    }
}
