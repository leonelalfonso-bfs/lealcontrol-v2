using System;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using LealControl.BuildingBlocks.Security;
using LealControl.Modules.Sales.Application.Invoices;
using MediatR;
using LealControl.Modules.Crm.Contracts.Fiscal;
using LealControl.Modules.Sales.Infrastructure.Fiscal;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Sales.Infrastructure.Http;

public static class InvoiceEndpoints
{
    public static IEndpointRouteBuilder MapInvoiceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/sales/invoices").WithTags("Invoices").RequirePolicyOnWrites("RequireSales");

        group.MapGet("/", async (string? search, string? status, string? type, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListInvoicesQuery(search, status, type), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapGet("/fiscal-status", async (SalesDbContext db, ITenantContext tenant,
            IConfiguration configuration, CancellationToken cancellationToken) =>
        {
            var tenantId = tenant.TenantId;
            var attempts = await db.FiscalAuthorizationAttempts.AsNoTracking()
                .Where(a => a.TenantId == tenantId)
                .Select(a => new { invoiceId = a.InvoiceId, status = a.Status, voucherNumber = a.VoucherNumber })
                .ToListAsync(cancellationToken);
            return Results.Ok(new
            {
                enabled = configuration.GetValue<bool>("Arca:EnableInvoiceAuthorization"),
                attempts
            });
        }).RequireAuthorization("RequireSales")
          .RequireAuthorization(policy => policy.RequireRole("Admin", "Administrador", "SuperAdmin"));

        // Cotización oficial de ARCA para la fecha de emisión (yyyy-MM-dd); sin fecha, la vigente.
        group.MapGet("/arca-exchange-rate", async (string? date, IArcaFiscalGateway gateway,
            CancellationToken cancellationToken) =>
        {
            var issue = string.IsNullOrWhiteSpace(date) ? null : date.Replace("-", "");
            var query = issue is null ? null : FiscalExchangeRateDate.For(issue, TimeProvider.System.GetUtcNow());
            var rate = await gateway.GetExchangeRateAsync("DOL", query, cancellationToken);
            return Results.Ok(new { ok = rate.Ok, rate = rate.Rate, rateDate = rate.RateDate, detail = rate.Detail });
        }).RequireAuthorization("RequireSales");

        group.MapPost("/{id:guid}/apply-arca-rate", async (Guid id, SalesDbContext db, ITenantContext tenant,
            IArcaFiscalGateway gateway, CancellationToken cancellationToken) =>
        {
            var tenantId = tenant.TenantId;
            var invoice = await db.Invoices.Include(i => i.Items)
                .FirstOrDefaultAsync(i => i.Id == id && i.TenantId == tenantId, cancellationToken);
            if (invoice is null)
                return Results.NotFound();
            if (invoice.Status != "Draft" || invoice.Currency == "ARS" ||
                await db.FiscalAuthorizationAttempts.AnyAsync(a => a.TenantId == tenantId && a.InvoiceId == id, cancellationToken))
                return Results.BadRequest(LealControl.BuildingBlocks.Results.Error.Validation("Sales.Invoice.RateLocked",
                    "Solo se actualiza la cotización de un borrador en moneda extranjera que aún no se envió a ARCA."));
            var issue = invoice.IssueDate.ToString("yyyyMMdd", System.Globalization.CultureInfo.InvariantCulture);
            var rate = await gateway.GetExchangeRateAsync("DOL", FiscalExchangeRateDate.For(issue, TimeProvider.System.GetUtcNow()), cancellationToken);
            if (!rate.Ok)
                return Results.BadRequest(LealControl.BuildingBlocks.Results.Error.Validation("Sales.Invoice.RateUnavailable", rate.Detail));
            invoice.ApplyExchangeRate(rate.Rate);
            await db.SaveChangesAsync(cancellationToken);
            return Results.Ok(InvoiceQueryHandlers.ToDto(invoice));
        }).RequireAuthorization(policy => policy.RequireRole("Admin", "Administrador", "SuperAdmin"));

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new GetInvoiceByIdQuery(id), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.NotFound(res.Error);
        });

        group.MapPost("/", async (CreateInvoiceCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Created($"/api/v1/sales/invoices/{res.Value.Id}", res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/{id:guid}/authorize-arca", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new AuthorizeInvoiceArcaCommand(id), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        }).RequireAuthorization(policy => policy.RequireRole("Admin", "Administrador", "SuperAdmin"));

        group.MapPost("/{id:guid}/recover-arca", async (Guid id,
            LealControl.Modules.Sales.Infrastructure.Fiscal.FiscalVoucherRecoveryService recovery,
            ISender sender, CancellationToken cancellationToken) =>
        {
            var recovered = await recovery.RecoverAsync(id, cancellationToken);
            if (!recovered.Confirmed)
                return Results.BadRequest(LealControl.BuildingBlocks.Results.Error.Validation(
                    "Sales.Invoice.ArcaNotConfirmed", recovered.Detail));
            var res = await sender.Send(new GetInvoiceByIdQuery(id), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.NotFound(res.Error);
        }).RequireAuthorization(policy => policy.RequireRole("Admin", "Administrador", "SuperAdmin"));

        return endpoints;
    }
}
