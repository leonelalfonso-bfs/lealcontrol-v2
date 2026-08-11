using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Domain.ValueObjects;

namespace LealControl.Modules.Crm.Domain.Customers;

public sealed class CustomerContact : Entity<ContactId>
{
    private CustomerContact()
    {
    }

    private CustomerContact(
        ContactId id,
        string name,
        ContactRole role,
        LocationId? locationId,
        EmailAddress? email,
        PhoneNumber? phone,
        PhoneNumber? whatsApp,
        bool isPrimary,
        string? notes)
        : base(id)
    {
        Name = name;
        Role = role;
        LocationId = locationId;
        Email = email;
        Phone = phone;
        WhatsApp = whatsApp;
        IsPrimary = isPrimary;
        Notes = notes;
    }

    public string Name { get; private set; } = string.Empty;

    public ContactRole Role { get; private set; }

    public LocationId? LocationId { get; private set; }

    public EmailAddress? Email { get; private set; }

    public PhoneNumber? Phone { get; private set; }

    public PhoneNumber? WhatsApp { get; private set; }

    public bool IsPrimary { get; private set; }

    public string? Notes { get; private set; }

    internal static Result<CustomerContact> Create(
        string name,
        ContactRole role,
        LocationId? locationId,
        EmailAddress? email,
        PhoneNumber? phone,
        PhoneNumber? whatsApp,
        bool isPrimary,
        string? notes)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result<CustomerContact>.Failure(CrmErrors.ContactNameRequired);
        }

        if (email is null && phone is null && whatsApp is null)
        {
            return Result<CustomerContact>.Failure(CrmErrors.ContactChannelRequired);
        }

        return Result<CustomerContact>.Success(new CustomerContact(
            ContactId.New(),
            name.Trim(),
            role,
            locationId,
            email,
            phone,
            whatsApp,
            isPrimary,
            string.IsNullOrWhiteSpace(notes) ? null : notes.Trim()));
    }

    internal Result Update(
        string name,
        ContactRole role,
        LocationId? locationId,
        EmailAddress? email,
        PhoneNumber? phone,
        PhoneNumber? whatsApp,
        bool isPrimary,
        string? notes)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return Result.Failure(CrmErrors.ContactNameRequired);
        }

        if (email is null && phone is null && whatsApp is null)
        {
            return Result.Failure(CrmErrors.ContactChannelRequired);
        }

        Name = name.Trim();
        Role = role;
        LocationId = locationId;
        Email = email;
        Phone = phone;
        WhatsApp = whatsApp;
        IsPrimary = isPrimary;
        Notes = string.IsNullOrWhiteSpace(notes) ? null : notes.Trim();
        return Result.Success();
    }

    internal void MarkPrimary(bool isPrimary) => IsPrimary = isPrimary;
}
