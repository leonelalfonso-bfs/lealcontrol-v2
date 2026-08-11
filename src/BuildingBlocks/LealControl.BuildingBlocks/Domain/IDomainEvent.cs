namespace LealControl.BuildingBlocks.Domain;

public interface IDomainEvent
{
    Guid EventId { get; }

    DateTimeOccurredUtc OccurredOnUtc { get; }
}

public readonly record struct DateTimeOccurredUtc(DateTime Value)
{
    public static DateTimeOccurredUtc Now() => new(DateTime.UtcNow);
}
