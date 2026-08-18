using System;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Sales.Application.Inventory;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace LealControl.Modules.Sales.Infrastructure.Http;

public static class InventoryEndpoints
{
    public static IEndpointRouteBuilder MapInventoryEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/sales/inventory").WithTags("Inventory");

        // Stock Matrix in 4 Dimensions
        group.MapGet("/", async (string? search, string? status, Guid? warehouseId, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListInventoryQuery(search, status, warehouseId), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        // Stock Adjustment (Physical Count)
        group.MapPost("/adjust", async ([FromBody] AdjustStockCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        // Warehouses & Mobile Units
        group.MapGet("/warehouses", async (ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListWarehousesQuery(), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/warehouses", async ([FromBody] CreateWarehouseCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPut("/warehouses/{id:guid}", async (Guid id, [FromBody] UpdateWarehouseCommand body, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(body with { Id = id }, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        // Internal Stock Transfers
        group.MapGet("/transfers", async (string? status, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListStockTransfersQuery(status), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/transfers", async ([FromBody] CreateStockTransferCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/transfers/{id:guid}/receive", async (Guid id, [FromBody] ReceiveTransferBody? body, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ReceiveStockTransferCommand(id, body?.OperatorName), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        // Kardex & Audit Trail
        group.MapGet("/kardex", async (
            Guid? productId,
            Guid? warehouseId,
            string? movementType,
            string? search,
            int? limit,
            ISender sender,
            CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListKardexQuery(productId, warehouseId, movementType, search, limit ?? 100), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        // Automated Reorder -> Purchase Request
        group.MapPost("/reorder-to-purchase-request", async ([FromBody] ReorderBody? body, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new GeneratePurchaseRequestFromStockCommand(body?.Notes), cancellationToken);
            return res.IsSuccess ? Results.Ok(new { purchaseRequestId = res.Value }) : Results.BadRequest(res.Error);
        });

        // Product Suppliers
        group.MapGet("/products/{productId:guid}/suppliers", async (Guid productId, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(new ListProductSuppliersQuery(productId), cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        group.MapPost("/products/suppliers", async ([FromBody] LinkProductSupplierCommand cmd, ISender sender, CancellationToken cancellationToken) =>
        {
            var res = await sender.Send(cmd, cancellationToken);
            return res.IsSuccess ? Results.Ok(res.Value) : Results.BadRequest(res.Error);
        });

        return endpoints;
    }

    private sealed record ReceiveTransferBody(string? OperatorName);
    private sealed record ReorderBody(string? Notes);
}
