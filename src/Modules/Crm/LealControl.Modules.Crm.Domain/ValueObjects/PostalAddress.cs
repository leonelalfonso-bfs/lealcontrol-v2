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
        var s = string.IsNullOrWhiteSpace(street) ? "S/D" : street.Trim();
        var c = string.IsNullOrWhiteSpace(city) ? "S/C" : city.Trim();
        var cp = string.IsNullOrWhiteSpace(postalCode) ? "S/C" : postalCode.Trim();

        return Result<PostalAddress>.Success(new PostalAddress(
            s,
            c,
            province,
            cp));
    }

    public static Result<PostalAddress?> CreateOptional(
        string? street,
        string? city,
        ArgentineProvince? province,
        string? postalCode)
    {
        if (string.IsNullOrWhiteSpace(street)
            && string.IsNullOrWhiteSpace(city)
            && string.IsNullOrWhiteSpace(postalCode))
        {
            return Result<PostalAddress?>.Success(null);
        }

        var prov = province ?? ArgentineProvince.SantaFe;
        var s = string.IsNullOrWhiteSpace(street) ? "S/D" : street.Trim();
        var c = string.IsNullOrWhiteSpace(city) ? "San Lorenzo" : city.Trim();
        var cp = string.IsNullOrWhiteSpace(postalCode) ? "2200" : postalCode.Trim();

        return Result<PostalAddress?>.Success(new PostalAddress(s, c, prov, cp));
    }
}
