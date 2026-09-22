using System;
using LealControl.Modules.Accounting.Contracts.Posting;

namespace LealControl.Modules.Accounting.Infrastructure;

/// <summary>
/// Normaliza tipos fiscales de comprobantes (A/B/C, NC_A, ND_B…) a
/// <see cref="AccountingDocumentTypes"/> para selección de asientos modelo.
/// </summary>
public static class FiscalDocumentTypeResolver
{
    /// <summary>
    /// Determina el tipo contable por InvoiceType (NC_A, ND_B, A, B…) y solo como fallback por el número.
    /// No inferir la letra desde la condición fiscal del tercero: si el request trae NC_A, es CreditNoteA.
    /// </summary>
    public static string Resolve(string? invoiceType, string? invoiceNumber = null)
    {
        var type = (invoiceType ?? string.Empty).Trim();
        if (type.Length == 0)
            return ResolveFromNumber(invoiceNumber);

        // Aliases ya normalizados
        var compact = type.Replace("-", "_").Replace(" ", "").ToUpperInvariant();
        return compact switch
        {
            "A" or "FA" or "INVOICEA" or "FACTURAA" => AccountingDocumentTypes.InvoiceA,
            "B" or "FB" or "INVOICEB" or "FACTURAB" => AccountingDocumentTypes.InvoiceB,
            "C" or "FC" or "INVOICEC" or "FACTURAC" => AccountingDocumentTypes.InvoiceC,
            "NC_A" or "NCA" or "CREDITNOTEA" => AccountingDocumentTypes.CreditNoteA,
            "NC_B" or "NCB" or "CREDITNOTEB" => AccountingDocumentTypes.CreditNoteB,
            "NC_C" or "NCC" or "CREDITNOTEC" => AccountingDocumentTypes.CreditNoteC,
            "ND" or "ND_A" or "NDA" or "DEBITNOTE" or "DEBITNOTEA" => AccountingDocumentTypes.DebitNote,
            "ND_B" or "NDB" or "DEBITNOTEB" => AccountingDocumentTypes.DebitNote,
            "ND_C" or "NDC" or "DEBITNOTEC" => AccountingDocumentTypes.DebitNote,
            _ => ResolveLoose(type, invoiceNumber)
        };
    }

    private static string ResolveLoose(string type, string? invoiceNumber)
    {
        // Prefijos NC/ND: la letra va después del prefijo (NC_A, NC-A, NCA).
        // Nunca usar Contains('C') sobre "NC…" — matchea la C de "NC" y convierte NC_A en CreditNoteC.
        if (type.StartsWith("NC", StringComparison.OrdinalIgnoreCase))
        {
            var letter = LetterAfterPrefix(type, "NC");
            return letter switch
            {
                'B' => AccountingDocumentTypes.CreditNoteB,
                'C' => AccountingDocumentTypes.CreditNoteC,
                _ => AccountingDocumentTypes.CreditNoteA
            };
        }

        if (type.StartsWith("ND", StringComparison.OrdinalIgnoreCase))
            return AccountingDocumentTypes.DebitNote;

        if (type.StartsWith("FA", StringComparison.OrdinalIgnoreCase)
            || type.Equals("Factura A", StringComparison.OrdinalIgnoreCase))
            return AccountingDocumentTypes.InvoiceA;
        if (type.StartsWith("FB", StringComparison.OrdinalIgnoreCase))
            return AccountingDocumentTypes.InvoiceB;
        if (type.StartsWith("FC", StringComparison.OrdinalIgnoreCase))
            return AccountingDocumentTypes.InvoiceC;

        // Letra suelta o embebida al final (…A / …B / …C) sin prefijo NC.
        var lastLetter = type.Reverse().FirstOrDefault(char.IsLetter);
        return char.ToUpperInvariant(lastLetter) switch
        {
            'B' => AccountingDocumentTypes.InvoiceB,
            'C' => AccountingDocumentTypes.InvoiceC,
            'A' => AccountingDocumentTypes.InvoiceA,
            _ => ResolveFromNumber(invoiceNumber)
        };
    }

    private static string ResolveFromNumber(string? invoiceNumber)
    {
        var number = invoiceNumber ?? string.Empty;
        if (number.Contains("NC", StringComparison.OrdinalIgnoreCase))
            return AccountingDocumentTypes.CreditNoteA;
        return AccountingDocumentTypes.InvoiceA;
    }

    /// <summary>Extrae la letra fiscal después del prefijo NC/ND (ignora _ y -).</summary>
    private static char LetterAfterPrefix(string type, string prefix)
    {
        var rest = type[prefix.Length..].TrimStart('_', '-', ' ', '.');
        return rest.Length > 0 ? char.ToUpperInvariant(rest[0]) : '\0';
    }
}
