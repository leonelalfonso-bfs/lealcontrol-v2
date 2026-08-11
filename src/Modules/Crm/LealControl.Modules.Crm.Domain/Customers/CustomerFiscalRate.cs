using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Domain.Shared;

namespace LealControl.Modules.Crm.Domain.Customers;

public sealed class CustomerFiscalRate
{
    private CustomerFiscalRate()
    {
    }

    private CustomerFiscalRate(
        FiscalJurisdiction jurisdiction,
        decimal perceptionRate,
        decimal retentionRate,
        bool hasPerceptionExclusion,
        DateOnly? perceptionExclusionExpiresOn,
        bool hasRetentionExclusion,
        DateOnly? retentionExclusionExpiresOn,
        string? exclusionCertificateNumber)
    {
        Jurisdiction = jurisdiction;
        PerceptionRate = perceptionRate;
        RetentionRate = retentionRate;
        HasPerceptionExclusion = hasPerceptionExclusion;
        PerceptionExclusionExpiresOn = perceptionExclusionExpiresOn;
        HasRetentionExclusion = hasRetentionExclusion;
        RetentionExclusionExpiresOn = retentionExclusionExpiresOn;
        ExclusionCertificateNumber = exclusionCertificateNumber;
    }

    public FiscalJurisdiction Jurisdiction { get; private set; }

    public decimal PerceptionRate { get; private set; }

    public decimal RetentionRate { get; private set; }

    public bool HasPerceptionExclusion { get; private set; }

    public DateOnly? PerceptionExclusionExpiresOn { get; private set; }

    public bool HasRetentionExclusion { get; private set; }

    public DateOnly? RetentionExclusionExpiresOn { get; private set; }

    public string? ExclusionCertificateNumber { get; private set; }

    internal static Result<CustomerFiscalRate> Create(
        FiscalJurisdiction jurisdiction,
        decimal perceptionRate,
        decimal retentionRate,
        bool hasPerceptionExclusion,
        DateOnly? perceptionExclusionExpiresOn,
        bool hasRetentionExclusion,
        DateOnly? retentionExclusionExpiresOn,
        string? exclusionCertificateNumber)
    {
        if (perceptionRate is < 0 or > 100 || retentionRate is < 0 or > 100)
        {
            return Result<CustomerFiscalRate>.Failure(CrmErrors.InvalidTaxRate);
        }

        return Result<CustomerFiscalRate>.Success(new CustomerFiscalRate(
            jurisdiction,
            decimal.Round(perceptionRate, 4),
            decimal.Round(retentionRate, 4),
            hasPerceptionExclusion,
            perceptionExclusionExpiresOn,
            hasRetentionExclusion,
            retentionExclusionExpiresOn,
            string.IsNullOrWhiteSpace(exclusionCertificateNumber)
                ? null
                : exclusionCertificateNumber.Trim()));
    }

    internal Result Update(
        decimal perceptionRate,
        decimal retentionRate,
        bool hasPerceptionExclusion,
        DateOnly? perceptionExclusionExpiresOn,
        bool hasRetentionExclusion,
        DateOnly? retentionExclusionExpiresOn,
        string? exclusionCertificateNumber)
    {
        if (perceptionRate is < 0 or > 100 || retentionRate is < 0 or > 100)
        {
            return Result.Failure(CrmErrors.InvalidTaxRate);
        }

        PerceptionRate = decimal.Round(perceptionRate, 4);
        RetentionRate = decimal.Round(retentionRate, 4);
        HasPerceptionExclusion = hasPerceptionExclusion;
        PerceptionExclusionExpiresOn = perceptionExclusionExpiresOn;
        HasRetentionExclusion = hasRetentionExclusion;
        RetentionExclusionExpiresOn = retentionExclusionExpiresOn;
        ExclusionCertificateNumber = string.IsNullOrWhiteSpace(exclusionCertificateNumber)
            ? null
            : exclusionCertificateNumber.Trim();
        return Result.Success();
    }

    public bool PerceptionExclusionIsActive(DateOnly today) =>
        HasPerceptionExclusion
        && (PerceptionExclusionExpiresOn is null || PerceptionExclusionExpiresOn >= today);

    public bool RetentionExclusionIsActive(DateOnly today) =>
        HasRetentionExclusion
        && (RetentionExclusionExpiresOn is null || RetentionExclusionExpiresOn >= today);
}
