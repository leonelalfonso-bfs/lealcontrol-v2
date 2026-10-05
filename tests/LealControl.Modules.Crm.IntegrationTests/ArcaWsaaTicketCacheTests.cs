using LealControl.Modules.Crm.Infrastructure.Arca;
using Xunit;

namespace LealControl.Modules.Crm.IntegrationTests;

public sealed class ArcaWsaaTicketCacheTests
{
    private sealed class Clock : TimeProvider
    {
        internal DateTimeOffset Now = new(2026, 10, 5, 12, 0, 0, TimeSpan.Zero);
        public override DateTimeOffset GetUtcNow() => Now;
    }
    private static readonly ArcaWsaaTicketCache.Key Key = new("certificate", "wsfe", false);
    private static ArcaWsaaTicketCache.Ticket Valid(Clock clock) =>
        new(true, "test-token", "test-sign", clock.Now.AddHours(1), "OK");

    [Fact]
    public async Task Concurrent_requests_share_one_ticket_and_reuse_it()
    {
        var clock = new Clock(); var cache = new ArcaWsaaTicketCache(clock); var calls = 0;
        var entered = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        async Task<ArcaWsaaTicketCache.Ticket> Request()
        { Interlocked.Increment(ref calls); entered.SetResult(true); await release.Task; return Valid(clock); }
        var first = cache.GetAsync(Key, Request, default);
        await entered.Task;
        var second = cache.GetAsync(Key, Request, default);
        release.SetResult(true);
        var results = await Task.WhenAll(first, second);
        Assert.All(results, r => Assert.True(r.Ok));
        Assert.Equal(results[0].Token, results[1].Token);
        Assert.True((await cache.GetAsync(Key, Request, default)).Ok);
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task Exact_expiration_requests_a_new_ticket()
    {
        var clock = new Clock(); var cache = new ArcaWsaaTicketCache(clock); var calls = 0;
        Task<ArcaWsaaTicketCache.Ticket> Request() { calls++; return Task.FromResult(Valid(clock)); }
        await cache.GetAsync(Key, Request, default);
        clock.Now = clock.Now.AddHours(1);
        await cache.GetAsync(Key, Request, default);
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Certificate_service_and_environment_have_separate_tickets()
    {
        var clock = new Clock(); var cache = new ArcaWsaaTicketCache(clock); var calls = 0;
        Task<ArcaWsaaTicketCache.Ticket> Request() { calls++; return Task.FromResult(Valid(clock)); }
        foreach (var key in new[] { Key, Key with { Thumbprint = "other" },
            Key with { Service = "ws_sr_constancia_inscripcion" }, Key with { Production = true } })
        { await cache.GetAsync(key, Request, default); await cache.GetAsync(key, Request, default); }
        Assert.Equal(4, calls);
    }

    [Theory]
    [InlineData(false, true, true)]
    [InlineData(true, false, true)]
    [InlineData(true, true, false)]
    public async Task Failed_incomplete_or_expired_tickets_are_not_cached(bool ok, bool hasToken, bool future)
    {
        var clock = new Clock(); var cache = new ArcaWsaaTicketCache(clock); var calls = 0;
        Task<ArcaWsaaTicketCache.Ticket> Request()
        { calls++; return Task.FromResult(new ArcaWsaaTicketCache.Ticket(ok, hasToken ? "token" : null,
            "sign", future ? clock.Now.AddHours(1) : clock.Now, "test")); }
        Assert.False((await cache.GetAsync(Key, Request, default)).Ok);
        Assert.False((await cache.GetAsync(Key, Request, default)).Ok);
        Assert.Equal(2, calls);
    }

    [Fact]
    public async Task Cancellation_releases_the_gate_for_the_next_request()
    {
        var clock = new Clock(); var cache = new ArcaWsaaTicketCache(clock);
        await Assert.ThrowsAsync<OperationCanceledException>(() => cache.GetAsync(Key,
            () => throw new OperationCanceledException(), default));
        Assert.True((await cache.GetAsync(Key, () => Task.FromResult(Valid(clock)), default)).Ok);
    }
}
