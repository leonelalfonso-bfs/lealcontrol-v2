using System.Security.Cryptography;
using System.Text;

namespace LealControl.Modules.Communications.Infrastructure.Http;

public static class MediaAccessTokens
{
    public static string Create(Guid mediaId, string secret, TimeSpan lifetime)
    {
        var exp = DateTimeOffset.UtcNow.Add(lifetime).ToUnixTimeSeconds();
        var sig = Sign(mediaId, exp, secret);
        return $"{exp}.{sig}";
    }

    public static bool TryValidate(Guid mediaId, string? token, string secret)
    {
        if (string.IsNullOrWhiteSpace(token) || string.IsNullOrWhiteSpace(secret))
        {
            return false;
        }

        var parts = token.Split('.', 2);
        if (parts.Length != 2 || !long.TryParse(parts[0], out var exp))
        {
            return false;
        }

        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp)
        {
            return false;
        }

        var expected = Sign(mediaId, exp, secret);
        var a = Encoding.UTF8.GetBytes(expected);
        var b = Encoding.UTF8.GetBytes(parts[1]);
        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }

    private static string Sign(Guid mediaId, long exp, string secret)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var bytes = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{mediaId:N}.{exp}"));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
