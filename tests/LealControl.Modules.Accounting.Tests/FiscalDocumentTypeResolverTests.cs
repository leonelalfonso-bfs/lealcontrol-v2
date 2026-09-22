using FluentAssertions;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Accounting.Infrastructure;
using Xunit;

namespace LealControl.Modules.Accounting.Tests;

public sealed class FiscalDocumentTypeResolverTests
{
    [Theory]
    [InlineData("NC_A", AccountingDocumentTypes.CreditNoteA)]
    [InlineData("NC-A", AccountingDocumentTypes.CreditNoteA)]
    [InlineData("NCA", AccountingDocumentTypes.CreditNoteA)]
    [InlineData("nc_a", AccountingDocumentTypes.CreditNoteA)]
    [InlineData("CreditNoteA", AccountingDocumentTypes.CreditNoteA)]
    [InlineData("NC_B", AccountingDocumentTypes.CreditNoteB)]
    [InlineData("NC-B", AccountingDocumentTypes.CreditNoteB)]
    [InlineData("NC_C", AccountingDocumentTypes.CreditNoteC)]
    [InlineData("NC-C", AccountingDocumentTypes.CreditNoteC)]
    [InlineData("A", AccountingDocumentTypes.InvoiceA)]
    [InlineData("B", AccountingDocumentTypes.InvoiceB)]
    [InlineData("C", AccountingDocumentTypes.InvoiceC)]
    public void Purchase_credit_note_type_is_normalized_correctly(string input, string expected)
    {
        // La condición fiscal del proveedor NO debe influir: NC_A sigue siendo CreditNoteA.
        FiscalDocumentTypeResolver.Resolve(input, "0001-00000001")
            .Should().Be(expected);
    }

    [Fact]
    public void Nc_a_is_never_mapped_to_credit_note_c()
    {
        // Regresión: Contains('C') matcheaba la C de "NC" y convertía NC_A → CreditNoteC.
        FiscalDocumentTypeResolver.Resolve("NC_A")
            .Should().Be(AccountingDocumentTypes.CreditNoteA);
        FiscalDocumentTypeResolver.Resolve("NC_A")
            .Should().NotBe(AccountingDocumentTypes.CreditNoteC);
    }
}
