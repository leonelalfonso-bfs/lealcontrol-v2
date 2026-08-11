using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Domain.Shared;

namespace LealControl.Modules.Crm.Domain.ValueObjects;

public sealed record PartyDocument
{
    private PartyDocument(DocumentType type, string number)
    {
        Type = type;
        Number = number;
    }

    public DocumentType Type { get; }

    public string Number { get; }

    public static Result<PartyDocument> Create(DocumentType type, string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
        {
            return Result<PartyDocument>.Failure(CrmErrors.DocumentRequired);
        }

        return type switch
        {
            DocumentType.Cuit => CreateCuit(raw),
            DocumentType.Dni => CreateDni(raw),
            DocumentType.Passport or DocumentType.Foreign => CreateGeneric(type, raw),
            _ => Result<PartyDocument>.Failure(CrmErrors.DocumentRequired)
        };
    }

    public static Result<PartyDocument> ForTaxCondition(TaxCondition taxCondition, DocumentType type, string? raw)
    {
        var requiresCuit = taxCondition is TaxCondition.ResponsableInscripto
            or TaxCondition.Monotributo
            or TaxCondition.Exento;

        if (requiresCuit && type != DocumentType.Cuit)
        {
            return Result<PartyDocument>.Failure(CrmErrors.CuitRequiredForTaxCondition);
        }

        return Create(type, raw);
    }

    private static Result<PartyDocument> CreateCuit(string raw)
    {
        var cuit = Cuit.Create(raw);
        return cuit.IsFailure
            ? Result<PartyDocument>.Failure(cuit.Error)
            : Result<PartyDocument>.Success(new PartyDocument(DocumentType.Cuit, cuit.Value.Value));
    }

    private static Result<PartyDocument> CreateDni(string raw)
    {
        var digits = new string(raw.Where(char.IsDigit).ToArray());
        if (digits.Length is < 7 or > 8)
        {
            return Result<PartyDocument>.Failure(CrmErrors.InvalidDni);
        }

        return Result<PartyDocument>.Success(new PartyDocument(DocumentType.Dni, digits));
    }

    private static Result<PartyDocument> CreateGeneric(DocumentType type, string raw)
    {
        var number = raw.Trim().ToUpperInvariant();
        if (number.Length is < 4 or > 20)
        {
            return Result<PartyDocument>.Failure(CrmErrors.DocumentRequired);
        }

        return Result<PartyDocument>.Success(new PartyDocument(type, number));
    }

    public override string ToString() => $"{Type}:{Number}";
}
