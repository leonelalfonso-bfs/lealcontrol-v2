namespace LealControl.Modules.Crm.IntegrationTests;
internal sealed class FiscalTestClock : TimeProvider
{
    public DateTimeOffset Now { get; set; } = new(2026, 10, 2, 15, 0, 0, TimeSpan.Zero);
    public override DateTimeOffset GetUtcNow() => Now;
}
