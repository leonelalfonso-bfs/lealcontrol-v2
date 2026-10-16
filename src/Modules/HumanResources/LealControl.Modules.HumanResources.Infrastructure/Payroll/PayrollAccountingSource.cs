using LealControl.Modules.Accounting.Contracts.Posting;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Modules.HumanResources.Infrastructure.Payroll;

/// <summary>
/// Al contabilizar un período, publica en la cola contable cada liquidación cerrada del mes (devengada el
/// último día del mes) con su asiento de sueldos: sueldos y cargas al Debe; sueldos a pagar, F.931, sindicatos,
/// anticipos y embargos al Haber. Una liquidación reabierta se revierte al reabrirla.
/// </summary>
internal sealed class PayrollAccountingSource(HumanResourcesDbContext db, ITenantContext tenant, IAccountingPostingGateway gateway) : IAccountingDocumentSource
{
    public async Task<int> PublishPendingAsync(DateTime fromUtc, DateTime toUtc, CancellationToken cancellationToken = default)
    {
        await db.EnsureHrTablesAsync(cancellationToken);
        var t = tenant.TenantId.Value;
        var runs = (await db.PayrollRuns.AsNoTracking().Where(r => r.TenantId == t && r.Status == PayrollRunStatuses.Closed).ToListAsync(cancellationToken))
            .Where(r => AccrualDate(r) >= fromUtc && AccrualDate(r) <= toUtc).ToList();
        if (runs.Count == 0) return 0;
        var unpublished = await gateway.FilterUnpublishedAsync(AccountingSourceModules.Payroll, runs.Select(r => r.Id.ToString()).ToList(), cancellationToken);
        var published = 0;
        foreach (var run in runs.Where(r => unpublished.Contains(r.Id.ToString())))
        {
            var p = await db.Payslips.AsNoTracking().Where(x => x.RunId == run.Id).ToListAsync(cancellationToken);
            var employerSs = p.Sum(x => x.EmployerSocialSecurity + x.Fal + x.EmployerHealth + x.Art + x.LifeInsurance);
            var amounts = new Dictionary<string, decimal>
            {
                [AccountingAmountSources.GrossSalaries] = p.Sum(x => x.Remunerative + x.NonRemunerative),
                [AccountingAmountSources.EmployerCharges] = employerSs + p.Sum(x => x.AgreementContributions),
                [AccountingAmountSources.NetSalaries] = p.Sum(x => x.Net),
                [AccountingAmountSources.SocialSecurityToPay] = p.Sum(x => x.EmployeeSocialSecurity) + employerSs,
                [AccountingAmountSources.UnionToPay] = p.Sum(x => x.UnionDeductions + x.AgreementContributions),
                [AccountingAmountSources.SalaryAdvances] = p.Sum(x => x.Advances),
                [AccountingAmountSources.GarnishmentsToPay] = p.Sum(x => x.Garnishments),
                [AccountingAmountSources.OtherSalaryDeductions] = p.Sum(x => x.OtherDeductions)
            };
            amounts[AccountingAmountSources.Total] = amounts[AccountingAmountSources.GrossSalaries] + amounts[AccountingAmountSources.EmployerCharges];
            await gateway.PostAsync(new PostableDocument(
                AccountingSourceModules.Payroll, AccountingDocumentTypes.Payroll, run.Id.ToString(), $"Sueldos {run.Month:D2}/{run.Year}",
                AccrualDate(run), "ARS", 1m, null, null, $"Liquidación {run.Month:D2}/{run.Year} ({p.Count} recibos)", "AM-SUE-01",
                amounts, new Dictionary<string, string> { ["Payslips"] = p.Count.ToString() }), cancellationToken);
            published++;
        }
        return published;
    }

    private static DateTime AccrualDate(PayrollRun run) =>
        new DateTime(run.Year, run.Month, 1, 0, 0, 0, DateTimeKind.Utc).AddMonths(1).AddDays(-1);
}
