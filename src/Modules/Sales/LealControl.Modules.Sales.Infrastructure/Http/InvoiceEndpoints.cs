using System;
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
        var group = endpoints.MapGroup("/api/v1/sales/invoices").WithTags("Invoices");

        group.MapGet("/", async (string? search, string? status, string? type, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListInvoicesQuery(search, status, type), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

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
        });

        return endpoints;
    }
}
