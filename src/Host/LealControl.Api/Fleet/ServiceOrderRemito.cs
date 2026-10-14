using System.Text.RegularExpressions;
using LealControl.Api.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Crm.Domain.Settings;
using LealControl.Modules.Fleet.Infrastructure;
using LealControl.Modules.Sales.Application.Inventory;
using LealControl.Modules.Sales.Application.Orders;
using LealControl.Modules.Sales.Application.Remitos;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace LealControl.Api.Fleet;

public sealed record ServiceOrderRemitoLine(Guid OrderLineId, decimal Quantity);
public sealed record CreateServiceOrderRemitoRequest(ServiceOrderRemitoLine[]? Lines);

/// <summary>Línea del pedido con lo que falta entregar.</summary>
public sealed record PendingOrderLine(Guid Id, Guid? ProductId, string Description, decimal Ordered, decimal Delivered, decimal Pending);

/// <summary>A dónde va cada repuesto: al remito, a consumo (descuenta stock sin remito) o solo queda anotado.</summary>
public sealed record ServiceOrderItemDestination(Guid Id, Guid? ProductId, string Description, decimal Quantity, string? SerialNumbers, string Destination);

public sealed record ServiceOrderRemitoPreview(
    bool Ready, string? Problem, Guid? SalesOrderId, string? SalesOrderNumber,
    PendingOrderLine[] OrderLines, ServiceOrderItemDestination[] Items);

/// <summary>
/// Remito desde una orden de servicio. Vive en el host porque une Flota (la orden) con Ventas
/// (remito y stock). El remito lleva las líneas del pedido y los repuestos que están en el
/// pedido; los demás repuestos con producto se descuentan como consumo. El stock se mueve una
/// sola vez: la orden queda marcada y Ventas no repite un consumo de la misma orden.
/// </summary>
public static class ServiceOrderRemitoEndpoints
{
    private const string ReferenceType = "ServiceOrder";

    private static IResult Problem(string message) => Results.BadRequest(new { detail = message });

    /// <summary>La misma clave que usa Ventas para el saldo de un pedido (producto, o descripción sin número de serie).</summary>
    private static string DeliveryKey(Guid? productId, string description)
    {
        if (productId is Guid id && id != Guid.Empty) return "P:" + id.ToString("N");
        var clean = Regex.Replace(description ?? "", @"\s*\(S/N:.*\)\s*$", "", RegexOptions.IgnoreCase).Trim();
        return "D:" + clean.ToUpperInvariant();
    }

    private static string WithSerial(string description, string? serial) =>
        string.IsNullOrWhiteSpace(serial) ? description : $"{description} (S/N: {serial})";

    private static async Task<(ServiceOrderRemitoPreview Preview, ServiceOrder? Order, List<ServiceOrderItem> Items)> PreviewAsync(
        Guid id, FleetDbContext fleet, SalesDbContext sales, ISender sender, Guid tenantId, CancellationToken ct)
    {
        var o = await fleet.ServiceOrders.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenantId, ct);
        if (o is null) return (new ServiceOrderRemitoPreview(false, "Orden no encontrada.", null, null, [], []), null, []);
        var items = await fleet.ServiceOrderItems.Where(i => i.TenantId == tenantId && i.ServiceOrderId == id).OrderBy(i => i.Position).ToListAsync(ct);

        string? problem = o.RemitoId is not null ? $"La orden ya tiene el remito {o.RemitoNumber}."
            : o.Status is ServiceOrderStatus.Pending or ServiceOrderStatus.Cancelled ? "Solo se genera el remito de una orden programada, en curso o terminada."
            : o.CustomerId is null ? "Para generar el remito, la orden tiene que tener un cliente de la base o un pedido de venta."
            : null;

