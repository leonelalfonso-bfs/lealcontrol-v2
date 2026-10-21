using System.Text.RegularExpressions;

namespace LealControl.Modules.Finance.Infrastructure;

/// <summary>
/// Textos de los extractos de Galicia, Santander y BBVA que son gastos, impuestos o inversiones del banco (nota 69, F1).
/// Se usan solo cuando ninguna regla de la empresa reconoce el movimiento; las reglas propias siempre mandan.
/// </summary>
public static partial class BankChargeClassifier
{
    private static readonly (Regex Pattern, string ConceptCode)[] Known =
    [
        (Taxes(), "IMPUESTO_RETENCION"),
        (Fees(), "COMISION"),
        (Interest(), "INTERES_PAGADO"),
        (Subscription(), "INVERSION_SUSCRIPCION"),
        (Redemption(), "INVERSION_RESCATE"),
        (Payroll(), "SUELDOS")
    ];

    [GeneratedRegex(@"acreditamiento\s+de\s+haberes|pago\s+de\s+haberes", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Payroll();

    // Impuesto a los débitos y créditos (Ley 25.413), SIRCREB y otras retenciones o percepciones, IVA de gastos bancarios.
    [GeneratedRegex(@"ley\s*25\.?413|imp\.?\s*(deb|cre)\.?\s*ley|impuesto\s+ley|sircreb|ing\.?\s*brutos|percep|rg\s*2408|transfisc|^iva\b|iva\s+tasa|^percepcion", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Taxes();

    [GeneratedRegex(@"^com\.?\s|comision|g\.?\s*de\s*echeq|com\s+mant|mantenimiento\s+de\s+cuenta", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Fees();

    [GeneratedRegex(@"intereses?\s+sobre\s+saldos?\s+deudor|interes(es)?\s+deudor", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Interest();

    [GeneratedRegex(@"suscripci[oó]n\s+(fima|fci|fondo)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Subscription();

    [GeneratedRegex(@"rescate\s+(fima|fci|fondo)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex Redemption();

    public static string? Classify(string? description) =>
        Known.FirstOrDefault(k => k.Pattern.IsMatch(description ?? "")).ConceptCode;
}
