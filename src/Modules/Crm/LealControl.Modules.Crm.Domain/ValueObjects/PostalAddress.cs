using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Domain.Shared;

namespace LealControl.Modules.Crm.Domain.ValueObjects;

public sealed record PostalAddress
{
    private PostalAddress(
        string street,
        string city,
        ArgentineProvince province,
        string postalCode)
    {
        Street = street;
        City = city;
        Province = province;
        PostalCode = postalCode;
    }

    public string Street { get; }

    public string City { get; }

    public ArgentineProvince Province { get; }

    public string PostalCode { get; }

    public static Result<PostalAddress> Create(
        string? street,
        string? city,
        ArgentineProvince province,
        string? postalCode)
    {
        if (string.IsNullOrWhiteSpace(street) || string.IsNullOrWhiteSpace(city) || string.IsNullOrWhiteSpace(postalCode))
        {
            return Result<PostalAddress>.Failure(CrmErrors.InvalidAddress);
        }

        return Result<PostalAddress>.Success(new PostalAddress(
            street.Trim(),
            city.Trim(),
            province,
            postalCode.Trim()));
    }

    public static Result<PostalAddress?> CreateOptional(
        string? street,
        string? city,
        ArgentineProvince? province,
        string? postalCode)
    {
        if (string.IsNullOrWhiteSpace(street)
            && string.IsNullOrWhiteSpace(city)
            && string.IsNullOrWhiteSpace(postalCode)
            && province is null)
        {
            return Result<PostalAddress?>.Success(null);
        }

        if (province is null)
        {
            return Result<PostalAddress?>.Failure(CrmErrors.InvalidAddress);
        }

        var created = Create(street, city, province.Value, postalCode);
        return created.IsFailure
            ? Result<PostalAddress?>.Failure(created.Error)
            : Result<PostalAddress?>.Success(created.Value);
    }
}
