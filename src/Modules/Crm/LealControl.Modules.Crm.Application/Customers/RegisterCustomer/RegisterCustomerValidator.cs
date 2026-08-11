using FluentValidation;

namespace LealControl.Modules.Crm.Application.Customers.RegisterCustomer;

public sealed class RegisterCustomerValidator : AbstractValidator<RegisterCustomerCommand>
{
    public RegisterCustomerValidator()
    {
        RuleFor(x => x.Model.LegalName)
            .NotEmpty()
            .MaximumLength(200)
            .WithErrorCode("Crm.Customer.LegalNameRequired");

        RuleFor(x => x.Model.DocumentNumber)
            .NotEmpty()
            .WithErrorCode("Crm.Document.Required");
    }
}
