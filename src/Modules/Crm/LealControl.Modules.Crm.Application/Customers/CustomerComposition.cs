using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Domain;
using LealControl.Modules.Crm.Domain.ValueObjects;

namespace LealControl.Modules.Crm.Application.Customers;

internal static class CustomerComposition
{
    internal sealed record ProfileParts(
        PartyDocument Document,
        EmailAddress? Email,
        PhoneNumber? Phone,
        PhoneNumber? WhatsApp,
        PostalAddress? FiscalAddress);

    internal static Result<ProfileParts> Compose(CustomerWriteModel model)
    {
        var document = PartyDocument.ForTaxCondition(model.TaxCondition, model.DocumentType, model.DocumentNumber);
        if (document.IsFailure)
        {
            return Result<ProfileParts>.Failure(document.Error);
        }

        var email = EmailAddress.CreateOptional(model.Email);
        if (email.IsFailure)
        {
            return Result<ProfileParts>.Failure(email.Error);
        }

        var phone = PhoneNumber.CreateOptional(model.Phone);
        if (phone.IsFailure)
        {
            return Result<ProfileParts>.Failure(phone.Error);
        }

        var whatsApp = PhoneNumber.CreateOptional(model.WhatsApp);
        if (whatsApp.IsFailure)
        {
            return Result<ProfileParts>.Failure(whatsApp.Error);
        }

        var address = PostalAddress.CreateOptional(
            model.FiscalStreet,
            model.FiscalCity,
            model.FiscalProvince,
            model.FiscalPostalCode);

        if (address.IsFailure)
        {
            return Result<ProfileParts>.Failure(address.Error);
        }

        if (!model.IsCustomer && !model.IsSupplier)
        {
            return Result<ProfileParts>.Failure(Error.Validation(
                "Crm.Customer.RoleRequired",
                "El registro debe ser cliente, proveedor o ambos."));
        }

        return Result<ProfileParts>.Success(new ProfileParts(
            document.Value,
            email.Value,
            phone.Value,
            whatsApp.Value,
            address.Value));
    }
}
