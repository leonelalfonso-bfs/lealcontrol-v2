namespace LealControl.Modules.Communications.Infrastructure.Services;

public static class CommunicationChannelHelper
{
    public const string Email = "email";
    public const string Instagram = "instagram";
    public const string Facebook = "facebook";

    public static string InstagramThreadKey(string participantId) => $"ig_{participantId}";

    public static string FacebookThreadKey(string participantId) => $"fb_{participantId}";

    public static string MetaInternetId(string channelType, string messageId)
    {
        var prefix = channelType.Equals(Instagram, StringComparison.OrdinalIgnoreCase) ? "ig" : "fb";
        return $"meta_{prefix}_{messageId}";
    }

    public static bool IsSameMetaMessageId(string? storedInternetId, string messageId)
    {
        if (string.IsNullOrWhiteSpace(storedInternetId) || string.IsNullOrWhiteSpace(messageId)) return false;
        return storedInternetId == MetaInternetId(Facebook, messageId)
            || storedInternetId == MetaInternetId(Instagram, messageId);
    }

    public static string MetaThreadKey(string channelType, string participantId)
    {
        return channelType.Equals(Instagram, StringComparison.OrdinalIgnoreCase)
            ? InstagramThreadKey(participantId)
            : FacebookThreadKey(participantId);
    }

    public static string InferChannelFromThreadKey(string threadKey, string internetMessageId)
    {
        if (threadKey.StartsWith("ig_", StringComparison.Ordinal) || threadKey.StartsWith("meta_ig_", StringComparison.Ordinal)
            || internetMessageId.StartsWith("meta_ig_", StringComparison.Ordinal))
            return Instagram;
        if (threadKey.StartsWith("fb_", StringComparison.Ordinal) || threadKey.StartsWith("meta_fb_", StringComparison.Ordinal)
            || internetMessageId.StartsWith("meta_fb_", StringComparison.Ordinal))
            return Facebook;
        return Email;
    }
}
