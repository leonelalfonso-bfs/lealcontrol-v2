using System;
using LealControl.Modules.Crm.Application.Settings;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public static class CompanySettingsEndpoints
{
    public static IEndpointRouteBuilder MapCompanySettingsModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/company").WithTags("Company Settings");

        group.MapGet("/settings", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new GetCompanySettingsQuery(), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPut("/settings", async (CompanySettingsDto model, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new UpdateCompanySettingsCommand(model), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/settings/arca-certificate", async (UploadArcaCertificateCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapGet("/users", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListTenantUsersQuery(), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/users", async (CreateTenantUserCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPut("/users/{id:guid}", async (Guid id, UpdateTenantUserCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            if (id != cmd.Id) cmd = cmd with { Id = id };
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        return endpoints;
    }
}
