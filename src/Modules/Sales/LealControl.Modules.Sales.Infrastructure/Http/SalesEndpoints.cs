using System;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Sales.Application.Orders;
using LealControl.Modules.Sales.Application.Orders.Models;
using LealControl.Modules.Sales.Application.Products;
using LealControl.Modules.Sales.Application.Products.Models;
using LealControl.Modules.Sales.Application.Quotes;
using LealControl.Modules.Sales.Application.Inventory;
using LealControl.Modules.Sales.Domain.Orders;
using LealControl.Modules.Sales.Domain.Products;
using LealControl.Modules.Sales.Infrastructure.Services;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using LealControl.Modules.Sales.Domain.Production;
using LealControl.BuildingBlocks.Tenancy;
using Microsoft.EntityFrameworkCore;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Sales.Infrastructure.Http;

public record UpdateOrderStatusRequest(OrderStatus Status);
public sealed record ProductionBomLineRequest(Guid ComponentProductId, decimal Quantity, string Unit, decimal ScrapPercent, string? AppliesToVariant, bool IsOptional, int SortOrder, Guid? SubstituteProductId);
public sealed record ProductionBomRequest(Guid ProductId, string Version, string Name, string? Description, decimal OutputQuantity, string OutputUnit, bool IsActive, DateTime? ValidFromUtc, DateTime? ValidToUtc, IReadOnlyList<ProductionBomLineRequest> Lines);
public sealed record ProductionOrderRequest(string Number, Guid ProductId, Guid? BomId, decimal PlannedQuantity, string Unit, DateTime? PlannedStartUtc, DateTime? PlannedEndUtc, string? Notes);
public sealed record ProductionOrderStatusRequest(ProductionOrderStatus Status);
public sealed record ProductionWorkCenterRequest(string Code, string Name, string? Description, decimal CapacityHoursPerDay);
public sealed record ProductionOperationRequest(Guid WorkCenterId, int Sequence, string Code, string Name, decimal SetupMinutes, decimal RunMinutesPerUnit, bool IsQualityCheckpoint);
public sealed record ProductionRouteRequest(Guid ProductId, string Version, string Name, bool IsActive, IReadOnlyList<ProductionOperationRequest> Operations);
public sealed record ProductionExecutionRequest(Guid ProductId, decimal Quantity, string Unit, ProductionExecutionType Type, string? LotNumber, string? SerialNumbers, string? Notes);
public sealed record ProductionVariantRequest(Guid ProductId, string Code, string Name, string? AttributesJson);
public sealed record ProductionCostLine(Guid ProductId, decimal Quantity, decimal ScrapPercent, decimal UnitCost, decimal ExtendedCost);
public sealed record ProductionCostSummary(Guid ProductId, Guid BomId, string Version, decimal OutputQuantity, decimal MaterialCost, decimal CostPerOutputUnit, IReadOnlyList<ProductionCostLine> Lines);

public static class SalesEndpoints
{
    private static async Task<bool> WouldCreateBomCycle(SalesDbContext db, Guid tenantId, Guid rootProductId, IEnumerable<Guid> components, CancellationToken ct)
    {
        var visited = new HashSet<Guid> { rootProductId };
        var pending = new Stack<Guid>(components.Where(x => x != Guid.Empty));
        while (pending.Count > 0)
        {
            var productId = pending.Pop();
            if (!visited.Add(productId)) continue;
            var next = await db.ProductionBoms.AsNoTracking()
                .Where(x => x.TenantId == tenantId && x.ProductId == productId && x.IsActive)
                .SelectMany(x => x.Lines.Select(line => line.ComponentProductId))
                .ToListAsync(ct);
            foreach (var child in next)
            {
                if (child == rootProductId) return true;
                pending.Push(child);
            }
        }
        return false;
    }

    public static IEndpointRouteBuilder MapSalesModule(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapInventoryEndpoints();
        endpoints.MapRemitoEndpoints();
        endpoints.MapInvoiceEndpoints();
        endpoints.MapPurchaseEndpoints();
        var sales = endpoints.MapGroup("/api/v1/sales");

        // Quotes Endpoints
        sales.MapGet("/quotes", async (
            string? search,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListQuotesQuery(), cancellationToken);
            return result.ToHttp();
        });

