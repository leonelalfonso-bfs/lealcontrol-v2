using FluentAssertions;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Accounting.Infrastructure;
using Xunit;

namespace LealControl.Modules.Accounting.Tests;

public sealed class JournalTemplateSelectorTests
{
    private static JournalTemplate T(string code, string module, string docType) => new()
    {
        Code = code,
        Name = code,
        SourceModule = module,
        DocumentType = docType,
        Status = "Active",
        TenantId = new TenantId(Guid.NewGuid())
    };

    private static PostableDocument Doc(string module, string docType, string? hint = null) => new(
        module, docType, Guid.NewGuid().ToString(), "DOC-1", DateTime.UtcNow, "ARS", 1m,
        null, null, null, hint, new Dictionary<string, decimal>(), new Dictionary<string, string>());

    [Fact]
    public void Select_prefers_TemplateHint_over_module_type()
    {
        var templates = new[]
        {
            T("AM-FIN-01", "Finance", "CollectionReceipt"),
            T("AM-HINT", "Sales", "InvoiceA")
        };
        var doc = Doc("Finance", "CollectionReceipt", "AM-HINT");

        var result = JournalTemplateSelector.Select(doc, templates);
        result.Template!.Code.Should().Be("AM-HINT");
        result.MatchReason.Should().Be("TemplateHint");
    }

    [Fact]
    public void Select_falls_back_to_module_and_all()
    {
        var templates = new[]
        {
            T("AM-FIN-ALL", "Finance", AccountingDocumentTypes.All)
        };
        var doc = Doc("Finance", "BankMovement");

        var result = JournalTemplateSelector.Select(doc, templates);
        result.Template!.Code.Should().Be("AM-FIN-ALL");
        result.MatchReason.Should().Be("ModuleAll");
    }

    [Fact]
    public void Select_matches_purchase_credit_note_template()
    {
        var templates = new[]
        {
            T("AM-CMP-01", "Purchases", AccountingDocumentTypes.InvoiceA),
            T("AM-CMP-02", "Purchases", AccountingDocumentTypes.CreditNoteA)
        };
        var doc = Doc("Purchases", AccountingDocumentTypes.CreditNoteA);

        var result = JournalTemplateSelector.Select(doc, templates);
        result.Template!.Code.Should().Be("AM-CMP-02");
        result.MatchReason.Should().Be("ModuleAndType");
        result.Warning.Should().BeNull();
    }
}