        var lines = new List<PendingOrderLine>();
        if (o.SalesOrderId is { } salesOrderId)
        {
            var order = await sender.Send(new GetOrderQuery(salesOrderId), ct);
            if (!order.IsSuccess) problem ??= "No se encontró el pedido de venta.";
            else
            {
                var delivered = (await sales.Remitos.AsNoTracking().Include(r => r.Items)
                        .Where(r => r.TenantId == new TenantId(tenantId) && r.OrderId == salesOrderId && r.Status != "Cancelled").ToListAsync(ct))
                    .SelectMany(r => r.Items)
                    .GroupBy(i => DeliveryKey(i.ProductId, i.Description))
                    .ToDictionary(g => g.Key, g => g.Sum(i => i.Quantity));
                foreach (var line in order.Value.Lines)
                {
                    var key = DeliveryKey(line.ProductId, line.Description);
                    var done = Math.Min(line.Quantity, delivered.GetValueOrDefault(key));
                    delivered[key] = delivered.GetValueOrDefault(key) - done;
                    lines.Add(new PendingOrderLine(line.Id, line.ProductId, line.Description, line.Quantity, done, line.Quantity - done));
                }
            }
        }

        var inOrder = lines.Where(l => l.ProductId is not null).Select(l => l.ProductId!.Value).ToHashSet();
        var destinations = items.Select(i => new ServiceOrderItemDestination(i.Id, i.ProductId, i.Description, i.Quantity, i.SerialNumbers,
            o.SalesOrderId is null ? "remito"
            : i.ProductId is { } p && inOrder.Contains(p) ? "remito"
            : i.ProductId is not null ? "consumption"
            : "none")).ToArray();

