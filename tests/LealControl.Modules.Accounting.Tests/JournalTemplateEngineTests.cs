using FluentAssertions;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.Modules.Accounting.Infrastructure;
using Xunit;

namespace LealControl.Modules.Accounting.Tests;

file sealed class MapAccountResolver : IAccountingAccountResolver
{
    public ResolvedAccountingAccount Resolve(string accountCode, string accountNameFallback) =>
        new(Guid.NewGuid(), accountCode, string.IsNullOrWhiteSpace(accountNameFallback) ? accountCode : accountNameFallback);
}

public sealed class JournalTemplateEngineTests
{
    private static readonly TenantId Tenant = new(Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"));
    private static readonly IAccountingAccountResolver Accounts = new MapAccountResolver();

    private static JournalTemplate Template(string code, string module, string docType, params JournalTemplateLine[] lines)
    {
        var t = new JournalTemplate
        {
            Code = code,
            Name = code,
            SourceModule = module,
            DocumentType = docType,
            Status = "Active",
            TenantId = Tenant
        };
        var i = 1;
        foreach (var line in lines)
        {
            line.OrderIndex = i++;
            line.TenantId = Tenant;
            line.TemplateId = t.Id;
            t.Lines.Add(line);
        }
        return t;
    }

    private static JournalTemplateLine Line(string code, string side, string amountSource, string condition = "Always") =>
        new()
        {
            AccountCode = code,
            AccountName = code,
            DebitCredit = side,
            AmountSource = amountSource,
            Condition = condition
        };

    private static PostableDocument Doc(
        string module,
        string docType,
        Dictionary<string, decimal> amounts,
        string number = "1",
        string? counterparty = null) =>
        new(module, docType, Guid.NewGuid().ToString(), number, DateTime.UtcNow, "ARS", 1m,
            null, null, counterparty, null, amounts, new Dictionary<string, string>());

    [Fact]
    public void Case01_InvoiceA_balances_net_vat_total()
    {
        var template = Template("AM-VTA-01", "Sales", "InvoiceA",
            Line("1.1.02.001", "Debit", AccountingAmountSources.Total),
            Line("4.1.01", "Credit", AccountingAmountSources.Net21, "IfHasVat21"),
            Line("2.1.02.001", "Credit", AccountingAmountSources.Vat21, "IfHasVat21"));

        var entry = JournalTemplateEngine.Render(template, Doc("Sales", "InvoiceA", new()
        {
            [AccountingAmountSources.Total] = 1210m,
            [AccountingAmountSources.Net21] = 1000m,
            [AccountingAmountSources.Vat21] = 210m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(1210m);
        entry.TotalCredit.Should().Be(1210m);
        entry.Lines.Should().HaveCount(3);
    }

    [Fact]
    public void Case02_CreditNote_inverts_sides()
    {
        var template = Template("AM-VTA-03", "Sales", "CreditNoteA",
            Line("1.1.02.001", "Credit", AccountingAmountSources.Total),
            Line("4.1.01", "Debit", AccountingAmountSources.Net21),
            Line("2.1.02.001", "Debit", AccountingAmountSources.Vat21, "IfHasVat21"));

        var entry = JournalTemplateEngine.Render(template, Doc("Sales", "CreditNoteA", new()
        {
            [AccountingAmountSources.Total] = 1210m,
            [AccountingAmountSources.Net21] = 1000m,
            [AccountingAmountSources.Vat21] = 210m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(1210m);
        entry.TotalCredit.Should().Be(1210m);
    }

    [Fact]
    public void Case03_Receipt_bank_transfer_payment_amount()
    {
        var template = Template("AM-FIN-01", "Finance", "CollectionReceipt",
            Line("1.1.01.002", "Debit", AccountingAmountSources.PaymentAmount),
            Line("1.1.02.001", "Credit", AccountingAmountSources.Total));

        var entry = JournalTemplateEngine.Render(template, Doc("Finance", "CollectionReceipt", new()
        {
            [AccountingAmountSources.Total] = 5000m,
            [AccountingAmountSources.PaymentAmount] = 5000m,
            [AccountingAmountSources.BankAmount] = 5000m
        }, counterparty: "Cliente"), Tenant, Accounts);

        entry.TotalDebit.Should().Be(5000m);
        entry.Concept.Should().Contain("Cliente");
    }

    [Fact]
    public void Case04_Receipt_cheque_plus_retention()
    {
        var template = Template("AM-FIN-01b", "Finance", "CollectionReceipt",
            Line("1.1.01.003", "Debit", AccountingAmountSources.ChequeAmount, "IfHasChequeAmount"),
            Line("1.1.03.002", "Debit", AccountingAmountSources.RetentionAmount, "IfHasRetentionAmount"),
            Line("1.1.02.001", "Credit", AccountingAmountSources.Total));

        var entry = JournalTemplateEngine.Render(template, Doc("Finance", "CollectionReceipt", new()
        {
            [AccountingAmountSources.Total] = 10000m,
            [AccountingAmountSources.ChequeAmount] = 9000m,
            [AccountingAmountSources.RetentionAmount] = 1000m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(10000m);
        entry.TotalCredit.Should().Be(10000m);
        entry.Lines.Should().HaveCount(3);
    }

    [Fact]
    public void Case05_PaymentOrder_own_cheque()
    {
        var template = Template("AM-FIN-11", "Finance", "PaymentOrder",
            Line("2.1.01.001", "Debit", AccountingAmountSources.Total),
            Line("2.1.03.001", "Credit", AccountingAmountSources.OwnChequeAmount, "IfHasOwnChequeAmount"));

        var entry = JournalTemplateEngine.Render(template, Doc("Finance", "PaymentOrder", new()
        {
            [AccountingAmountSources.Total] = 7500m,
            [AccountingAmountSources.OwnChequeAmount] = 7500m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(7500m);
        entry.TotalCredit.Should().Be(7500m);
    }

    [Fact]
    public void Case06_Bank_fee_commission()
    {
        var template = Template("AM-FIN-30", "Finance", "BankMovement",
            Line("5.2.01", "Debit", AccountingAmountSources.BankFee),
            Line("1.1.01.002", "Credit", AccountingAmountSources.BankFee));

        var entry = JournalTemplateEngine.Render(template, Doc("Finance", "BankMovement", new()
        {
            [AccountingAmountSources.BankFee] = 350m,
            [AccountingAmountSources.Total] = 350m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(350m);
    }

    [Fact]
    public void Case07_Internal_transfer()
    {
        var template = Template("AM-FIN-20", "Finance", "InternalTransfer",
            Line("1.1.01.002", "Debit", AccountingAmountSources.BankAmount),
            Line("1.1.01.001", "Credit", AccountingAmountSources.CashAmount));

        var entry = JournalTemplateEngine.Render(template, Doc("Finance", "InternalTransfer", new()
        {
            [AccountingAmountSources.BankAmount] = 2000m,
            [AccountingAmountSources.CashAmount] = 2000m,
            [AccountingAmountSources.Total] = 2000m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(2000m);
        entry.TotalCredit.Should().Be(2000m);
    }

    [Fact]
    public void Case08_Advance_customer()
    {
        var template = Template("AM-FIN-ADV", "Finance", "CollectionReceipt",
            Line("1.1.01.001", "Debit", AccountingAmountSources.CashAmount, "IfCash"),
            Line("2.1.04.001", "Credit", AccountingAmountSources.AdvanceAmount));

        var entry = JournalTemplateEngine.Render(template, Doc("Finance", "CollectionReceipt", new()
        {
            [AccountingAmountSources.CashAmount] = 1500m,
            [AccountingAmountSources.AdvanceAmount] = 1500m,
            [AccountingAmountSources.Total] = 1500m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(1500m);
    }

    [Fact]
    public void Case09_Exchange_difference()
    {
        var template = Template("AM-FIN-FX", "Finance", "CollectionReceipt",
            Line("1.1.01.002", "Debit", AccountingAmountSources.BankAmount),
            Line("1.1.02.001", "Credit", AccountingAmountSources.ImputedAmount),
            Line("4.2.01", "Credit", AccountingAmountSources.ExchangeGain, "IfHasExchangeGain"));

        var entry = JournalTemplateEngine.Render(template, Doc("Finance", "CollectionReceipt", new()
        {
            [AccountingAmountSources.BankAmount] = 1050m,
            [AccountingAmountSources.ImputedAmount] = 1000m,
            [AccountingAmountSources.ExchangeGain] = 50m,
            [AccountingAmountSources.Total] = 1050m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(1050m);
        entry.TotalCredit.Should().Be(1050m);
    }

    [Fact]
    public void Case10_Payroll_salaries()
    {
        var template = Template("AM-FIN-40", "Payroll", "Payroll",
            Line("5.3.01", "Debit", AccountingAmountSources.Total),
            Line("1.1.01.002", "Credit", AccountingAmountSources.PaymentAmount));

        var entry = JournalTemplateEngine.Render(template, Doc("Payroll", "Payroll", new()
        {
            [AccountingAmountSources.Total] = 88000m,
            [AccountingAmountSources.PaymentAmount] = 88000m
        }), Tenant, Accounts);

        entry.TotalDebit.Should().Be(88000m);
        entry.TotalCredit.Should().Be(88000m);
    }

    [Fact]
    public void Render_throws_when_unbalanced()
    {
        var template = Template("BAD", "Sales", "InvoiceA",
            Line("1.1.02.001", "Debit", AccountingAmountSources.Total),
            Line("4.1.01", "Credit", AccountingAmountSources.Net21));

        var act = () => JournalTemplateEngine.Render(template, Doc("Sales", "InvoiceA", new()
        {
            [AccountingAmountSources.Total] = 1210m,
            [AccountingAmountSources.Net21] = 1000m
        }), Tenant, Accounts);

        act.Should().Throw<InvalidOperationException>().WithMessage("*desbalanceado*");
    }

    private static PostableDocument ForeignDoc(decimal rate, Dictionary<string, decimal> amounts) =>
        new("Finance", "CollectionReceipt", Guid.NewGuid().ToString(), "RC-1", DateTime.UtcNow, "USD", rate,
            null, null, null, null, amounts, new Dictionary<string, string>());

    [Fact]
    public void Foreign_currency_documents_are_posted_in_pesos_with_the_original_amount()
    {
        var template = Template("AM-FIN-01", "Finance", "CollectionReceipt",
            Line("1.1.01.007", "Debit", "PaymentAmount"),
            Line("1.1.02.001", "Credit", "Total"));

        var entry = JournalTemplateEngine.Render(template, ForeignDoc(1050.5m, new() { ["Total"] = 121m }), Tenant, Accounts);

        entry.Lines.Should().OnlyContain(l => l.Currency == "USD" && l.ExchangeRate == 1050.5m && l.OriginalAmount == 121m);
        entry.TotalDebit.Should().Be(127110.5m);
        entry.TotalCredit.Should().Be(127110.5m);
    }

    [Fact]
    public void Rounding_cents_after_conversion_are_absorbed_so_the_entry_balances_exactly()
    {
        // A 1,1: el total (1 USD) da 1,10, pero cada tercio redondea a 0,37 y suman 1,11.
        var template = Template("FX", "Finance", "CollectionReceipt",
            Line("A", "Debit", "Total"),
            Line("B", "Credit", "Net21"),
            Line("C", "Credit", "Net105"),
            Line("D", "Credit", "Net27"));

        var entry = JournalTemplateEngine.Render(template,
            ForeignDoc(1.1m, new() { ["Total"] = 1m, ["Net21"] = 0.3333m, ["Net105"] = 0.3333m, ["Net27"] = 0.3334m }), Tenant, Accounts);

        entry.TotalCredit.Should().Be(1.11m);
        entry.TotalDebit.Should().Be(entry.TotalCredit);
    }

    [Fact]
    public void A_foreign_document_without_exchange_rate_is_not_posted()
    {
        var template = Template("AM-FIN-01", "Finance", "CollectionReceipt", Line("A", "Debit", "Total"), Line("B", "Credit", "Total"));

        var act = () => JournalTemplateEngine.Render(template, ForeignDoc(1m, new() { ["Total"] = 10m }), Tenant, Accounts);

        act.Should().Throw<InvalidOperationException>().WithMessage("*no tiene cotización*");
    }
}
