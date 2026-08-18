using System;
using LealControl.Modules.Sales.Application.Remitos;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Sales.Infrastructure.Http;

public static class RemitoEndpoints
{
    public static IEndpointRouteBuilder MapRemitoEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/sales/remitos").WithTags("Remitos");

        group.MapGet("/", async (string? search, string? status, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListRemitosQuery(search, status), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new GetRemitoByIdQuery(id), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.NotFound(res.Error);
        });

        group.MapPost("/", async (CreateRemitoCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Created($"/api/v1/sales/remitos/{res.Value.Id}", res.Value) : Results.BadRequest(res.Error);
        });

        return endpoints;
    }
}
