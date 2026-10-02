using LealControl.Modules.Crm.Application.Customers;
using LealControl.Modules.Crm.Application.Customers.GetCustomer;
using LealControl.Modules.Crm.Application.Customers.ManageLocations;
using LealControl.Modules.Crm.Application.Customers.Models;
using LealControl.Modules.Crm.Application.Customers.RegisterCustomer;
using LealControl.Modules.Crm.Application.Customers.UpdateCustomer;
using LealControl.Modules.Crm.Application.Leads;
using LealControl.Modules.Crm.Application.Pipeline;
using LealControl.Modules.Crm.Domain.Opportunities;
using LealControl.Modules.Crm.Domain.Shared;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace LealControl.Modules.Crm.Infrastructure.Http;

public static class CrmEndpoints
{
    public static IEndpointRouteBuilder MapCrmModule(this IEndpointRouteBuilder endpoints)
    {
        var crm = endpoints.MapGroup("/api/v1/crm")
            .WithTags("CRM")
            .AddEndpointFilter(EnsureCrmSchemaFilter);

        MapCustomers(crm);
        MapLeads(crm);
        MapPipeline(crm);
        endpoints.MapCompanySettingsModule();
        endpoints.MapSupplierEndpoints();
        endpoints.MapAuthEndpoints();
        return endpoints;
    }

    /// <summary>
    /// Completa columnas/tablas CRM faltantes (tenants legacy o Migrate omitido),
    /// igual que Quality/Metrology hacen en cada request.
    /// </summary>
    private static async ValueTask<object?> EnsureCrmSchemaFilter(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        try
        {
            var db = context.HttpContext.RequestServices.GetRequiredService<CrmDbContext>();
            await db.EnsureCrmTablesAsync(context.HttpContext.RequestAborted);
        }
        catch
        {
            // El repositorio reintenta fallas de esquema reparables; las persistentes se propagan.
        }

        return await next(context);
    }

