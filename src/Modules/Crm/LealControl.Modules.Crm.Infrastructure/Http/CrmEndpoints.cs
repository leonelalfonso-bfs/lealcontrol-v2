using LealControl.Modules.Crm.Application.Customers.GetCustomer;
using LealControl.Modules.Crm.Application.Customers.ManageLocations;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Application.Customers.RegisterCustomer;
using LealControl.Modules.Crm.Application.Customers.UpdateCustomer;
using LealControl.Modules.Crm.Application.Leads;
using LealControl.Modules.Crm.Application.Pipeline;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Domain.Shared;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public static class CrmEndpoints
{
    public static IEndpointRouteBuilder MapCrmModule(this IEndpointRouteBuilder endpoints)
    {
        var crm = endpoints.MapGroup("/api/v1/crm").WithTags("CRM");

        MapCustomers(crm);
        MapLeads(crm);
        MapPipeline(crm);
        return endpoints;
    }

    private static void MapCustomers(RouteGroupBuilder crm)
    {
        var customers = crm.MapGroup("/customers");

        customers.MapGet("/", async (
            string? search,
            bool? onlyActive,
            int page,
            int pageSize,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(
                new ListCustomersQuery(search, onlyActive, page == 0 ? 1 : page, pageSize == 0 ? 25 : pageSize),
                cancellationToken);
            return result.ToHttp();
        });

        customers.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new GetCustomerQuery(id), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPost("/", async (CustomerWriteModel body, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new RegisterCustomerCommand(body), cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/crm/customers/{result.Value.Id}")
                : result.ToHttp();
        });

        customers.MapPut("/{id:guid}", async (
            Guid id,
            CustomerWriteModel body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new UpdateCustomerCommand(id, body), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPost("/{id:guid}/activate", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ChangeCustomerStatusCommand(id, CustomerStatus.Active), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPost("/{id:guid}/deactivate", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ChangeCustomerStatusCommand(id, CustomerStatus.Inactive), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPost("/{id:guid}/locations", async (
            Guid id,
            AddCustomerLocationCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body with { CustomerId = id }, cancellationToken);
            return result.ToHttp(StatusCodes.Status201Created);
        });

        customers.MapPut("/{id:guid}/locations/{locationId:guid}", async (
            Guid id,
            Guid locationId,
            UpdateCustomerLocationCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body with { CustomerId = id, LocationId = locationId }, cancellationToken);
            return result.ToHttp();
        });

        customers.MapDelete("/{id:guid}/locations/{locationId:guid}", async (
            Guid id,
            Guid locationId,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new RemoveCustomerLocationCommand(id, locationId), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPost("/{id:guid}/contacts", async (
            Guid id,
            AddCustomerContactCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body with { CustomerId = id }, cancellationToken);
            return result.ToHttp(StatusCodes.Status201Created);
        });

        customers.MapPut("/{id:guid}/contacts/{contactId:guid}", async (
            Guid id,
            Guid contactId,
            UpdateCustomerContactCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body with { CustomerId = id, ContactId = contactId }, cancellationToken);
            return result.ToHttp();
        });

        customers.MapDelete("/{id:guid}/contacts/{contactId:guid}", async (
            Guid id,
            Guid contactId,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new RemoveCustomerContactCommand(id, contactId), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPut("/{id:guid}/fiscal-rates", async (
            Guid id,
            UpsertCustomerFiscalRateCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body with { CustomerId = id }, cancellationToken);
            return result.ToHttp();
        });

        customers.MapGet("/{id:guid}/opportunities", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListCustomerOpportunitiesQuery(id), cancellationToken);
            return result.ToHttp();
        });

        customers.MapGet("/{id:guid}/timeline", async (
            Guid id,
            int take,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListCustomerTimelineQuery(id, take == 0 ? 50 : take), cancellationToken);
            return result.ToHttp();
        });
    }

    private static void MapLeads(RouteGroupBuilder crm)
    {
        var leads = crm.MapGroup("/leads");

        leads.MapGet("/", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListLeadsQuery(), cancellationToken);
            return result.ToHttp();
        });

        leads.MapPost("/", async (CaptureLeadCommand body, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body, cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/crm/leads/{result.Value.Id}")
                : result.ToHttp();
        });

        leads.MapPost("/{id:guid}/convert", async (
            Guid id,
            CustomerWriteModel body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ConvertLeadCommand(id, body), cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/crm/customers/{result.Value.Id}")
                : result.ToHttp();
        });

        leads.MapPost("/{id:guid}/archive", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ArchiveLeadCommand(id), cancellationToken);
            return result.ToHttp();
        });
    }

    private static void MapPipeline(RouteGroupBuilder crm)
    {
        crm.MapGet("/opportunities", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListOpportunitiesQuery(), cancellationToken);
            return result.ToHttp();
        });

        crm.MapPost("/opportunities", async (
            OpenOpportunityCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body, cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/crm/opportunities/{result.Value.Id}")
                : result.ToHttp();
        });

        crm.MapPost("/opportunities/{id:guid}/move", async (
            Guid id,
            MoveOpportunityRequest body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new MoveOpportunityCommand(id, body.Stage, body.LostReason), cancellationToken);
            return result.ToHttp();
        });

        crm.MapPost("/activities", async (LogActivityCommand body, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body, cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/crm/activities/{result.Value.Id}")
                : result.ToHttp();
        });
    }
}

public sealed record MoveOpportunityRequest(OpportunityStage Stage, string? LostReason);
