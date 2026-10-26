using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Api.Automation;

public static class AutomationEndpoints
{
    public static IEndpointRouteBuilder MapAutomationEndpoints(this IEndpointRouteBuilder app)
    {
        // Informe BCRA lo usa Comercial al dar de alta un cliente: alcanza con estar logueado.
        app.MapGet("/api/v1/automation/bcra/{cuit}", async (string cuit, BcraApiClient client, CancellationToken ct) =>
        {
            try
            {
                var report = await client.GetCreditReportAsync(cuit, ct);
                return Results.Ok(report);
            }
            catch (Exception ex)
            {
                return Results.BadRequest(new { error = ex.Message });
            }
        }).WithTags("BCRA").RequireAuthorization();

        return app;
    }
}
