using System;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Settings;
using MediatR;
using System.Collections.Generic;
using Microsoft.AspNetCore.Authorization;
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
        }).RequireAuthorization("RequireAdmin");

        group.MapGet("/document-templates", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new GetDocumentTemplatesQuery(), cancellationToken);
            if (!res.IsSuccess) return Results.BadRequest(res.Error);
            return res.Value is null ? Results.NoContent() : Results.Content(res.Value, "application/json");
        });

        group.MapPut("/document-templates", async (System.Text.Json.JsonElement body, ISender sender, CancellationToken cancellationToken) =>
        {
            if (body.ValueKind != System.Text.Json.JsonValueKind.Object)
                return Results.BadRequest(new { detail = "Las plantillas tienen que ser un objeto JSON." });
            var res = await sender.Send(new SaveDocumentTemplatesCommand(body.GetRawText()), cancellationToken);
            return res.IsSuccess ? Results.Content(res.Value ?? "{}", "application/json") : Results.BadRequest(res.Error);
        }).RequireAuthorization("RequireAdmin");

        group.MapPost("/settings/arca-certificate", async (UploadArcaCertificateCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        }).RequireAuthorization("RequireAdmin");

        group.MapPost("/settings/arca-csr", async (GenerateArcaCsrCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        }).RequireAuthorization("RequireAdmin");

        group.MapGet("/settings/arca-sales-points", async (IArcaIntegration arca, CancellationToken cancellationToken) =>
        {
            var res = await arca.ListSalesPointsAsync(cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(new { detail = res.Error.Message });
        });

        group.MapGet("/settings/arca-last-authorized", async (
            int pointOfSale, string invoiceType, IArcaIntegration arca, CancellationToken cancellationToken) =>
        {
            var res = await arca.GetLastAuthorizedAsync(pointOfSale, invoiceType, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(new { detail = res.Error.Message });
        }).RequireAuthorization("RequireAdmin");

        group.MapGet("/settings/arca-diagnostics", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new DiagnoseArcaQuery(), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        }).RequireAuthorization("RequireAdmin");

        group.MapGet("/users", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListTenantUsersQuery(), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/users", async (CreateTenantUserCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        }).RequireAuthorization("RequireAdmin");

        group.MapPut("/users/{id:guid}", async (Guid id, UpdateTenantUserCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            if (id != cmd.Id) cmd = cmd with { Id = id };
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        }).RequireAuthorization("RequireAdmin");

        group.MapDelete("/users/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new DeleteTenantUserCommand(id), cancellationToken);
            return res.IsSuccess ? Results.NoContent() : Results.BadRequest(res.Error);
        }).RequireAuthorization("RequireAdmin");

        return endpoints;
    }
}
