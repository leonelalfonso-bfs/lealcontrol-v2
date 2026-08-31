using System;
using System.Net.Http;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.QA.Models;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.QA.Infrastructure;

public sealed class QaTestContext : IAsyncDisposable
{
    public TenantId TenantId { get; }
    public Guid UserId { get; }
    public HttpClient HttpClient { get; }
    public IServiceScope ServiceScope { get; }
    public QaRun Run { get; }

    public QaTestContext(
        QaWebApplicationFactory factory,
        TenantId? tenantId = null,
        Guid? userId = null,
        QaRun? run = null)
    {
        TenantId = tenantId ?? new TenantId(Guid.NewGuid());
        UserId = userId ?? Guid.NewGuid();
        Run = run ?? new QaRun();
        HttpClient = factory.CreateAuthenticatedClient(TenantId.Value, UserId);
        ServiceScope = factory.Services.CreateScope();
    }

    public T GetService<T>() where T : notnull => ServiceScope.ServiceProvider.GetRequiredService<T>();

    public ValueTask DisposeAsync()
    {
        HttpClient.Dispose();
        ServiceScope.Dispose();
        return ValueTask.CompletedTask;
    }
}
