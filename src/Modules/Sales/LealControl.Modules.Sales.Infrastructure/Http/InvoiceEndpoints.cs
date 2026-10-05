using System;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using LealControl.BuildingBlocks.Security;
using LealControl.Modules.Sales.Application.Invoices;
using MediatR;
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
