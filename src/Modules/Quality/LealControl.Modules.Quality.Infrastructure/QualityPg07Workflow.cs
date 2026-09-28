using System.Text.Json;

namespace LealControl.Modules.Quality.Infrastructure;

public sealed class QualityCorrectiveAction
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CauseId { get; set; } = Guid.NewGuid();
    public Guid? ReplacesActionId { get; set; }
    public string Cause { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string Responsible { get; set; } = string.Empty;
    public DateTime? ImplementationDate { get; set; }
    public string EffectivenessResult { get; set; } = "Pending";
    public string EffectivenessCheck { get; set; } = string.Empty;
    public DateTime? EvaluatedAtUtc { get; set; }
}

public sealed record CreateQualityActionRequest(string Cause, string Action, string? Responsible, DateTime? ImplementationDate);
public sealed record UpdateQualityActionRequest(string Action, string? Responsible, DateTime? ImplementationDate);
public sealed record EvaluateQualityActionRequest(string Result, string? Check);

public sealed record QualityRating(int Level, string Valuation, string Criterion, bool RequiresAction, bool AllowsDecision);

public static class QualityPg07Workflow
{
    public static QualityRating? Rate(string kind, int? probability, int? impact)
    {
        if (kind is not (QualityNonConformityKinds.Risk or QualityNonConformityKinds.Opportunity)
            || probability is < 1 or > 5 || impact is < 1 or > 5
            || !probability.HasValue || !impact.HasValue)
            return null;

        var level = probability.Value * impact.Value;
        var opportunity = kind == QualityNonConformityKinds.Opportunity;
        return level switch
        {
            <= 2 => new(level, opportunity ? "No aprovechable" : "Aceptable",
                opportunity ? "No amerita realizar acciones para mejorar la actividad" : "No requiere acciones", false, false),
            <= 8 => new(level, opportunity ? "Poco aprovechable" : "Apreciable",
                opportunity ? "Analizar si amerita acciones para mejorar la actividad" : "Analizar si amerita acciones", false, true),
            <= 12 => new(level, opportunity ? "Aprovechable" : "Crítico",
                opportunity ? "Tomar acciones para mejorar la actividad" : "Tomar acciones", true, false),
            _ => new(level, opportunity ? "Altamente aprovechable" : "Muy grave",
                opportunity ? "Tomar acciones de forma inmediata para mejorar la actividad" : "No aceptar, tomar acciones de forma inmediata", true, false)
        };
    }

    public static List<QualityCorrectiveAction> Actions(QualityNonConformity record)
    {
        if (!string.IsNullOrWhiteSpace(record.ActionsJson) && record.ActionsJson != "[]")
        {
            try
            {
                return JsonSerializer.Deserialize<List<QualityCorrectiveAction>>(record.ActionsJson) ?? [];
            }
            catch (JsonException)
            {
                return [];
            }
        }

        // Existing PG07 records remain readable and can be edited through the new action flow.
        if (string.IsNullOrWhiteSpace(record.CorrectiveAction) && string.IsNullOrWhiteSpace(record.RootCause))
            return [];
        return [new QualityCorrectiveAction
        {
            Id = record.Id,
            CauseId = record.Id,
            Cause = record.RootCause,
            Action = record.CorrectiveAction,
            Responsible = record.Responsible,
            ImplementationDate = record.NewDueDate ?? record.DueDate,
            EffectivenessResult = string.IsNullOrWhiteSpace(record.EffectivenessResult) ? "Pending" : record.EffectivenessResult,
            EffectivenessCheck = record.EffectivenessCheck,
            EvaluatedAtUtc = record.ClosedAt
        }];
    }

    public static void SaveActions(QualityNonConformity record, List<QualityCorrectiveAction> actions)
        => record.ActionsJson = JsonSerializer.Serialize(actions);

    public static IReadOnlyList<QualityCorrectiveAction> CurrentActions(IReadOnlyList<QualityCorrectiveAction> actions)
    {
        var replaced = actions.Where(a => a.ReplacesActionId.HasValue)
            .Select(a => a.ReplacesActionId!.Value).ToHashSet();
        return actions.Where(a => !replaced.Contains(a.Id)).ToList();
    }

    public static bool AllCausesEffective(IReadOnlyList<QualityCorrectiveAction> actions)
    {
        var current = CurrentActions(actions);
        return current.Count > 0 && current.All(a => a.EffectivenessResult == "Effective");
    }

    public static DateTime? NextImplementationDate(IReadOnlyList<QualityCorrectiveAction> actions)
        => CurrentActions(actions).Where(a => a.EffectivenessResult == "Pending" && a.ImplementationDate.HasValue)
            .Select(a => a.ImplementationDate).OrderBy(d => d).FirstOrDefault();
}

public static class QualityPg07Status
{
    public static void Refresh(QualityNonConformity record)
    {
        var actions = QualityPg07Workflow.Actions(record);
        if (QualityPg07Workflow.AllCausesEffective(actions))
        {
            record.Status = QualityNonConformityStatuses.Closed;
            record.ClosedAt ??= DateTime.UtcNow;
            return;
        }

        record.ClosedAt = null;
        record.Status = QualityPg07Workflow.CurrentActions(actions).Any(a =>
            a.EffectivenessResult == "Pending"
            && a.ImplementationDate.HasValue
            && a.ImplementationDate.Value.Date <= DateTime.UtcNow.Date)
            ? QualityNonConformityStatuses.EffectivenessCheck
            : QualityNonConformityStatuses.ActionPending;
    }
}
