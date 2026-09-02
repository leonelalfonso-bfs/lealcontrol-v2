using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using LealControl.Api.SuperAdmin;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace LealControl.Api.Public;

public static class PublicWebhookEndpoints
{
    public static IEndpointRouteBuilder MapPublicWebhookEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapPost("/api/v1/public/webhooks/mercadopago", async (
            HttpRequest request,
            MasterDbContext masterDb,
            IConfiguration config,
            IHostEnvironment env,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var logger = loggerFactory.CreateLogger("MercadoPagoWebhook");

            using var reader = new StreamReader(request.Body);
            var rawBody = await reader.ReadToEndAsync(ct);

            var webhookSecret = config["MercadoPago:WebhookSecret"]
                ?? Environment.GetEnvironmentVariable("MP_WEBHOOK_SECRET");

            if (!string.IsNullOrWhiteSpace(webhookSecret))
            {
                var paymentIdForSignature = request.Query["data.id"].ToString();
                if (string.IsNullOrWhiteSpace(paymentIdForSignature))
                {
                    paymentIdForSignature = request.Query["id"].ToString();
                }

                if (!MercadoPagoSignatureValidator.TryValidate(
                        request,
                        paymentIdForSignature,
                        webhookSecret,
                        out var signatureError))
                {
                    logger.LogWarning("MercadoPago webhook rechazado: {Reason}", signatureError);
                    return Results.Json(
                        new { message = "Firma de webhook inválida." },
                        statusCode: StatusCodes.Status401Unauthorized);
                }
            }
            else if (!env.IsDevelopment())
            {
                logger.LogError("MP_WEBHOOK_SECRET no configurado en producción.");
                return Results.Json(
                    new { message = "Webhook no configurado." },
                    statusCode: StatusCodes.Status503ServiceUnavailable);
            }
            else
            {
                logger.LogWarning("MercadoPago webhook aceptado sin validar firma (solo Development).");
            }

            try
            {
                logger.LogInformation("MercadoPago webhook recibido: {Payload}", rawBody);

                var paymentId = request.Query["data.id"].ToString();
                if (string.IsNullOrWhiteSpace(paymentId))
                {
                    paymentId = request.Query["id"].ToString();
                }

                if (string.IsNullOrWhiteSpace(paymentId))
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(rawBody);
                        if (doc.RootElement.TryGetProperty("data", out var data)
                            && data.TryGetProperty("id", out var dataId))
                        {
                            paymentId = dataId.ValueKind == JsonValueKind.String
                                ? dataId.GetString() ?? string.Empty
                                : dataId.GetRawText();
                        }
                    }
                    catch
                    {
                        // MP puede enviar notificaciones sin body JSON útil.
                    }
                }

                if (string.IsNullOrWhiteSpace(paymentId))
                {
                    return Results.Ok(new { received = true, ignored = true });
                }

                var alreadyApproved = await masterDb.Payments
                    .AsNoTracking()
                    .AnyAsync(
                        p => p.ExternalPaymentId == paymentId && p.Status == "Approved",
                        ct);
                if (alreadyApproved)
                {
                    logger.LogInformation("Pago MP {PaymentId} ya procesado (idempotente).", paymentId);
                    return Results.Ok(new { received = true, duplicate = true });
                }

                var mpAccessToken = config["MercadoPago:AccessToken"]
                    ?? Environment.GetEnvironmentVariable("MP_ACCESS_TOKEN");

                if (string.IsNullOrWhiteSpace(mpAccessToken))
                {
                    logger.LogWarning("MP_ACCESS_TOKEN no configurado; no se puede confirmar el pago {PaymentId}.", paymentId);
                    return Results.Ok(new { received = true, pendingVerification = true });
                }

                using var http = new HttpClient();
                http.DefaultRequestHeaders.Authorization =
                    new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", mpAccessToken);

                var paymentRes = await http.GetAsync($"https://api.mercadopago.com/v1/payments/{paymentId}", ct);
                if (!paymentRes.IsSuccessStatusCode)
                {
                    logger.LogWarning("MP API devolvió {Status} para pago {PaymentId}.", paymentRes.StatusCode, paymentId);
                    return Results.Ok(new { received = true });
                }

                var paymentJson = await paymentRes.Content.ReadFromJsonAsync<JsonElement>(cancellationToken: ct);
                var status = paymentJson.GetProperty("status").GetString();
                var externalRef = paymentJson.TryGetProperty("external_reference", out var ext)
                    ? ext.GetString()
                    : null;

                if (status == "approved" && Guid.TryParse(externalRef, out var tenantId))
                {
                    var tenant = await masterDb.Tenants.FirstOrDefaultAsync(t => t.Id == tenantId, ct);
                    if (tenant != null)
                    {
                        tenant.Status = "Active";
                        tenant.ExpiresAtUtc = (tenant.ExpiresAtUtc.HasValue && tenant.ExpiresAtUtc.Value > DateTime.UtcNow)
                            ? tenant.ExpiresAtUtc.Value.AddMonths(1)
                            : DateTime.UtcNow.AddMonths(1);

                        masterDb.Payments.Add(new TenantPaymentRecord
                        {
                            TenantId = tenant.Id,
                            ExternalPaymentId = paymentId,
                            Amount = tenant.MonthlyPriceArs,
                            Currency = "ARS",
                            Status = "Approved",
                            ApprovedAtUtc = DateTime.UtcNow,
                            PayerEmail = tenant.AdminEmail,
                            RawPayloadJson = paymentJson.ToString()
                        });

                        await masterDb.SaveChangesAsync(ct);
                        logger.LogInformation(
                            "Suscripción renovada para tenant {TenantName} hasta {Expiry}",
                            tenant.Name,
                            tenant.ExpiresAtUtc);
                    }
                }

                return Results.Ok(new { received = true });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Error procesando webhook MercadoPago");
                return Results.Ok(new { received = true });
            }
        })
        .WithTags("Public Webhooks")
        .RequireRateLimiting("auth-policy")
        .AllowAnonymous();

        return endpoints;
    }
}

internal static class MercadoPagoSignatureValidator
{
    public static bool TryValidate(HttpRequest request, string dataId, string webhookSecret, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(dataId))
        {
            error = "Falta data.id en la notificación.";
            return false;
        }

        var xSignature = request.Headers["x-signature"].ToString();
        var xRequestId = request.Headers["x-request-id"].ToString();
        if (string.IsNullOrWhiteSpace(xSignature) || string.IsNullOrWhiteSpace(xRequestId))
        {
            error = "Faltan headers x-signature o x-request-id.";
            return false;
        }

        string? ts = null;
        string? receivedHash = null;
        foreach (var part in xSignature.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var kv = part.Split('=', 2);
            if (kv.Length != 2)
            {
                continue;
            }

            if (kv[0] == "ts")
            {
                ts = kv[1];
            }
            else if (kv[0] == "v1")
            {
                receivedHash = kv[1];
            }
        }

        if (string.IsNullOrWhiteSpace(ts) || string.IsNullOrWhiteSpace(receivedHash))
        {
            error = "Formato x-signature inválido.";
            return false;
        }

        var manifest = $"id:{dataId};request-id:{xRequestId};ts:{ts};";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(webhookSecret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(manifest));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();

        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected),
                Encoding.UTF8.GetBytes(receivedHash.ToLowerInvariant())))
        {
            error = "HMAC no coincide.";
            return false;
        }

        return true;
    }
}
