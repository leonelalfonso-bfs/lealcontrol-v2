using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using LealControl.BuildingBlocks.Security;
using LealControl.BuildingBlocks.Tenancy;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Modules.Sales.Infrastructure.Http;

public static class GrainsEndpoints
{
    public static IEndpointRouteBuilder MapGrainsModule(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/grains").WithTags("Grains & Agriculture Brokerage").RequirePolicyOnWrites("RequireSales");

        // 1. Dashboard
        group.MapGet("/dashboard", async (ITenantContext tenantContext, SalesDbContext db, ILoggerFactory loggerFactory, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            await EnsureGrainsSeedAsync(tenantId, db, loggerFactory.CreateLogger("GrainsEndpoints"), ct);

            var contracts = await db.Database.SqlQueryRaw<GrainContractRecord>(@"
                SELECT ""Id"", ""TenantId"", ""ContractNumber"", ""ContractType"", ""GrainType"", ""Harvest"",
                       ""PricingMode"", ""PricePerTon"", ""Currency"", ""PricingReference"", ""TotalTons"",
                       ""DeliveredTons"", ""FixedTons"", ""LiquidatedTons"", ""SellerCustomerId"", ""SellerName"",
                       ""BuyerCustomerId"", ""BuyerName"", ""BrokerCommissionPercentage"", ""BrokerCommissionAmount"",
                       ""DeliveryPort"", ""DeliveryStartDate"", ""DeliveryEndDate"", ""Status"", ""Notes"",
                       ""CreatedAtUtc"", ""UpdatedAtUtc""
                FROM sales.""GrainContracts""
                WHERE ""TenantId"" = {0}
            ", tenantId).ToListAsync(ct);

            var deliveries = await db.Database.SqlQueryRaw<GrainDeliveryRecord>(@"
                SELECT ""Id"", ""TenantId"", ""ContractId"", ""DeliveryNumber"", ""CpeNumber"", ""CtgNumber"",
                       ""TruckPlate"", ""TrailerPlate"", ""DriverName"", ""GrossWeightKg"", ""TareWeightKg"",
                       ""NetWeightKg"", ""HumidityPercentage"", ""ForeignMatterPercentage"", ""DamagedPercentage"",
                       ""CommercialNetWeightTons"", ""QualityGrade"", ""DestinationSiloOrPort"", ""ReceivedAtUtc"",
                       ""Status""
                FROM sales.""GrainDeliveries""
                WHERE ""TenantId"" = {0}
                ORDER BY ""ReceivedAtUtc"" DESC
            ", tenantId).ToListAsync(ct);

            var marketPrices = await db.Database.SqlQueryRaw<GrainMarketPriceRecord>(@"
                SELECT ""Id"", ""TenantId"", ""PriceDate"", ""GrainType"", ""Market"", ""Currency"",
                       ""SettlementPrice"", ""MinPrice"", ""MaxPrice"", ""DailyVariationPercentage"", ""CreatedAtUtc""
                FROM sales.""GrainMarketPrices""
                WHERE ""TenantId"" = {0}
                ORDER BY ""PriceDate"" DESC
            ", tenantId).ToListAsync(ct);

            var totalContractedTons = contracts.Sum(c => c.TotalTons);
            var totalDeliveredTons = contracts.Sum(c => c.DeliveredTons);
            var totalFixedTons = contracts.Sum(c => c.FixedTons);
            var totalPendingTons = contracts.Sum(c => Math.Max(0, c.TotalTons - c.DeliveredTons));
            var totalBrokerageEarnedUsd = contracts.Sum(c => c.BrokerCommissionAmount);

            // Group by grain for position and volume chart
            var grains = new[] { "Soja", "Maíz", "Trigo", "Girasol", "Cebada", "Sorgo" };
            var positionSummary = grains.Select(g =>
            {
                var grainContracts = contracts.Where(c => c.GrainType.Equals(g, StringComparison.OrdinalIgnoreCase)).ToList();
                var buyTons = grainContracts.Where(c => c.ContractType == "Compra" || c.ContractType == "Canje").Sum(c => c.TotalTons);
                var sellTons = grainContracts.Where(c => c.ContractType == "Venta").Sum(c => c.TotalTons);
                var delivered = grainContracts.Sum(c => c.DeliveredTons);
                var toFix = grainContracts.Where(c => c.PricingMode == "AFijar").Sum(c => Math.Max(0, c.TotalTons - c.FixedTons));

                return new
                {
                    grainType = g,
                    totalTons = grainContracts.Sum(c => c.TotalTons),
                    buyTons,
                    sellTons,
                    deliveredTons = delivered,
                    openFixationTons = toFix,
                    netPositionTons = buyTons - sellTons
                };
            }).Where(p => p.totalTons > 0 || p.grainType == "Soja" || p.grainType == "Maíz" || p.grainType == "Trigo").ToList();

            var latestPricesByGrain = marketPrices
                .GroupBy(p => p.GrainType)
                .Select(g => g.First())
                .ToList();

            return Results.Ok(new
            {
                totalContractedTons,
                totalDeliveredTons,
                totalFixedTons,
                totalPendingTons,
                totalBrokerageEarnedUsd,
                activeContractsCount = contracts.Count(c => c.Status == "Activo"),
                positionSummary,
                recentContracts = contracts.OrderByDescending(c => c.CreatedAtUtc).Take(6).ToList(),
                recentDeliveries = deliveries.Take(6).ToList(),
                marketPrices = latestPricesByGrain
            });
        });

        // 2. List Contracts
        group.MapGet("/contracts", async (
            string? search,
            string? grainType,
            string? harvest,
            string? status,
            string? pricingMode,
            ITenantContext tenantContext,
            SalesDbContext db,
            ILoggerFactory loggerFactory,
            CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            await EnsureGrainsSeedAsync(tenantId, db, loggerFactory.CreateLogger("GrainsEndpoints"), ct);

            var contracts = await db.Database.SqlQueryRaw<GrainContractRecord>(@"
                SELECT ""Id"", ""TenantId"", ""ContractNumber"", ""ContractType"", ""GrainType"", ""Harvest"",
                       ""PricingMode"", ""PricePerTon"", ""Currency"", ""PricingReference"", ""TotalTons"",
                       ""DeliveredTons"", ""FixedTons"", ""LiquidatedTons"", ""SellerCustomerId"", ""SellerName"",
                       ""BuyerCustomerId"", ""BuyerName"", ""BrokerCommissionPercentage"", ""BrokerCommissionAmount"",
                       ""DeliveryPort"", ""DeliveryStartDate"", ""DeliveryEndDate"", ""Status"", ""Notes"",
                       ""CreatedAtUtc"", ""UpdatedAtUtc""
                FROM sales.""GrainContracts""
                WHERE ""TenantId"" = {0}
                ORDER BY ""CreatedAtUtc"" DESC
            ", tenantId).ToListAsync(ct);

            var filtered = contracts.AsEnumerable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var q = search.Trim().ToLowerInvariant();
                filtered = filtered.Where(c =>
                    c.ContractNumber.ToLower().Contains(q) ||
                    c.SellerName.ToLower().Contains(q) ||
                    c.BuyerName.ToLower().Contains(q) ||
                    c.GrainType.ToLower().Contains(q));
            }
            if (!string.IsNullOrWhiteSpace(grainType) && grainType != "all")
            {
                filtered = filtered.Where(c => c.GrainType.Equals(grainType, StringComparison.OrdinalIgnoreCase));
            }
            if (!string.IsNullOrWhiteSpace(harvest) && harvest != "all")
            {
                filtered = filtered.Where(c => c.Harvest.Equals(harvest, StringComparison.OrdinalIgnoreCase));
            }
            if (!string.IsNullOrWhiteSpace(status) && status != "all")
            {
                filtered = filtered.Where(c => c.Status.Equals(status, StringComparison.OrdinalIgnoreCase));
            }
            if (!string.IsNullOrWhiteSpace(pricingMode) && pricingMode != "all")
            {
                filtered = filtered.Where(c => c.PricingMode.Equals(pricingMode, StringComparison.OrdinalIgnoreCase));
            }

            return Results.Ok(filtered.ToList());
        });

        // 3. Get Contract Detail
        group.MapGet("/contracts/{id:guid}", async (Guid id, ITenantContext tenantContext, SalesDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            var contract = (await db.Database.SqlQueryRaw<GrainContractRecord>(@"
                SELECT ""Id"", ""TenantId"", ""ContractNumber"", ""ContractType"", ""GrainType"", ""Harvest"",
                       ""PricingMode"", ""PricePerTon"", ""Currency"", ""PricingReference"", ""TotalTons"",
                       ""DeliveredTons"", ""FixedTons"", ""LiquidatedTons"", ""SellerCustomerId"", ""SellerName"",
                       ""BuyerCustomerId"", ""BuyerName"", ""BrokerCommissionPercentage"", ""BrokerCommissionAmount"",
                       ""DeliveryPort"", ""DeliveryStartDate"", ""DeliveryEndDate"", ""Status"", ""Notes"",
                       ""CreatedAtUtc"", ""UpdatedAtUtc""
                FROM sales.""GrainContracts""
                WHERE ""TenantId"" = {0} AND ""Id"" = {1}
            ", tenantId, id).ToListAsync(ct)).FirstOrDefault();

            if (contract == null) return Results.NotFound(new { message = "Contrato no encontrado." });

            var fixations = await db.Database.SqlQueryRaw<GrainPriceFixationRecord>(@"
                SELECT ""Id"", ""TenantId"", ""ContractId"", ""FixationNumber"", ""FixationDateUtc"",
                       ""FixedTons"", ""PricePerTon"", ""Currency"", ""MarketReference"", ""BrokerageAmount"",
                       ""Notes"", ""Status"", ""CreatedAtUtc""
                FROM sales.""GrainPriceFixations""
                WHERE ""TenantId"" = {0} AND ""ContractId"" = {1}
                ORDER BY ""FixationDateUtc"" DESC
            ", tenantId, id).ToListAsync(ct);

            var deliveries = await db.Database.SqlQueryRaw<GrainDeliveryRecord>(@"
                SELECT ""Id"", ""TenantId"", ""ContractId"", ""DeliveryNumber"", ""CpeNumber"", ""CtgNumber"",
                       ""TruckPlate"", ""TrailerPlate"", ""DriverName"", ""GrossWeightKg"", ""TareWeightKg"",
                       ""NetWeightKg"", ""HumidityPercentage"", ""ForeignMatterPercentage"", ""DamagedPercentage"",
                       ""CommercialNetWeightTons"", ""QualityGrade"", ""DestinationSiloOrPort"", ""ReceivedAtUtc"",
                       ""Status""
                FROM sales.""GrainDeliveries""
                WHERE ""TenantId"" = {0} AND ""ContractId"" = {1}
                ORDER BY ""ReceivedAtUtc"" DESC
            ", tenantId, id).ToListAsync(ct);

            return Results.Ok(new
            {
                contract,
                fixations,
                deliveries
            });
        });

        // 4. Create Contract
        group.MapPost("/contracts", async ([FromBody] CreateGrainContractRequest req, ITenantContext tenantContext, SalesDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            var id = Guid.NewGuid();
            var number = string.IsNullOrWhiteSpace(req.ContractNumber) ? $"CTR-{DateTime.UtcNow:yyMM}-{new Random().Next(1000, 9999)}" : req.ContractNumber.Trim();

            var commPct = req.BrokerCommissionPercentage > 0 ? req.BrokerCommissionPercentage : 1.0m;
            var commAmount = Math.Round((req.TotalTons * req.PricePerTon * (commPct / 100m)), 2);

            object sellerId = req.SellerCustomerId.HasValue ? req.SellerCustomerId.Value : DBNull.Value;
            object buyerId = req.BuyerCustomerId.HasValue ? req.BuyerCustomerId.Value : DBNull.Value;
            object notes = req.Notes ?? (object)DBNull.Value;

            await db.Database.ExecuteSqlRawAsync(@"
                INSERT INTO sales.""GrainContracts"" (
                    ""Id"", ""TenantId"", ""ContractNumber"", ""ContractType"", ""GrainType"", ""Harvest"",
                    ""PricingMode"", ""PricePerTon"", ""Currency"", ""PricingReference"", ""TotalTons"",
                    ""DeliveredTons"", ""FixedTons"", ""LiquidatedTons"", ""SellerCustomerId"", ""SellerName"",
                    ""BuyerCustomerId"", ""BuyerName"", ""BrokerCommissionPercentage"", ""BrokerCommissionAmount"",
                    ""DeliveryPort"", ""DeliveryStartDate"", ""DeliveryEndDate"", ""Status"", ""Notes"",
                    ""CreatedAtUtc"", ""UpdatedAtUtc""
                ) VALUES (
                    {0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10},
                    0, {11}, 0, {12}, {13}, {14}, {15}, {16}, {17}, {18},
                    {19}, {20}, 'Activo', {21}, now(), now()
                )
            ",
            id, tenantId, number, req.ContractType ?? "Compra", req.GrainType ?? "Soja", req.Harvest ?? "2025/2026",
            req.PricingMode ?? "PrecioHecho", req.PricePerTon, req.Currency ?? "USD", req.PricingReference ?? "Pizarra Rosario",
            req.TotalTons, req.PricingMode == "PrecioHecho" ? req.TotalTons : 0, sellerId, req.SellerName ?? "Productor Agropecuario",
            buyerId, req.BuyerName ?? "Exportador Granario", commPct, commAmount, req.DeliveryPort ?? "Rosario Norte",
            req.DeliveryStartDate ?? DateTime.UtcNow, req.DeliveryEndDate ?? DateTime.UtcNow.AddMonths(2), notes);

            return Results.Ok(new { id, contractNumber = number });
        });

        // 5. Create Price Fixation
        group.MapPost("/fixations", async ([FromBody] CreateGrainFixationRequest req, ITenantContext tenantContext, SalesDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            var id = Guid.NewGuid();
            var number = $"FIX-{DateTime.UtcNow:yyMM}-{new Random().Next(1000, 9999)}";
            var brokerage = Math.Round((req.FixedTons * req.PricePerTon * 0.01m), 2);
            object notes = req.Notes ?? (object)DBNull.Value;

            await db.Database.ExecuteSqlRawAsync(@"
                INSERT INTO sales.""GrainPriceFixations"" (
                    ""Id"", ""TenantId"", ""ContractId"", ""FixationNumber"", ""FixationDateUtc"",
                    ""FixedTons"", ""PricePerTon"", ""Currency"", ""MarketReference"", ""BrokerageAmount"",
                    ""Notes"", ""Status"", ""CreatedAtUtc""
                ) VALUES (
                    {0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, 'Confirmada', now()
                )
            ", id, tenantId, req.ContractId, number, req.FixationDateUtc ?? DateTime.UtcNow, req.FixedTons, req.PricePerTon, req.Currency ?? "USD", req.MarketReference ?? "Pizarra Rosario", brokerage, notes);

            // Update contract fixed tons
            await db.Database.ExecuteSqlRawAsync(@"
                UPDATE sales.""GrainContracts""
                SET ""FixedTons"" = ""FixedTons"" + {0}, ""UpdatedAtUtc"" = now()
                WHERE ""TenantId"" = {1} AND ""Id"" = {2}
            ", req.FixedTons, tenantId, req.ContractId);

            return Results.Ok(new { id, fixationNumber = number });
        });

        // 6. Create Delivery / Scale Entry
        group.MapPost("/deliveries", async ([FromBody] CreateGrainDeliveryRequest req, ITenantContext tenantContext, SalesDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            var id = Guid.NewGuid();
            var number = $"REM-CPE-{DateTime.UtcNow:yyMM}-{new Random().Next(1000, 9999)}";

            var gross = req.GrossWeightKg;
            var tare = req.TareWeightKg;
            var netKg = Math.Max(0, gross - tare);
            var netTons = Math.Round(netKg / 1000.0m, 2);

            // Calculate humidity & foreign matter deductions
            var humidityDisc = req.HumidityPercentage > 14.0m ? (req.HumidityPercentage - 14.0m) * 0.015m : 0.0m;
            var foreignDisc = req.ForeignMatterPercentage > 1.0m ? (req.ForeignMatterPercentage - 1.0m) * 0.01m : 0.0m;
            var totalDiscountRatio = (decimal)(humidityDisc + foreignDisc);
            var commercialNetTons = Math.Round(netTons * (1.0m - totalDiscountRatio), 2);

            await db.Database.ExecuteSqlRawAsync(@"
                INSERT INTO sales.""GrainDeliveries"" (
                    ""Id"", ""TenantId"", ""ContractId"", ""DeliveryNumber"", ""CpeNumber"", ""CtgNumber"",
                    ""TruckPlate"", ""TrailerPlate"", ""DriverName"", ""GrossWeightKg"", ""TareWeightKg"",
                    ""NetWeightKg"", ""HumidityPercentage"", ""ForeignMatterPercentage"", ""DamagedPercentage"",
                    ""CommercialNetWeightTons"", ""QualityGrade"", ""DestinationSiloOrPort"", ""ReceivedAtUtc"",
                    ""Status""
                ) VALUES (
                    {0}, {1}, {2}, {3}, {4}, {5}, {6}, {7}, {8}, {9}, {10}, {11},
                    {12}, {13}, {14}, {15}, {16}, {17}, now(), 'Descargado'
                )
            ", id, tenantId, req.ContractId, number, req.CpeNumber ?? $"CPE-{new Random().Next(10000000, 99999999)}",
            req.CtgNumber ?? $"CTG-{new Random().Next(1000000, 9999999)}", req.TruckPlate ?? "AF123ZZ", req.TrailerPlate ?? "AE999YY",
            req.DriverName ?? "Chofer Agro", gross, tare, netKg, req.HumidityPercentage, req.ForeignMatterPercentage,
            req.DamagedPercentage, commercialNetTons, req.QualityGrade ?? "Grado 2 (Cámara)", req.DestinationSiloOrPort ?? "Planta San Lorenzo / Silo 4");

            // Update contract delivered tons
            await db.Database.ExecuteSqlRawAsync(@"
                UPDATE sales.""GrainContracts""
                SET ""DeliveredTons"" = ""DeliveredTons"" + {0}, ""UpdatedAtUtc"" = now()
                WHERE ""TenantId"" = {1} AND ""Id"" = {2}
            ", commercialNetTons, tenantId, req.ContractId);

            return Results.Ok(new { id, deliveryNumber = number, commercialNetTons });
        });

        // 7. List Deliveries
        group.MapGet("/deliveries", async (ITenantContext tenantContext, SalesDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            var list = await db.Database.SqlQueryRaw<GrainDeliveryRecord>(@"
                SELECT ""Id"", ""TenantId"", ""ContractId"", ""DeliveryNumber"", ""CpeNumber"", ""CtgNumber"",
                       ""TruckPlate"", ""TrailerPlate"", ""DriverName"", ""GrossWeightKg"", ""TareWeightKg"",
                       ""NetWeightKg"", ""HumidityPercentage"", ""ForeignMatterPercentage"", ""DamagedPercentage"",
                       ""CommercialNetWeightTons"", ""QualityGrade"", ""DestinationSiloOrPort"", ""ReceivedAtUtc"",
                       ""Status""
                FROM sales.""GrainDeliveries""
                WHERE ""TenantId"" = {0}
                ORDER BY ""ReceivedAtUtc"" DESC
            ", tenantId).ToListAsync(ct);

            return Results.Ok(list);
        });

        // 8. List Market Prices / Pizarra
        group.MapGet("/market-prices", async (ITenantContext tenantContext, SalesDbContext db, CancellationToken ct) =>
        {
            var tenantId = tenantContext.TenantId.Value;
            var list = await db.Database.SqlQueryRaw<GrainMarketPriceRecord>(@"
                SELECT ""Id"", ""TenantId"", ""PriceDate"", ""GrainType"", ""Market"", ""Currency"",
                       ""SettlementPrice"", ""MinPrice"", ""MaxPrice"", ""DailyVariationPercentage"", ""CreatedAtUtc""
                FROM sales.""GrainMarketPrices""
                WHERE ""TenantId"" = {0}
                ORDER BY ""PriceDate"" DESC
            ", tenantId).ToListAsync(ct);

            return Results.Ok(list);
        });

        return endpoints;
    }

    private static async Task EnsureGrainsSeedAsync(Guid tenantId, SalesDbContext db, ILogger logger, CancellationToken ct)
    {
        try
        {
            var count = await db.Database.SqlQueryRaw<int>(@"
                SELECT CAST(COUNT(1) AS integer) as ""Value"" FROM sales.""GrainContracts"" WHERE ""TenantId"" = {0}
            ", tenantId).FirstOrDefaultAsync(ct);

            if (count == 0)
            {
                // Seed initial contracts, market prices, and deliveries for the tenant
                var c1Id = Guid.NewGuid();
                var c2Id = Guid.NewGuid();
                var c3Id = Guid.NewGuid();
                var c4Id = Guid.NewGuid();

                await db.Database.ExecuteSqlRawAsync(@"
                    INSERT INTO sales.""GrainContracts"" (
                        ""Id"", ""TenantId"", ""ContractNumber"", ""ContractType"", ""GrainType"", ""Harvest"",
                        ""PricingMode"", ""PricePerTon"", ""Currency"", ""PricingReference"", ""TotalTons"",
                        ""DeliveredTons"", ""FixedTons"", ""LiquidatedTons"", ""SellerName"", ""BuyerName"",
                        ""BrokerCommissionPercentage"", ""BrokerCommissionAmount"", ""DeliveryPort"",
                        ""DeliveryStartDate"", ""DeliveryEndDate"", ""Status"", ""Notes"", ""CreatedAtUtc"", ""UpdatedAtUtc""
                    ) VALUES
                    ({0}, {4}, 'CTR-SOJ-2026-001', 'Compra', 'Soja', '2025/2026', 'PrecioHecho', 315.00, 'USD', 'Pizarra Rosario', 1500.00, 1120.00, 1500.00, 1000.00, 'Agropecuaria El Ombú S.A.', 'Cargill S.A.C.I.', 1.0, 4725.00, 'Puerto San Martín', now() - interval '10 days', now() + interval '20 days', 'Activo', 'Contrato disponible entrega en puerto', now() - interval '10 days', now()),
                    ({1}, {4}, 'CTR-MAI-2026-002', 'Compra', 'Maíz', '2025/2026', 'AFijar', 185.00, 'USD', 'Pizarra Rosario', 3000.00, 1850.00, 1200.00, 1200.00, 'Don Hilario Estancias', 'Bunge Argentina S.A.', 1.0, 5550.00, 'Timbúes', now() - interval '15 days', now() + interval '45 days', 'Activo', 'Maíz tardío a fijar pizarra', now() - interval '15 days', now()),
                    ({2}, {4}, 'CTR-TRI-2026-003', 'Compra', 'Trigo', '2025/2026', 'PrecioHecho', 220.00, 'USD', 'MATBA-ROFEX', 800.00, 800.00, 800.00, 800.00, 'Cabaña La Tranquera', 'Molino Cañuelas S.A.', 1.25, 2200.00, 'Rosario Norte', now() - interval '30 days', now() - interval '5 days', 'Cumplido', 'Trigo pan calidad 1', now() - interval '30 days', now()),
                    ({3}, {4}, 'CTR-GIR-2026-004', 'Compra', 'Girasol', '2025/2026', 'AFijar', 340.00, 'USD', 'Pizarra Bahía Blanca', 500.00, 210.00, 0.00, 0.00, 'Los Ceibos Agro', 'Vicentin S.A.I.C.', 1.0, 1700.00, 'San Lorenzo', now() - interval '5 days', now() + interval '30 days', 'Activo', 'Girasol alto oleico', now() - interval '5 days', now());
                ", c1Id, c2Id, c3Id, c4Id, tenantId);

                // Seed Market Prices (Pizarra Rosario)
                await db.Database.ExecuteSqlRawAsync(@"
                    INSERT INTO sales.""GrainMarketPrices"" (""Id"", ""TenantId"", ""PriceDate"", ""GrainType"", ""Market"", ""Currency"", ""SettlementPrice"", ""MinPrice"", ""MaxPrice"", ""DailyVariationPercentage"", ""CreatedAtUtc"")
                    VALUES
                    (gen_random_uuid(), {0}, now(), 'Soja', 'Pizarra Rosario', 'USD', 318.50, 316.00, 320.00, 1.45, now()),
                    (gen_random_uuid(), {0}, now(), 'Maíz', 'Pizarra Rosario', 'USD', 186.00, 184.50, 187.00, -0.50, now()),
                    (gen_random_uuid(), {0}, now(), 'Trigo', 'Pizarra Rosario', 'USD', 224.00, 222.00, 225.50, 0.80, now()),
                    (gen_random_uuid(), {0}, now(), 'Girasol', 'Pizarra Bahía Blanca', 'USD', 342.00, 340.00, 345.00, 2.10, now()),
                    (gen_random_uuid(), {0}, now(), 'Sorgo', 'Pizarra Rosario', 'USD', 165.00, 163.00, 166.00, 0.00, now());
                ", tenantId);

                // Seed Delivery Slips (Balanza & CPE)
                await db.Database.ExecuteSqlRawAsync(@"
                    INSERT INTO sales.""GrainDeliveries"" (""Id"", ""TenantId"", ""ContractId"", ""DeliveryNumber"", ""CpeNumber"", ""CtgNumber"", ""TruckPlate"", ""TrailerPlate"", ""DriverName"", ""GrossWeightKg"", ""TareWeightKg"", ""NetWeightKg"", ""HumidityPercentage"", ""ForeignMatterPercentage"", ""DamagedPercentage"", ""CommercialNetWeightTons"", ""QualityGrade"", ""DestinationSiloOrPort"", ""ReceivedAtUtc"", ""Status"")
                    VALUES
                    (gen_random_uuid(), {0}, {1}, 'REM-CPE-0001', 'CPE-89410294', 'CTG-992144', 'AF-451-BC', 'AE-112-ZZ', 'Marcelo Quiroga', 45200, 15100, 30100, 13.5, 0.8, 1.2, 30.10, 'Grado 1', 'Puerto San Martín / Muelle 2', now() - interval '2 hours', 'Descargado'),
                    (gen_random_uuid(), {0}, {1}, 'REM-CPE-0002', 'CPE-89410310', 'CTG-992158', 'AD-789-JK', 'AC-881-QQ', 'Esteban Pereyra', 44800, 14900, 29900, 14.8, 1.4, 2.0, 29.42, 'Grado 2 (Cámara)', 'Puerto San Martín / Muelle 2', now() - interval '5 hours', 'Descargado'),
                    (gen_random_uuid(), {0}, {2}, 'REM-CPE-0003', 'CPE-89410450', 'CTG-992201', 'AG-201-TY', 'AF-662-MM', 'Carlos Benítez', 46100, 15300, 30800, 14.1, 0.9, 1.0, 30.75, 'Grado 2 (Cámara)', 'Timbúes / Silo 8', now() - interval '1 day', 'Descargado');
                ", tenantId, c1Id, c2Id);
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Grains seed error");
        }
    }
}

public sealed class GrainContractRecord
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public string ContractNumber { get; set; } = string.Empty;
    public string ContractType { get; set; } = "Compra";
    public string GrainType { get; set; } = "Soja";
    public string Harvest { get; set; } = "2025/2026";
    public string PricingMode { get; set; } = "PrecioHecho";
    public decimal PricePerTon { get; set; }
    public string Currency { get; set; } = "USD";
    public string? PricingReference { get; set; }
    public decimal TotalTons { get; set; }
    public decimal DeliveredTons { get; set; }
    public decimal FixedTons { get; set; }
    public decimal LiquidatedTons { get; set; }
    public Guid? SellerCustomerId { get; set; }
    public string SellerName { get; set; } = string.Empty;
    public Guid? BuyerCustomerId { get; set; }
    public string BuyerName { get; set; } = string.Empty;
    public decimal BrokerCommissionPercentage { get; set; }
    public decimal BrokerCommissionAmount { get; set; }
    public string? DeliveryPort { get; set; }
    public DateTime? DeliveryStartDate { get; set; }
    public DateTime? DeliveryEndDate { get; set; }
    public string Status { get; set; } = "Activo";
    public string? Notes { get; set; }
    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed class GrainPriceFixationRecord
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ContractId { get; set; }
    public string FixationNumber { get; set; } = string.Empty;
    public DateTime FixationDateUtc { get; set; }
    public decimal FixedTons { get; set; }
    public decimal PricePerTon { get; set; }
    public string Currency { get; set; } = "USD";
    public string? MarketReference { get; set; }
    public decimal BrokerageAmount { get; set; }
    public string? Notes { get; set; }
    public string Status { get; set; } = "Confirmada";
    public DateTime CreatedAtUtc { get; set; }
}

public sealed class GrainDeliveryRecord
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public Guid ContractId { get; set; }
    public string DeliveryNumber { get; set; } = string.Empty;
    public string? CpeNumber { get; set; }
    public string? CtgNumber { get; set; }
    public string? TruckPlate { get; set; }
    public string? TrailerPlate { get; set; }
    public string? DriverName { get; set; }
    public decimal GrossWeightKg { get; set; }
    public decimal TareWeightKg { get; set; }
    public decimal NetWeightKg { get; set; }
    public decimal HumidityPercentage { get; set; }
    public decimal ForeignMatterPercentage { get; set; }
    public decimal DamagedPercentage { get; set; }
    public decimal CommercialNetWeightTons { get; set; }
    public string QualityGrade { get; set; } = "Grado 2 (Cámara)";
    public string? DestinationSiloOrPort { get; set; }
    public DateTime ReceivedAtUtc { get; set; }
    public string Status { get; set; } = "Descargado";
}

public sealed class GrainMarketPriceRecord
{
    public Guid Id { get; set; }
    public Guid TenantId { get; set; }
    public DateTime PriceDate { get; set; }
    public string GrainType { get; set; } = "Soja";
    public string Market { get; set; } = "Pizarra Rosario";
    public string Currency { get; set; } = "USD";
    public decimal SettlementPrice { get; set; }
    public decimal? MinPrice { get; set; }
    public decimal? MaxPrice { get; set; }
    public decimal DailyVariationPercentage { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public sealed record CreateGrainContractRequest(
    string? ContractNumber,
    string? ContractType,
    string? GrainType,
    string? Harvest,
    string? PricingMode,
    decimal PricePerTon,
    string? Currency,
    string? PricingReference,
    decimal TotalTons,
    Guid? SellerCustomerId,
    string? SellerName,
    Guid? BuyerCustomerId,
    string? BuyerName,
    decimal BrokerCommissionPercentage,
    string? DeliveryPort,
    DateTime? DeliveryStartDate,
    DateTime? DeliveryEndDate,
    string? Notes
);

public sealed record CreateGrainFixationRequest(
    Guid ContractId,
    decimal FixedTons,
    decimal PricePerTon,
    string? Currency,
    string? MarketReference,
    DateTime? FixationDateUtc,
    string? Notes
);

public sealed record CreateGrainDeliveryRequest(
    Guid ContractId,
    string? CpeNumber,
    string? CtgNumber,
    string? TruckPlate,
    string? TrailerPlate,
    string? DriverName,
    decimal GrossWeightKg,
    decimal TareWeightKg,
    decimal HumidityPercentage,
    decimal ForeignMatterPercentage,
    decimal DamagedPercentage,
    string? QualityGrade,
    string? DestinationSiloOrPort
);
