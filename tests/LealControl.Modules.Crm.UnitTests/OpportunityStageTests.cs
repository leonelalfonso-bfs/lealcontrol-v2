using FluentAssertions;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Customers;
using LealControl.Modules.Crm.Domain.Opportunities;
using Xunit;

namespace LealControl.Modules.Crm.UnitTests;

public sealed class OpportunityStageTests
{
    private static readonly DateTime Now = new(2026, 10, 1, 12, 0, 0, DateTimeKind.Utc);

    private static Opportunity NewOpportunity() => Opportunity.Open(
        new TenantId(Guid.NewGuid()), "Servicio de calibración", CustomerId.New(), null,
        null, "ARS", null, null, OpportunityPriority.Normal, null, Now).Value;

    [Fact]
    public void Reversing_an_open_stage_requires_a_reason()
    {
        var opportunity = NewOpportunity();
        opportunity.MoveTo(OpportunityStage.Proposal, null, Now).IsSuccess.Should().BeTrue();
        opportunity.MoveTo(OpportunityStage.Negotiation, null, Now).IsSuccess.Should().BeTrue();

        opportunity.MoveTo(OpportunityStage.Qualified, null, Now).IsFailure.Should().BeTrue();
        opportunity.Stage.Should().Be(OpportunityStage.Negotiation);
        opportunity.MoveTo(OpportunityStage.Qualified, "Cambió el alcance", Now).IsSuccess.Should().BeTrue();
        opportunity.Stage.Should().Be(OpportunityStage.Qualified);
    }

    [Fact]
    public void Closed_opportunity_can_reopen_with_reason()
    {
        var opportunity = NewOpportunity();
        opportunity.MoveTo(OpportunityStage.Proposal, null, Now).IsSuccess.Should().BeTrue();
        opportunity.MoveTo(OpportunityStage.Negotiation, null, Now).IsSuccess.Should().BeTrue();
        opportunity.MoveTo(OpportunityStage.Won, null, Now).IsSuccess.Should().BeTrue();

        opportunity.Reopen(OpportunityStage.Qualified, null, Now).IsFailure.Should().BeTrue();
        opportunity.Reopen(OpportunityStage.Qualified, "El cliente pidió revisar", Now).IsSuccess.Should().BeTrue();
        opportunity.Stage.Should().Be(OpportunityStage.Qualified);
    }
}
