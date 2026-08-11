using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Crm.Domain.ValueObjects;

public sealed record Cuit
{
    private static readonly int[] Multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

    private Cuit(string value) => Value = value;

    public string Value { get; }

    public string Formatted => $"{Value[..2]}-{Value[2..10]}-{Value[10]}";

    public static Result<Cuit> Create(string? raw)
    {
        var digits = Normalize(raw);
        if (digits.Length != 11)
        {
            return Result<Cuit>.Failure(CrmErrors.InvalidCuit);
        }

        if (!HasValidChecksum(digits))
        {
            return Result<Cuit>.Failure(CrmErrors.InvalidCuitChecksum);
        }

        return Result<Cuit>.Success(new Cuit(digits));
    }

    public static string Normalize(string? raw) =>
        new((raw ?? string.Empty).Where(char.IsDigit).ToArray());

    public static bool HasValidChecksum(string digits)
    {
        if (digits.Length != 11 || digits.Any(c => !char.IsDigit(c)))
        {
            return false;
        }

        var sum = 0;
        for (var i = 0; i < 10; i++)
        {
            sum += (digits[i] - '0') * Multipliers[i];
        }

        var remainder = sum % 11;
        var check = 11 - remainder;
        if (check == 11)
        {
            check = 0;
        }
        else if (check == 10)
        {
            check = 9;
        }

        return check == digits[10] - '0';
    }

    public override string ToString() => Value;
}