    private static void MapCustomers(RouteGroupBuilder crm)
    {
        var customers = crm.MapGroup("/customers");

        customers.MapGet("/", async (
            string? search,
            bool? onlyActive,
            string? role,
            int? page,
            int? pageSize,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var p = page.GetValueOrDefault(1);
            var ps = pageSize.GetValueOrDefault(25);
            var result = await sender.Send(
                new ListCustomersQuery(search, onlyActive, role, p <= 0 ? 1 : p, ps <= 0 ? 25 : ps),
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

        customers.MapPost("/{id:guid}/bcra-sync", async (
            Guid id,
            UpdateBcraReportRequest body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(
                new UpdateCustomerBcraCommand(id, body.CreditRating, body.WorstSituation, body.TotalDebt, body.RejectedChequesCount, body.Recommendation),
                cancellationToken);
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
            AddCustomerContactRequest body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var command = new AddCustomerContactCommand(
                id,
                body.Name,
                body.ParseRole(),
                body.LocationId,
                body.Email,
                body.Phone,
                body.WhatsApp,
                body.IsPrimary,
                body.Notes);
            var result = await sender.Send(command, cancellationToken);
            return result.ToHttp(StatusCodes.Status201Created);
        });

        customers.MapPut("/{id:guid}/contacts/{contactId:guid}", async (
            Guid id,
            Guid contactId,
            AddCustomerContactRequest body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var command = new UpdateCustomerContactCommand(
                id,
                contactId,
                body.Name,
                body.ParseRole(),
                body.LocationId,
                body.Email,
                body.Phone,
                body.WhatsApp,
                body.IsPrimary,
                body.Notes);
            var result = await sender.Send(command, cancellationToken);
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

        customers.MapGet("/consult-cuit/{cuit}", async (
            string cuit,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ConsultArcaCuitQuery(cuit), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPost("/{id:guid}/equipments", async (
            Guid id,
            AddCustomerEquipmentCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body with { CustomerId = id }, cancellationToken);
            return result.ToHttp(StatusCodes.Status201Created);
        });

        customers.MapPut("/{id:guid}/equipments/{equipmentId:guid}", async (
            Guid id,
            Guid equipmentId,
            UpdateCustomerEquipmentCommand body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(body with { CustomerId = id, EquipmentId = equipmentId }, cancellationToken);
            return result.ToHttp();
        });

        customers.MapDelete("/{id:guid}/equipments/{equipmentId:guid}", async (
            Guid id,
            Guid equipmentId,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new RemoveCustomerEquipmentCommand(id, equipmentId), cancellationToken);
            return result.ToHttp();
        });

        customers.MapPut("/{id:guid}/fiscal-rates", async (
            Guid id,
            UpsertCustomerFiscalRateRequest body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            if (!body.TryParseJurisdiction(out var jurisdiction))
                return Results.BadRequest(new { message = "Elegí una jurisdicción fiscal válida." });
            if (body.HasPerceptionExclusion is null || body.HasRetentionExclusion is null)
                return Results.BadRequest(new { message = "Indicá expresamente ambas exclusiones fiscales." });

            var command = new UpsertCustomerFiscalRateCommand(
                id,
                jurisdiction,
                body.PerceptionRate,
                body.RetentionRate,
                body.HasPerceptionExclusion.Value,
                body.PerceptionExclusionExpiresOn,
                body.HasRetentionExclusion.Value,
                body.RetentionExclusionExpiresOn,
                body.ExclusionCertificateNumber);
            var result = await sender.Send(command, cancellationToken);
            return result.ToHttp();
        });

        customers.MapGet("/{id:guid}/opportunities", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListCustomerOpportunitiesQuery(id), cancellationToken);
            return result.ToHttp();
        });

        customers.MapGet("/{id:guid}/timeline", async (
            Guid id,
            ISender sender,
            CancellationToken cancellationToken,
            int take = 50) =>
        {
            var result = await sender.Send(new ListCustomerTimelineQuery(id, take <= 0 ? 50 : take), cancellationToken);
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
            bool? createOpportunity,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ConvertLeadCommand(id, body, createOpportunity ?? true), cancellationToken);
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
        crm.MapGet("/opportunities/kanban", async (string? ownerName, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new GetKanbanBoardQuery(ownerName), cancellationToken);
            return result.ToHttp();
        });

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
            var result = await sender.Send(new MoveOpportunityCommand(
                id, body.Stage, body.LostReason, body.Probability, body.CustomFields,
                body.ActivityDescription, body.NextFollowUpOn), cancellationToken);
            return result.ToHttp();
        });

        crm.MapPost("/opportunities/{id:guid}/classify", async (
            Guid id,
            ClassifyOpportunityRequest body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(
                new ClassifyOpportunityCommand(id, body.Priority, body.OwnerName, body.OwnerId, body.Tags, body.ExpectedCloseDate),
                cancellationToken);
            return result.ToHttp();
        });

        crm.MapGet("/reports/pipeline", async (
            string? ownerName,
            DateTime? fromUtc,
            DateTime? toUtc,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new GetPipelineReportQuery(ownerName, fromUtc, toUtc), cancellationToken);
            return result.ToHttp();
        });

        crm.MapGet("/activities/follow-ups", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListFollowUpsQuery(), cancellationToken);
            return result.ToHttp();
        });

        crm.MapGet("/opportunities/{id:guid}/timeline", async (
            Guid id,
            ISender sender,
            CancellationToken cancellationToken,
            int take = 100) =>
        {
            var result = await sender.Send(new ListOpportunityTimelineQuery(id, take <= 0 ? 100 : take), cancellationToken);
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

public sealed record MoveOpportunityRequest(
    OpportunityStage Stage,
    string? LostReason,
    int? Probability = null,
    Dictionary<string, string>? CustomFields = null,
    string? ActivityDescription = null,
    DateTime? NextFollowUpOn = null);

public sealed record ClassifyOpportunityRequest(
    OpportunityPriority Priority,
    string? OwnerName,
    Guid? OwnerId,
    IReadOnlyList<string>? Tags,
    DateTime? ExpectedCloseDate);

public sealed record AddCustomerContactRequest(
    string Name,
    string? Role,
    Guid? LocationId,
    string? Email,
    string? Phone,
    string? WhatsApp,
    bool IsPrimary,
    string? Notes)
{
    public ContactRole ParseRole()
    {
        if (string.IsNullOrWhiteSpace(Role)) return ContactRole.Commercial;
        var r = Role.Trim().ToLowerInvariant();
        if (r.Contains("compr") || r.Contains("vent") || r.Contains("comercial") || r.Contains("commercial")) return ContactRole.Commercial;
        if (r.Contains("tecn") || r.Contains("técn") || r.Contains("technical") || r.Contains("serv")) return ContactRole.Technical;
        if (r.Contains("admin") || r.Contains("contab") || r.Contains("pago")) return ContactRole.Administrative;
        if (Enum.TryParse<ContactRole>(Role, true, out var parsed)) return parsed;
        return ContactRole.Other;
    }
}

public sealed record UpsertCustomerFiscalRateRequest(
    string? Jurisdiction,
    decimal PerceptionRate,
    decimal RetentionRate,
    bool? HasPerceptionExclusion,
    DateOnly? PerceptionExclusionExpiresOn,
    bool? HasRetentionExclusion,
    DateOnly? RetentionExclusionExpiresOn,
    string? ExclusionCertificateNumber)
{
    public bool TryParseJurisdiction(out FiscalJurisdiction jurisdiction)
    {
        jurisdiction = default;
        if (string.IsNullOrWhiteSpace(Jurisdiction)) return false;
        var j = Jurisdiction.Trim().ToLowerInvariant();
        if (j is "caba" or "agip") jurisdiction = FiscalJurisdiction.Agip;
        else if (j is "arba" or "buenos aires" or "buenosaires" or "pba") jurisdiction = FiscalJurisdiction.Arba;
        else if (j is "santa fe" or "santafe" or "api" or "api santa fe") jurisdiction = FiscalJurisdiction.ApiSantaFe;
        else if (j is "cordoba" or "córdoba" or "rentas cordoba" or "rentas córdoba") jurisdiction = FiscalJurisdiction.DgrCordoba;
        else if (j is "mendoza" or "dgr mendoza" or "rentas mendoza") jurisdiction = FiscalJurisdiction.DgrMendoza;
        else if (j is "tucuman" or "tucumán" or "dgr tucuman" or "dgr tucumán" or "rentas tucumán") jurisdiction = FiscalJurisdiction.DgrTucuman;
        else if (j is "entre rios" or "entre ríos" or "dgr entre rios" or "dgr entre ríos" or "rentas entre ríos") jurisdiction = FiscalJurisdiction.DgrEntreRios;
        else if (j is "ganancias") jurisdiction = FiscalJurisdiction.Ganancias;
        else
        {
            foreach (var value in Enum.GetValues<FiscalJurisdiction>())
            {
                if (!string.Equals(value.ToString(), j, StringComparison.OrdinalIgnoreCase)) continue;
                jurisdiction = value;
                return true;
            }
            return false;
        }
        return true;
    }
}
