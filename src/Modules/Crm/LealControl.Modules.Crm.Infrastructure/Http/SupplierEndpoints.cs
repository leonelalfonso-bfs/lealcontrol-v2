using System;
using LealControl.Modules.Crm.Application.Suppliers;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public static class SupplierEndpoints
{
    public static IEndpointRouteBuilder MapSupplierEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/crm/suppliers").WithTags("Suppliers");

        group.MapGet("/", async (string? search, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListSuppliersQuery(search), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new GetSupplierByIdQuery(id), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.NotFound(res.Error);
        });

        group.MapPost("/", async (SupplierWriteDto model, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new CreateSupplierCommand(model), cancellationToken);
            return res.IsSuccess ? Results.Created($"/api/v1/crm/suppliers/{res.Value.Id}", res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPut("/{id:guid}", async (Guid id, SupplierWriteDto model, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new UpdateSupplierCommand(id, model), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new DeleteSupplierCommand(id), cancellationToken);
            return res.IsSuccess ? Results.NoContent() : Results.BadRequest(res.Error);
        });

        return endpoints;
    }
}