        return (new ServiceOrderRemitoPreview(problem is null, problem, o.SalesOrderId, o.SalesOrderNumber, lines.ToArray(), destinations), o, items);
    }

    public static void MapServiceOrderRemito(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/fleet/service-orders").WithTags("Fleet").RequireAuthorization();

        group.MapGet("/{id:guid}/remito-preview", async (Guid id, FleetDbContext fleet, SalesDbContext sales, ISender sender, ITenantContext tenant, CancellationToken ct) =>
        {
            var (preview, order, _) = await PreviewAsync(id, fleet, sales, sender, tenant.TenantId.Value, ct);
            return order is null ? Results.NotFound(new { detail = "Orden no encontrada." }) : Results.Ok(preview);
        });

        group.MapPost("/{id:guid}/remito", async (Guid id, CreateServiceOrderRemitoRequest req, HttpContext http, FleetDbContext fleet, SalesDbContext sales,
            ISender sender, ITenantContext tenant, PermissionResolver permissions, TimeProvider clock, CancellationToken ct) =>
        {
            // El remito es un documento de Ventas: además de Flota, hace falta poder cargar en Ventas.
            var perms = await permissions.ResolveAsync(http, ct);
            if (!perms.Allows("sales", PermissionLevel.Edit))
                return Results.Json(new { detail = "Para generar el remito necesitás permiso para cargar en Ventas." }, statusCode: StatusCodes.Status403Forbidden);

            var tenantId = tenant.TenantId.Value;
            var (preview, o, items) = await PreviewAsync(id, fleet, sales, sender, tenantId, ct);
            if (o is null) return Results.NotFound(new { detail = "Orden no encontrada." });
            if (!preview.Ready) return Problem(preview.Problem!);

            var code = FleetServiceOrders.Code(o.Number);
            var products = await sales.Products.AsNoTracking().Where(p => p.TenantId == new TenantId(tenantId))
                .Select(p => new { Id = p.Id.Value, p.Code }).ToDictionaryAsync(p => p.Id, p => p.Code, ct);
            string CodeOf(Guid? productId, string fallback) => productId is { } pid && products.TryGetValue(pid, out var c) ? c : fallback;

            var remitoItems = new List<RemitoItemWriteDto>();
            if (o.SalesOrderId is not null)
            {
                foreach (var line in req.Lines ?? [])
                {
                    if (line.Quantity <= 0) continue;
                    var pending = preview.OrderLines.FirstOrDefault(l => l.Id == line.OrderLineId);
                    if (pending is null) return Problem("Hay una línea que no es del pedido.");
                    if (line.Quantity > pending.Pending) return Problem($"\"{pending.Description}\": quedan {pending.Pending:0.##} por entregar.");
                    remitoItems.Add(new RemitoItemWriteDto(pending.ProductId, CodeOf(pending.ProductId, "ITEM"), pending.Description, line.Quantity, "UN"));
                }
            }
            else
            {
                var text = o.Description.Length > 200 ? o.Description[..200] + "…" : o.Description;
                remitoItems.Add(new RemitoItemWriteDto(null, "SERV", $"Servicio {code}: {text}", 1, "UN"));
            }
            foreach (var i in items.Where(i => preview.Items.Any(d => d.Id == i.Id && d.Destination == "remito")))
                remitoItems.Add(new RemitoItemWriteDto(i.ProductId, CodeOf(i.ProductId, string.IsNullOrWhiteSpace(i.Code) ? "ITEM" : i.Code),
                    WithSerial(i.Description, i.SerialNumbers), i.Quantity, i.Unit));
            if (remitoItems.Count == 0) return Problem("Elegí al menos una línea del pedido para el remito.");

            // Si un intento anterior creó el remito pero no llegó a marcar la orden, se reutiliza.
            var marker = $"[{o.Id}]";
            var existing = await sales.Remitos.AsNoTracking()
                .Where(r => r.TenantId == new TenantId(tenantId) && r.Status != "Cancelled" && r.Notes != null && r.Notes.Contains(marker))
                .Select(r => new { r.Id, r.RemitoNumber }).FirstOrDefaultAsync(ct);
            Guid remitoId;
            string remitoNumber;
            if (existing is not null)
            {
                remitoId = existing.Id;
                remitoNumber = existing.RemitoNumber;
            }
            else
            {
                var document = await fleet.Database
                    .SqlQuery<string>($@"SELECT COALESCE(document_number, '') AS ""Value"" FROM crm.customers WHERE ""Id"" = {o.CustomerId!.Value}")
                    .FirstOrDefaultAsync(ct) ?? "";
                var vehicles = o.VehicleIds.Length == 0 ? null : await fleet.Vehicles.AsNoTracking()
                    .Where(v => o.VehicleIds.Contains(v.Id)).Select(v => v.Plate != "" ? v.Plate : v.InternalCode ?? "").ToListAsync(ct);
                var deliveryDate = DateTime.SpecifyKind((o.EndUtc ?? clock.GetUtcNow().UtcDateTime).Date, DateTimeKind.Utc);
                var created = await sender.Send(new CreateRemitoCommand(
                    o.SalesOrderId, o.CustomerId.Value, o.CustomerName, document, o.Location, deliveryDate,
                    vehicles is { Count: > 0 } ? "Unidades: " + string.Join(", ", vehicles) : null, null,
                    $"Orden de servicio {code} {marker}", remitoItems), ct);
                if (!created.IsSuccess) return Problem(created.Error.Message);
                remitoId = created.Value.Id;
                remitoNumber = created.Value.RemitoNumber;
            }

            // Repuestos con producto que no van en el remito: salida por consumo, con referencia a la orden.
            var consumption = items.Where(i => i.ProductId is not null && preview.Items.Any(d => d.Id == i.Id && d.Destination == "consumption"))
                .Select(i => new ConsumeStockItem(i.ProductId!.Value, i.Quantity, i.SerialNumbers)).ToList();
            if (consumption.Count > 0)
            {
                var consumed = await sender.Send(new ConsumeStockCommand(o.Id, ReferenceType, code,
                    $"Consumo en la orden de servicio {code} ({o.CustomerName})", http.User.FindFirst("name")?.Value, consumption), ct);
                if (!consumed.IsSuccess) return Problem($"Se generó el remito {remitoNumber}, pero no se pudo descontar el consumo: {consumed.Error.Message}");
            }

            o.RemitoId = remitoId;
            o.RemitoNumber = remitoNumber;
            o.StockAppliedAtUtc = clock.GetUtcNow().UtcDateTime;
            await fleet.SaveChangesAsync(ct);
            return Results.Ok(new { remitoId, remitoNumber, consumed = consumption.Count });
        });
    }
}