        sales.MapGet("/quotes/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new GetQuoteQuery(id), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPost("/quotes", async (QuoteWriteModel body, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new CreateQuoteCommand(body), cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/sales/quotes/{result.Value.Id}")
                : result.ToHttp();
        });

        sales.MapPut("/quotes/{id:guid}", async (
            Guid id,
            QuoteWriteModel body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new UpdateQuoteCommand(id, body), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPost("/quotes/from-opportunity/{opportunityId:guid}", async (
            Guid opportunityId,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new CreateDraftFromOpportunityCommand(opportunityId), cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/sales/quotes/{result.Value.Id}")
                : result.ToHttp();
        });

        sales.MapPost("/quotes/{id:guid}/accept", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new AcceptQuoteCommand(id), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPost("/quotes/{id:guid}/send", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new SendQuoteCommand(id), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPost("/quotes/{id:guid}/reject", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new RejectQuoteCommand(id), cancellationToken);
            return result.ToHttp();
        });

        // Orders Endpoints (Pedidos de Venta)
        sales.MapGet("/orders", async (
            string? search,
            string? status,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            OrderStatus? parsedStatus = Enum.TryParse<OrderStatus>(status, true, out var s) ? s : null;
            var result = await sender.Send(new ListOrdersQuery(search, parsedStatus), cancellationToken);
            return result.ToHttp();
        });

        sales.MapGet("/orders/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new GetOrderQuery(id), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPost("/orders", async (OrderWriteModel body, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new CreateOrderCommand(body), cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/sales/orders/{result.Value.Id}")
                : result.ToHttp();
        });

        sales.MapPost("/orders/from-quote/{quoteId:guid}", async (
            Guid quoteId,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new CreateOrderFromQuoteCommand(quoteId), cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/sales/orders/{result.Value.Id}")
                : result.ToHttp();
        });

        sales.MapPut("/orders/{id:guid}", async (
            Guid id,
            OrderWriteModel body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new UpdateOrderCommand(id, body), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPut("/orders/{id:guid}/status", async (
            Guid id,
            UpdateOrderStatusRequest body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new UpdateOrderStatusCommand(id, body.Status), cancellationToken);
            return result.ToHttp();
        });

        // Exchange Rates Endpoints (DolarApi BNA Billete & BNA Mayorista Divisas)
        sales.MapGet("/exchange-rates", async (IExchangeRateService rateService, CancellationToken cancellationToken) =>
        {
            var rates = await rateService.GetLiveRatesAsync(cancellationToken);
            return Results.Ok(rates);
        });

        sales.MapGet("/quotes/exchange-rates", async (IExchangeRateService rateService, CancellationToken cancellationToken) =>
        {
            var rates = await rateService.GetLiveRatesAsync(cancellationToken);
            return Results.Ok(rates);
        });

        // Product Catalog Endpoints
        sales.MapGet("/categories", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new ListCategoriesQuery(), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPost("/categories", async (CreateCategoryCommand command, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(command, cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/sales/categories/{result.Value.Id}")
                : result.ToHttp();
        });

        sales.MapGet("/products", async (
            string? search,
            string? type,
            string? categoryId,
            bool? onlyActive,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            ProductType? parsedType = Enum.TryParse<ProductType>(type, true, out var t) ? t : null;
            Guid? parsedCatId = Guid.TryParse(categoryId, out var catId) ? catId : null;

            var query = new ListProductsQuery(search, parsedType, parsedCatId);
            var result = await sender.Send(query, cancellationToken);
            return result.ToHttp();
        });

        sales.MapGet("/products/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new GetProductQuery(id), cancellationToken);
            return result.ToHttp();
        });

        sales.MapPost("/products", async (ProductWriteModel body, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new CreateProductCommand(body), cancellationToken);
            return result.IsSuccess
                ? result.ToCreated($"/api/v1/sales/products/{result.Value.Id}")
                : result.ToHttp();
        });

        sales.MapPut("/products/{id:guid}", async (
            Guid id,
            ProductWriteModel body,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new UpdateProductCommand(id, body), cancellationToken);
            return result.ToHttp();
        });

        sales.MapDelete("/products/{id:guid}", async (Guid id, ISender sender, CancellationToken cancellationToken) =>
        {
            var result = await sender.Send(new DeleteProductCommand(id), cancellationToken);
            return result.ToHttp();
        });

        sales.MapGet("/production/boms", async (Guid? productId, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
            Results.Ok(await db.ProductionBoms.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value && (!productId.HasValue || x.ProductId == productId)).Include(x => x.Lines).OrderBy(x => x.ProductId).ThenByDescending(x => x.Version).ToListAsync(ct)));
        sales.MapPost("/production/boms", async (ProductionBomRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            if (body.OutputQuantity <= 0 || string.IsNullOrWhiteSpace(body.Version) || string.IsNullOrWhiteSpace(body.Name)) return Results.BadRequest(new { detail = "Completá versión, nombre y cantidad de salida." });
            if (!await db.Products.AnyAsync(x => x.TenantId.Value == tenant.TenantId.Value && x.Id.Value == body.ProductId, ct)) return Results.BadRequest(new { detail = "El producto terminado no existe." });
            if (body.Lines.Any(x => x.ComponentProductId == body.ProductId)) return Results.BadRequest(new { detail = "El producto terminado no puede ser componente de sí mismo." });
            if (body.Lines.GroupBy(x => new { x.ComponentProductId, Variant = (x.AppliesToVariant ?? "").Trim().ToLowerInvariant() }).Any(g => g.Count() > 1)) return Results.BadRequest(new { detail = "No repitas el mismo componente y variante dentro de la BOM." });
            if (await WouldCreateBomCycle(db, tenant.TenantId.Value, body.ProductId, body.Lines.Select(x => x.ComponentProductId), ct)) return Results.BadRequest(new { detail = "La estructura genera un ciclo entre productos." });
            var now = DateTime.UtcNow; var bom = ProductionBom.Create(tenant.TenantId.Value, body.ProductId, body.Version, body.Name, body.Description, body.OutputQuantity, body.OutputUnit, now); bom.Update(body.Version, body.Name, body.Description, body.OutputQuantity, body.OutputUnit, body.IsActive, body.ValidFromUtc, body.ValidToUtc, now);
            foreach (var line in body.Lines) bom.Lines.Add(ProductionBomLine.Create(bom.Id, line.ComponentProductId, line.Quantity, line.Unit, line.ScrapPercent, line.AppliesToVariant, line.IsOptional, line.SortOrder, line.SubstituteProductId));
            db.Add(bom); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/sales/production/boms/{bom.Id}", bom);
        });
        sales.MapPut("/production/boms/{id:guid}", async (Guid id, ProductionBomRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var bom = await db.ProductionBoms.Include(x => x.Lines).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (bom is null) return Results.NotFound();
            if (body.Lines.Any(x => x.ComponentProductId == body.ProductId)) return Results.BadRequest(new { detail = "El producto terminado no puede ser componente de sí mismo." });
            if (body.Lines.GroupBy(x => new { x.ComponentProductId, Variant = (x.AppliesToVariant ?? "").Trim().ToLowerInvariant() }).Any(g => g.Count() > 1)) return Results.BadRequest(new { detail = "No repitas el mismo componente y variante dentro de la BOM." });
            if (await WouldCreateBomCycle(db, tenant.TenantId.Value, body.ProductId, body.Lines.Select(x => x.ComponentProductId), ct)) return Results.BadRequest(new { detail = "La estructura genera un ciclo entre productos." });
            bom.Update(body.Version, body.Name, body.Description, body.OutputQuantity, body.OutputUnit, body.IsActive, body.ValidFromUtc, body.ValidToUtc, DateTime.UtcNow);
            db.ProductionBomLines.RemoveRange(bom.Lines);
            bom.Lines.Clear();
            foreach (var line in body.Lines) bom.Lines.Add(ProductionBomLine.Create(bom.Id, line.ComponentProductId, line.Quantity, line.Unit, line.ScrapPercent, line.AppliesToVariant, line.IsOptional, line.SortOrder, line.SubstituteProductId));
            await db.SaveChangesAsync(ct); return Results.Ok(bom);
        });

        sales.MapGet("/production/orders", async (ProductionOrderStatus? status, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var query = db.ProductionOrders.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value);
            if (status.HasValue) query = query.Where(x => x.Status == status.Value);
            return Results.Ok(await query.OrderByDescending(x => x.CreatedAtUtc).ToListAsync(ct));
        });
        sales.MapPost("/production/orders", async (ProductionOrderRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.Number) || body.PlannedQuantity <= 0 || string.IsNullOrWhiteSpace(body.Unit)) return Results.BadRequest(new { detail = "Completá número, unidad y cantidad planificada." });
            if (!await db.Products.AnyAsync(x => x.TenantId.Value == tenant.TenantId.Value && x.Id.Value == body.ProductId, ct)) return Results.BadRequest(new { detail = "El producto terminado no existe." });
            if (body.BomId.HasValue && !await db.ProductionBoms.AnyAsync(x => x.Id == body.BomId && x.TenantId == tenant.TenantId.Value && x.ProductId == body.ProductId, ct)) return Results.BadRequest(new { detail = "La BOM seleccionada no corresponde al producto." });
            var now = DateTime.UtcNow;
            var order = ProductionOrder.Create(tenant.TenantId.Value, body.Number, body.ProductId, body.BomId, body.PlannedQuantity, body.Unit, now);
            db.Add(order); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/sales/production/orders/{order.Id}", order);
        });
        sales.MapPatch("/production/orders/{id:guid}/status", async (Guid id, ProductionOrderStatusRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var order = await db.ProductionOrders.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct);
            if (order is null) return Results.NotFound();
            try { order.ChangeStatus(body.Status, DateTime.UtcNow); await db.SaveChangesAsync(ct); return Results.Ok(order); }
            catch (InvalidOperationException ex) { return Results.BadRequest(new { detail = ex.Message }); }
        });
        sales.MapGet("/production/work-centers", async (SalesDbContext db, ITenantContext tenant, CancellationToken ct) => Results.Ok(await db.ProductionWorkCenters.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value).OrderBy(x => x.Code).ToListAsync(ct)));
        sales.MapPost("/production/work-centers", async (ProductionWorkCenterRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.Code) || string.IsNullOrWhiteSpace(body.Name) || body.CapacityHoursPerDay <= 0) return Results.BadRequest(new { detail = "Completá código, nombre y capacidad del centro." });
            var now = DateTime.UtcNow; var center = ProductionWorkCenter.Create(tenant.TenantId.Value, body.Code, body.Name, body.CapacityHoursPerDay, now); db.Add(center); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/sales/production/work-centers/{center.Id}", center);
        });
        sales.MapGet("/production/routes", async (Guid? productId, SalesDbContext db, ITenantContext tenant, CancellationToken ct) => Results.Ok(await db.ProductionRoutes.AsNoTracking().Include(x => x.Operations).Where(x => x.TenantId == tenant.TenantId.Value && (!productId.HasValue || x.ProductId == productId)).OrderBy(x => x.ProductId).ThenByDescending(x => x.Version).ToListAsync(ct)));
        sales.MapPost("/production/routes", async (ProductionRouteRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            if (string.IsNullOrWhiteSpace(body.Version) || string.IsNullOrWhiteSpace(body.Name) || !body.Operations.Any()) return Results.BadRequest(new { detail = "Completá versión, nombre y al menos una operación." });
            if (!await db.Products.AnyAsync(x => x.TenantId.Value == tenant.TenantId.Value && x.Id.Value == body.ProductId, ct)) return Results.BadRequest(new { detail = "El producto no existe." });
            if (body.Operations.GroupBy(x => x.Sequence).Any(x => x.Count() > 1)) return Results.BadRequest(new { detail = "No repitas la secuencia de una operación." });
            var centerIds = body.Operations.Select(x => x.WorkCenterId).Distinct().ToList(); if (await db.ProductionWorkCenters.CountAsync(x => x.TenantId == tenant.TenantId.Value && centerIds.Contains(x.Id) && x.IsActive, ct) != centerIds.Count) return Results.BadRequest(new { detail = "Hay centros de trabajo inválidos o inactivos." });
            var now = DateTime.UtcNow; var route = ProductionRoute.Create(tenant.TenantId.Value, body.ProductId, body.Version, body.Name, now); route.Operations.AddRange(body.Operations.OrderBy(x => x.Sequence).Select(x => ProductionOperation.Create(route.Id, x.WorkCenterId, x.Sequence, x.Code, x.Name, x.SetupMinutes, x.RunMinutesPerUnit, x.IsQualityCheckpoint))); db.Add(route); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/sales/production/routes/{route.Id}", route);
        });
        sales.MapPut("/production/routes/{id:guid}", async (Guid id, ProductionRouteRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var route = await db.ProductionRoutes.Include(x => x.Operations).FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct); if (route is null) return Results.NotFound();
            if (string.IsNullOrWhiteSpace(body.Version) || string.IsNullOrWhiteSpace(body.Name) || !body.Operations.Any()) return Results.BadRequest(new { detail = "Completá versión, nombre y al menos una operación." });
            if (body.Operations.GroupBy(x => x.Sequence).Any(x => x.Count() > 1)) return Results.BadRequest(new { detail = "No repitas la secuencia de una operación." });
            var centerIds = body.Operations.Select(x => x.WorkCenterId).Distinct().ToList(); if (await db.ProductionWorkCenters.CountAsync(x => x.TenantId == tenant.TenantId.Value && centerIds.Contains(x.Id) && x.IsActive, ct) != centerIds.Count) return Results.BadRequest(new { detail = "Hay centros de trabajo inválidos o inactivos." });
            route.Update(body.Version, body.Name, body.IsActive, DateTime.UtcNow); db.ProductionOperations.RemoveRange(route.Operations); route.Operations.Clear(); route.Operations.AddRange(body.Operations.OrderBy(x => x.Sequence).Select(x => ProductionOperation.Create(route.Id, x.WorkCenterId, x.Sequence, x.Code, x.Name, x.SetupMinutes, x.RunMinutesPerUnit, x.IsQualityCheckpoint))); await db.SaveChangesAsync(ct); return Results.Ok(route);
        });
        sales.MapGet("/production/orders/{id:guid}/executions", async (Guid id, SalesDbContext db, ITenantContext tenant, CancellationToken ct) => Results.Ok(await db.ProductionExecutionEntries.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value && x.ProductionOrderId == id).OrderByDescending(x => x.CreatedAtUtc).ToListAsync(ct)));
        sales.MapGet("/production/variants", async (Guid? productId, SalesDbContext db, ITenantContext tenant, CancellationToken ct) => Results.Ok(await db.ProductionVariants.AsNoTracking().Where(x => x.TenantId == tenant.TenantId.Value && (!productId.HasValue || x.ProductId == productId)).OrderBy(x => x.Code).ToListAsync(ct)));
        sales.MapPost("/production/variants", async (ProductionVariantRequest body, SalesDbContext db, ITenantContext tenant, CancellationToken ct) => { if (string.IsNullOrWhiteSpace(body.Code) || string.IsNullOrWhiteSpace(body.Name)) return Results.BadRequest(new { detail = "Completá código y nombre de variante." }); if (!await db.Products.AnyAsync(x => x.TenantId.Value == tenant.TenantId.Value && x.Id.Value == body.ProductId, ct)) return Results.BadRequest(new { detail = "El producto base no existe." }); var variant = ProductionVariant.Create(tenant.TenantId.Value, body.ProductId, body.Code, body.Name, body.AttributesJson, DateTime.UtcNow); db.Add(variant); await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/sales/production/variants/{variant.Id}", variant); });
        sales.MapGet("/production/costs/{productId:guid}", async (Guid productId, Guid? bomId, SalesDbContext db, ITenantContext tenant, CancellationToken ct) =>
        {
            var bomQuery = db.ProductionBoms.AsNoTracking().Include(x => x.Lines).Where(x => x.TenantId == tenant.TenantId.Value && x.ProductId == productId);
            var bom = await (bomId.HasValue ? bomQuery.FirstOrDefaultAsync(x => x.Id == bomId.Value, ct) : bomQuery.OrderByDescending(x => x.Version).FirstOrDefaultAsync(ct));
            if (bom is null) return Results.NotFound(new { detail = "No hay una BOM para este producto." });
            var ids = bom.Lines.Select(x => x.ComponentProductId).Distinct().ToList(); var products = await db.Products.AsNoTracking().Where(x => x.TenantId.Value == tenant.TenantId.Value && ids.Contains(x.Id.Value)).ToDictionaryAsync(x => x.Id.Value, ct);
            var lines = bom.Lines.Select(x => { var unit = products.TryGetValue(x.ComponentProductId, out var p) ? p.CostPrice : 0m; var extended = x.Quantity * (1 + x.ScrapPercent / 100m) * unit; return new ProductionCostLine(x.ComponentProductId, x.Quantity, x.ScrapPercent, unit, extended); }).ToList(); var total = lines.Sum(x => x.ExtendedCost); return Results.Ok(new ProductionCostSummary(productId, bom.Id, bom.Version, bom.OutputQuantity, total, total / bom.OutputQuantity, lines));
        });
        sales.MapPost("/production/orders/{id:guid}/executions", async (Guid id, ProductionExecutionRequest body, SalesDbContext db, ITenantContext tenant, ISender sender, CancellationToken ct) =>
        {
            if (body.Quantity <= 0 || string.IsNullOrWhiteSpace(body.Unit)) return Results.BadRequest(new { detail = "Completá cantidad y unidad." });
            var order = await db.ProductionOrders.FirstOrDefaultAsync(x => x.Id == id && x.TenantId == tenant.TenantId.Value, ct); if (order is null) return Results.NotFound();
            if (order.Status is ProductionOrderStatus.Draft or ProductionOrderStatus.Cancelled) return Results.BadRequest(new { detail = "La orden debe estar planificada o liberada para registrar movimientos." });
            var stock = await db.StockItems.AsNoTracking().FirstOrDefaultAsync(x => x.TenantId.Value == tenant.TenantId.Value && x.ProductId == body.ProductId, ct);
            var sign = body.Type is ProductionExecutionType.Consumption or ProductionExecutionType.Scrap ? -1 : 1;
            var currentStock = stock?.PhysicalStock ?? 0m; var newStock = currentStock + sign * body.Quantity;
            if (newStock < 0) return Results.BadRequest(new { detail = "Stock insuficiente para registrar el consumo o la merma." });
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            var stockResult = await sender.Send(new AdjustStockCommand(body.ProductId, newStock, stock?.MinimumStock ?? 0, stock?.WarehouseId, stock?.WarehouseName, stock?.WarehouseLocation, $"Producción {body.Type} · Orden {order.Number}", "Producción", body.SerialNumbers, body.LotNumber), ct);
            if (!stockResult.IsSuccess) return Results.BadRequest(stockResult.Error);
            var entry = ProductionExecutionEntry.Create(tenant.TenantId.Value, id, body.ProductId, body.Quantity, body.Unit, body.Type, body.LotNumber, body.SerialNumbers, body.Notes, DateTime.UtcNow); db.Add(entry); await db.SaveChangesAsync(ct); await transaction.CommitAsync(ct); return Results.Created($"/api/v1/sales/production/orders/{id}/executions/{entry.Id}", entry);
        });

        return endpoints;
    }
}
