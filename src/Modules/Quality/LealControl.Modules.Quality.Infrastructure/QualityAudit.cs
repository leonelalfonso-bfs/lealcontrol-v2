using System.Security.Claims;
using System.Text.Json;
using LealControl.BuildingBlocks.Domain;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Http;

namespace LealControl.Modules.Quality.Infrastructure;

public static class QualityAuditEntityTypes
{
    public const string DocumentVersion = "DocumentVersion";
    public const string IndicatorValue = "IndicatorValue";
    public const string Complaint = "Complaint";
    public const string NonConformity = "NonConformity";
    public const string InternalAudit = "InternalAudit";
    public const string TrainingPlanItem = "TrainingPlanItem";
    public const string PersonnelAuthorization = "PersonnelAuthorization";
    public const string CompetenceReview = "CompetenceReview";
    public const string RoleAssignment = "RoleAssignment";
}

public sealed class QualityAuditEvent : Entity<Guid>
{
    public QualityAuditEvent() : base(Guid.NewGuid())
    {
    }

    public QualityAuditEvent(Guid id) : base(id)
    {
    }

    public TenantId TenantId { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public Guid EntityId { get; set; }
    public string EventType { get; set; } = string.Empty;
    public string Summary { get; set; } = string.Empty;
    public string BeforeJson { get; set; } = string.Empty;
    public string AfterJson { get; set; } = string.Empty;
    public Guid? PerformedByUserId { get; set; }
    public string PerformedByName { get; set; } = string.Empty;
    public DateTime OccurredAtUtc { get; set; } = DateTime.UtcNow;
}

public static class QualityAudit
{
    public static void Record(
        QualityDbContext db,
        TenantId tenantId,
        string entityType,
        Guid entityId,
        string eventType,
        string summary,
        object? before,
        object? after,
        HttpContext? http = null)
    {
        db.AuditEvents.Add(new QualityAuditEvent(Guid.NewGuid())
        {
            TenantId = tenantId,
            EntityType = entityType,
            EntityId = entityId,
            EventType = eventType,
            Summary = summary,
            BeforeJson = Serialize(before),
            AfterJson = Serialize(after),
            PerformedByUserId = Guid.TryParse(http?.User.FindFirst("sub")?.Value, out var userId) ? userId : null,
            PerformedByName = http?.User.FindFirst("name")?.Value
                ?? http?.User.FindFirst(ClaimTypes.Name)?.Value
                ?? string.Empty,
            OccurredAtUtc = DateTime.UtcNow
        });
    }

    private static string Serialize(object? value) =>
        value is null ? string.Empty : JsonSerializer.Serialize(value);
}
