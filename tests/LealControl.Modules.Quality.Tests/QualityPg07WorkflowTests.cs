using LealControl.Modules.Quality.Infrastructure;
using Xunit;

namespace LealControl.Modules.Quality.Tests;

public sealed class QualityPg07WorkflowTests
{
    [Theory]
    [InlineData("Risk", 1, 2, "Aceptable", false, false)]
    [InlineData("Risk", 2, 4, "Apreciable", false, true)]
    [InlineData("Risk", 3, 4, "Crítico", true, false)]
    [InlineData("Risk", 3, 5, "Muy grave", true, false)]
    [InlineData("Opportunity", 1, 2, "No aprovechable", false, false)]
    [InlineData("Opportunity", 2, 4, "Poco aprovechable", false, true)]
    [InlineData("Opportunity", 3, 4, "Aprovechable", true, false)]
    [InlineData("Opportunity", 5, 5, "Altamente aprovechable", true, false)]
    public void RatingMatchesApprovedMatrix(string kind, int probability, int impact,
        string expectedValuation, bool requiresAction, bool allowsDecision)
    {
        var rating = QualityPg07Workflow.Rate(kind, probability, impact);
        Assert.NotNull(rating);
        Assert.Equal(probability * impact, rating.Level);
        Assert.Equal(expectedValuation, rating.Valuation);
        Assert.Equal(requiresAction, rating.RequiresAction);
        Assert.Equal(allowsDecision, rating.AllowsDecision);
    }

    [Fact]
    public void EveryCauseNeedsEffectiveFinalAction()
    {
        var first = new QualityCorrectiveAction { EffectivenessResult = "Effective" };
        var second = new QualityCorrectiveAction { EffectivenessResult = "Pending" };
        var actions = new List<QualityCorrectiveAction> { first, second };
        Assert.False(QualityPg07Workflow.AllCausesEffective(actions));

        second.EffectivenessResult = "NotEffective";
        var replacement = new QualityCorrectiveAction
        {
            CauseId = second.CauseId,
            ReplacesActionId = second.Id,
            EffectivenessResult = "Pending"
        };
        actions.Add(replacement);
        Assert.False(QualityPg07Workflow.AllCausesEffective(actions));

        replacement.EffectivenessResult = "Effective";
        Assert.True(QualityPg07Workflow.AllCausesEffective(actions));
    }

    [Fact]
    public void ImplementationDateOpensVerificationAndEffectiveActionsCloseRecord()
    {
        var record = new QualityNonConformity();
        var first = new QualityCorrectiveAction
        {
            Action = "Primer tratamiento",
            ImplementationDate = DateTime.UtcNow.Date.AddDays(-1)
        };
        var second = new QualityCorrectiveAction
        {
            Action = "Segundo tratamiento",
            ImplementationDate = DateTime.UtcNow.Date.AddDays(3)
        };
        QualityPg07Workflow.SaveActions(record, [first, second]);
        QualityPg07Status.Refresh(record);
        Assert.Equal(QualityNonConformityStatuses.EffectivenessCheck, record.Status);

        first.EffectivenessResult = "Effective";
        QualityPg07Workflow.SaveActions(record, [first, second]);
        QualityPg07Status.Refresh(record);
        Assert.Equal(QualityNonConformityStatuses.ActionPending, record.Status);

        second.EffectivenessResult = "Effective";
        QualityPg07Workflow.SaveActions(record, [first, second]);
        QualityPg07Status.Refresh(record);
        Assert.Equal(QualityNonConformityStatuses.Closed, record.Status);
        Assert.NotNull(record.ClosedAt);
    }

    [Fact]
    public void LegacyActionRemainsVisible()
    {
        var record = new QualityNonConformity
        {
            RootCause = "Causa histórica",
            CorrectiveAction = "Acción histórica",
            EffectivenessResult = "Effective"
        };
        var action = Assert.Single(QualityPg07Workflow.Actions(record));
        Assert.Equal(record.Id, action.Id);
        Assert.Equal("Causa histórica", action.Cause);
        Assert.Equal("Effective", action.EffectivenessResult);
    }
}
