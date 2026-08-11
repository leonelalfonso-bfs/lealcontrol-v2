using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.ValueObjects;

namespace LealControl.Modules.Crm.Domain.Customers;

public sealed class CustomerLocation : Entity<LocationId>
{
    private CustomerLocation()
    {
    }

    private CustomerLocation(
        LocationId id,
        string name,
        PostalAddress address,
        PhoneNumber? phone,
        string? notes)
        : base(id)
    {
        Name = name;
        Address = address;
        Phone = phone;
        Notes = notes;
    }

    public string Name { get; private set; } = string.Empty;

    public PostalAddress Address { get; private set; } = null!;

    public PhoneNumber? Phone { get; private set; }

    public string? Notes { get; private set; }

    public ArgentineProvince JurisdictionProvince => Address.Province;

    internal static Result<CustomerLocation> Create(
        string name,
        PostalAddress address,
        PhoneNumber? phone,
        string? notes)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result<CustomerLocation>.Failure(CrmErrors.LocationNameRequired);
        }

        return Result<CustomerLocation>.Success(new CustomerLocation(
            LocationId.New(),
            name.Trim(),
            address,
            phone,
            NormalizeNotes(notes)));
    }

    internal Result Update(string name, PostalAddress address, PhoneNumber? phone, string? notes)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure(CrmErrors.LocationNameRequired);
        }

        Name = name.Trim();
        Address = address;
        Phone = phone;
        Notes = NormalizeNotes(notes);
        return Result.Success();
    }

    private static string? NormalizeNotes(string? notes) =>
        string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
}
