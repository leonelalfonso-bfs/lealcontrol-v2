using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Api.Automation;

public record AnalyzeCctRequest(string CctNumber, string? Base64Document, string? MimeType);
public record ExtractInvoiceOcrRequest(string Base64Document, string MimeType);

public static class AutomationEndpoints
{
    public static IEndpointRouteBuilder MapAutomationEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/automation")
                       .WithTags("Automation & AI");

        group.MapGet("/status", async (GeminiApiClient client, CancellationToken ct) =>
        {
            var (success, message) = await client.TestConnectionAsync(ct);
            return success ? Results.Ok(new { status = "Healthy", message }) : Results.Problem(message);
        });

        group.MapPost("/cct/analyze", async (AnalyzeCctRequest request, GeminiApiClient client, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.CctNumber))
            {
                return Results.BadRequest(new { error = "Debe especificar el número o denominación del CCT." });
            }

            var result = await client.AnalyzeCctAgreementAsync(request.CctNumber, request.Base64Document, request.MimeType, ct);
            if (result == null)
            {
                return Results.Problem("No se pudo obtener el análisis del convenio desde Gemini.");
            }

            return Results.Ok(result);
        });

        group.MapPost("/invoice/ocr", async (ExtractInvoiceOcrRequest request, GeminiApiClient client, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(request.Base64Document))
            {
                return Results.BadRequest(new { error = "Debe enviar el archivo del comprobante en Base64." });
            }

            var result = await client.ExtractInvoiceOcrAsync(request.Base64Document, request.MimeType, ct);
            if (result == null)
            {
                return Results.Problem("No se pudo extraer la información del comprobante.");
            }

            return Results.Ok(result);
        });

        group.MapGet("/bcra/{cuit}", async (string cuit, BcraApiClient client, CancellationToken ct) =>
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
        });

        return app;
    }
}
