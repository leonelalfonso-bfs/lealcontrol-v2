using System.Net.Mail;
using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Crm.Domain.ValueObjects;

public sealed record EmailAddress
{
    private EmailAddress(string value) => Value = value;

    public string Value { get; }

    public static Result<EmailAddress> Create(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Result<EmailAddress>.Failure(CrmErrors.InvalidEmail);
        }

        try
        {
            var parsed = new MailAddress(raw.Trim());
            return Result<EmailAddress>.Success(new EmailAddress(parsed.Address.ToLowerInvariant()));
        }
        catch (FormatException)
        {
            return Result<EmailAddress>.Failure(CrmErrors.InvalidEmail);
        }
    }

    public static Result<EmailAddress?> CreateOptional(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Result<EmailAddress?>.Success(null);
        }

        var created = Create(raw);
        return created.IsFailure
            ? Result<EmailAddress?>.Failure(created.Error)
            : Result<EmailAddress?>.Success(created.Value);
    }

    public override string ToString() => Value;
}
