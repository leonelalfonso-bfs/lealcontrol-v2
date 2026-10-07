using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Query.SqlExpressions;

namespace LealControl.BuildingBlocks.Persistence;

/// <summary>
/// Regla única de búsqueda de los listados y selectores: sin distinguir mayúsculas ni acentos,
/// varias palabras en cualquier orden (todas deben aparecer) y números (CUIT, teléfono)
/// comparados solo por sus dígitos. El frontend aplica la misma regla en <c>lib/search.ts</c>.
/// </summary>
public static class SearchText
{
    // Mismo mapa que translate() en SQL: C# y Postgres pliegan el texto exactamente igual.
    private const string AccentFrom = "áàäâãéèëêíìïîóòöôõúùüûñç";
    private const string AccentTo = "aaaaaeeeeiiiiooooouuuunc";

    /// <summary>
    /// Minúsculas y sin acentos. En consultas EF se traduce a
    /// <c>translate(lower(x), 'áà…', 'aa…')</c>; requiere <see cref="AddSearchTextFunctions"/>.
    /// </summary>
    public static string Fold(string? value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return string.Empty;
        }

        var builder = new StringBuilder(value.Length);
        foreach (var ch in value.ToLowerInvariant())
        {
            var index = AccentFrom.IndexOf(ch);
            builder.Append(index >= 0 ? AccentTo[index] : ch);
        }

        return builder.ToString();
    }

    /// <summary>Palabras de la búsqueda, plegadas. Vacío si no hay nada que buscar.</summary>
    public static IReadOnlyList<SearchToken> Parse(string? search)
    {
        if (string.IsNullOrWhiteSpace(search))
        {
            return [];
        }

        return search
            .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(word => new SearchToken(Fold(word), new string(word.Where(char.IsAsciiDigit).ToArray())))
            .Where(token => token.Text.Length > 0)
            .Distinct()
            .ToList();
    }

    /// <summary>Registra la traducción de <see cref="Fold"/> en el modelo de un DbContext.</summary>
    public static ModelBuilder AddSearchTextFunctions(this ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasDbFunction(typeof(SearchText).GetMethod(nameof(Fold), [typeof(string)])!)
            .HasTranslation(arguments =>
            {
                var value = arguments[0];
                var mapping = value.TypeMapping;
                var lower = new SqlFunctionExpression(
                    "lower", [value], nullable: true, argumentsPropagateNullability: [true], typeof(string), mapping);
                return new SqlFunctionExpression(
                    "translate",
                    [
                        lower,
                        new SqlConstantExpression(AccentFrom, typeof(string), mapping),
                        new SqlConstantExpression(AccentTo, typeof(string), mapping)
                    ],
                    nullable: true,
                    argumentsPropagateNullability: [true, false, false],
                    typeof(string),
                    mapping);
            });

        return modelBuilder;
    }
}

/// <param name="Text">Palabra en minúsculas y sin acentos.</param>
/// <param name="Digits">Solo sus dígitos, para comparar CUIT y teléfonos con o sin guiones.</param>
public sealed record SearchToken(string Text, string Digits)
{
    /// <summary>Con 3 dígitos o más la palabra también se busca como número.</summary>
    public bool HasDigits => Digits.Length >= 3;
}
