using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Crm.Domain.ValueObjects;

public sealed record PhoneNumber
{
    private PhoneNumber(string value) => Value = value;

    public string Value { get; }

    public static Result<PhoneNumber> Create(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Result<PhoneNumber>.Failure(CrmErrors.InvalidPhone);
        }

        var digits = new string(raw.Where(char.IsDigit).ToArray());
        if (digits.Length is < 8 or > 15)
        {
            return Result<PhoneNumber>.Failure(CrmErrors.InvalidPhone);
        }

        return Result<PhoneNumber>.Success(new PhoneNumber(digits));
    }

    public static Result<PhoneNumber?> CreateOptional(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Result<PhoneNumber?>.Success(null);
        }

        var created = Create(raw);
        return created.IsFailure
            ? Result<PhoneNumber?>.Failure(created.Error)
            : Result<PhoneNumber?>.Success(created.Value);
    }

    public override string ToString() => Value;
}
