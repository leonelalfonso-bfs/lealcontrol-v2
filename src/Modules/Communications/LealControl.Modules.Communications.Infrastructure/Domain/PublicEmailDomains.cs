using System;
using System.Collections.Generic;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

/// <summary>
/// Lista única de dominios de correo públicos/genéricos (webmail e ISPs) compartida por la bandeja
/// y el lector de mails con IA para no vincular clientes por dominio en casillas personales.
/// </summary>
public static class PublicEmailDomains
{
    public static readonly HashSet<string> All = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com", "googlemail.com", "hotmail.com", "hotmail.com.ar", "hotmail.es",
        "outlook.com", "outlook.com.ar", "outlook.es", "live.com", "live.com.ar", "msn.com",
        "yahoo.com", "yahoo.com.ar", "yahoo.es", "icloud.com", "me.com", "mac.com",
        "proton.me", "protonmail.com", "aol.com", "gmx.com", "yandex.com", "mail.com", "zoho.com",
        "fibertel.com.ar", "speedy.com.ar", "arnet.com.ar", "ciudad.com.ar", "infovia.com.ar",
        "sinectis.com.ar", "telecom.com.ar", "uolsinectis.com.ar", "fullzero.com.ar", "datafull.com"
    };

    public static bool IsPublic(string? domain) =>
        !string.IsNullOrWhiteSpace(domain) && All.Contains(domain.Trim());

    public static string? ExtractCorporateDomain(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return null;
        var at = email.LastIndexOf('@');
        if (at <= 0 || at >= email.Length - 1) return null;
        var domain = email[(at + 1)..].Trim().ToLowerInvariant();
        if (!domain.Contains('.') || All.Contains(domain)) return null;
        return domain;
    }
}
