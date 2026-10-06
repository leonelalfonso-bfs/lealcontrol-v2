using System.Text.Json;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace LealControl.Api.Health;

internal static class HealthCheckJsonWriter
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static Task WriteDetailedResponse(HttpContext context, HealthReport report)
    {
        context.Response.ContentType = "application/json; charset=utf-8";

        // /health es anónimo: el detalle de la excepción (cadenas de conexión, hosts, SQL)
        // va al log del servidor y no a la respuesta pública.
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("HealthChecks");
        foreach (var (name, entry) in report.Entries)
        {
            if (entry.Exception is not null)
            {
                logger.LogWarning(entry.Exception, "Health check {Check} en estado {Status}.", name, entry.Status);
            }
        }

        var payload = new
        {
            status = report.Status.ToString(),
            totalDuration = report.TotalDuration.TotalMilliseconds,
            entries = report.Entries.ToDictionary(
                entry => entry.Key,
                entry => new
                {
                    status = entry.Value.Status.ToString(),
                    description = entry.Value.Description,
                    duration = entry.Value.Duration.TotalMilliseconds
                })
        };

        return context.Response.WriteAsJsonAsync(payload, JsonOptions);
    }
}
