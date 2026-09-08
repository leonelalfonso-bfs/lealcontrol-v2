using LealControl.Modules.Crm.Infrastructure.Tenancy;
using Microsoft.AspNetCore.Http;
using Serilog.Core;
using Serilog.Events;

namespace LealControl.Api.Logging;

public sealed class TenantIdEnricher(IHttpContextAccessor httpContextAccessor) : ILogEventEnricher
{
    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory propertyFactory)
    {
        var http = httpContextAccessor.HttpContext;
        string tenantId = "none";

        if (http?.User?.Identity?.IsAuthenticated == true)
        {
            tenantId = http.User.FindFirst("tenant_id")?.Value
                ?? http.Request.Headers[HttpTenantContext.HeaderName].ToString()
                ?? "none";
        }
        else if (http?.Request.Headers.TryGetValue(HttpTenantContext.HeaderName, out var header) == true
            && !string.IsNullOrWhiteSpace(header.ToString()))
        {
            tenantId = header.ToString();
        }

        logEvent.AddPropertyIfAbsent(propertyFactory.CreateProperty("TenantId", tenantId));
    }
}
