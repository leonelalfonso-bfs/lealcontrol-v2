using System;
using System.Collections.Generic;
using System.Linq;

namespace LealControl.QA.Models;

public enum QaCheckStatus
{
    Passed,
    Failed,
    Warning,
    Skipped
}

public sealed record QaCheckResult(
    string Name,
    string Module,
    QaCheckStatus Status,
    string Expected,
    string Actual,
    string? Difference = null,
    string? Message = null,
    string? Entity = null,
    string? EntityId = null,
    TimeSpan Duration = default);

public sealed record QaIssue(
    string IssueCode,
    string Module,
    string Scenario,
    string Entity,
    string Expected,
    string Actual,
    string? Difference = null,
    string? Message = null,
    string? RelatedDocuments = null,
    string? StackTrace = null);

public sealed class QaScenarioResult
{
    public string ScenarioName { get; init; } = string.Empty;
    public string Module { get; init; } = string.Empty;
    public QaCheckStatus Status => Issues.Count > 0 ? QaCheckStatus.Failed : QaCheckStatus.Passed;
    public TimeSpan Duration { get; set; }
    public List<QaCheckResult> Checks { get; } = new();
    public List<QaIssue> Issues { get; } = new();

    public void AddCheck(string name, string module, bool condition, string expected, string actual, string? message = null, string? entity = null, string? entityId = null)
    {
        var status = condition ? QaCheckStatus.Passed : QaCheckStatus.Failed;
        string? diff = null;

        if (!condition)
        {
            diff = $"Expected: {expected} | Actual: {actual}";
            Issues.Add(new QaIssue(
                $"QA-ISSUE-{Guid.NewGuid().ToString().Substring(0, 8).ToUpper()}",
                module,
                ScenarioName,
                entity ?? module,
                expected,
                actual,
                diff,
                message));
        }

        Checks.Add(new QaCheckResult(name, module, status, expected, actual, diff, message, entity, entityId));
    }
}

public sealed class QaRun
{
    public string RunId { get; init; } = $"QA-RUN-{DateTime.UtcNow:yyyyMMdd-HHmmss}";
    public string Environment { get; init; } = "QA";
    public DateTime StartedAtUtc { get; init; } = DateTime.UtcNow;
    public DateTime? CompletedAtUtc { get; set; }
    public TimeSpan Duration => (CompletedAtUtc ?? DateTime.UtcNow) - StartedAtUtc;
    public List<QaScenarioResult> Scenarios { get; } = new();

    public int TotalScenarios => Scenarios.Count;
    public int PassedScenarios => Scenarios.Count(s => s.Status == QaCheckStatus.Passed);
    public int FailedScenarios => Scenarios.Count(s => s.Status == QaCheckStatus.Failed);

    public int TotalChecks => Scenarios.Sum(s => s.Checks.Count);
    public int PassedChecks => Scenarios.Sum(s => s.Checks.Count(c => c.Status == QaCheckStatus.Passed));
    public int FailedChecks => Scenarios.Sum(s => s.Checks.Count(c => c.Status == QaCheckStatus.Failed));

    public Dictionary<string, (int Total, int Passed, int Failed)> GetModuleSummary()
    {
        var dict = new Dictionary<string, (int Total, int Passed, int Failed)>();
        foreach (var check in Scenarios.SelectMany(s => s.Checks))
        {
            if (!dict.ContainsKey(check.Module)) dict[check.Module] = (0, 0, 0);
            var curr = dict[check.Module];
            dict[check.Module] = (
                curr.Total + 1,
                curr.Passed + (check.Status == QaCheckStatus.Passed ? 1 : 0),
                curr.Failed + (check.Status == QaCheckStatus.Failed ? 1 : 0)
            );
        }
        return dict;
    }
}
