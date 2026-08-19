using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using LealControl.Modules.Crm.Infrastructure.Persistence;
using LealControl.Modules.Sales.Domain.Quotes;
using LealControl.Modules.Sales.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace LealControl.Api.Automation;

public sealed record DiagnosticItemDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("level")] string Level, // "critical" (red), "warning" (orange), "info" (yellow), "success" (green)
    [property: JsonPropertyName("category")] string Category, // Finanzas, Ventas, Stock, Taller, Calibraciones, RRHH
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("impact")] string Impact,
    [property: JsonPropertyName("actionLabel")] string ActionLabel,
    [property: JsonPropertyName("actionUrl")] string ActionUrl
);

public sealed record LealDiagnosticReportDto(
    [property: JsonPropertyName("generatedAtUtc")] DateTime GeneratedAtUtc,
    [property: JsonPropertyName("greeting")] string Greeting,
    [property: JsonPropertyName("summary")] string Summary,
    [property: JsonPropertyName("healthScore")] string HealthScore, // "Excelente", "Saludable", "Atención Requerida", "Crítico"
    [property: JsonPropertyName("totalIssuesCount")] int TotalIssuesCount,
    [property: JsonPropertyName("items")] List<DiagnosticItemDto> Items
);

public sealed class LealDiagnosticService
{
    private readonly SalesDbContext _salesDb;
    private readonly CrmDbContext _crmDb;
    private readonly GeminiApiClient _gemini;
    private readonly ILogger<LealDiagnosticService> _logger;

    public LealDiagnosticService(
        SalesDbContext salesDb,
        CrmDbContext crmDb,
        GeminiApiClient gemini,
        ILogger<LealDiagnosticService> logger)
    {
        _salesDb = salesDb;
        _crmDb = crmDb;
        _gemini = gemini;
        _logger = logger;
    }

    public async Task<LealDiagnosticReportDto> GenerateDiagnosticAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var hour = now.AddHours(-3).Hour; // Argentine Local Time (UTC-3)
        var greetingTime = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";

        // 1. Métricas de Finanzas / Ventas (Facturas vencidas no cobradas)
        var allInvoices = await _salesDb.Invoices
            .Take(100)
            .ToListAsync(ct);

        var overdueInvoices = allInvoices
            .Where(i => i.Status == "Issued" && i.DueDate < now)
            .OrderByDescending(i => i.Total)
            .ToList();

        var totalOverdueSales = overdueInvoices.Sum(i => i.Total);
        var overdueSalesCount = overdueInvoices.Count;

        // Compras por pagar en los próximos 7 días
        var upcomingPurchases = await _salesDb.PurchaseInvoices
            .Where(p => p.Status != "Cancelled" && p.Status != "Paid" &&
                        p.DueDate >= now && p.DueDate <= now.AddDays(7))
            .ToListAsync(ct);

        var totalUpcomingPurchases = upcomingPurchases.Sum(p => p.Total);
        var upcomingPurchasesCount = upcomingPurchases.Count;

        // 2. Métricas de Stock
        var activeProducts = await _salesDb.Products
            .Where(p => p.IsActive)
            .Take(100)
            .ToListAsync(ct);

        var criticalStockList = activeProducts
            .Where(p => p.Stock <= (p.MinStock > 0 ? p.MinStock : 0))
            .ToList();

        // 3. Métricas Comerciales (Cotizaciones abiertas)
        var openQuotes = await _salesDb.Quotes
            .Include(q => q.Lines)
            .Where(q => q.Status == QuoteStatus.Draft || q.Status == QuoteStatus.Sent)
            .ToListAsync(ct);

        var totalOpenQuotesAmount = openQuotes.Sum(q => q.Total);
        var openQuotesCount = openQuotes.Count;

        // 4. Métricas de Calibraciones de Parque de Balanzas (CRM)
        var equipments = await _crmDb.CustomerEquipments
            .Where(e => e.Status == "Activo")
            .ToListAsync(ct);

        var expiredCalibrations = equipments.Where(e => e.NextCalibrationDueDate.HasValue && e.NextCalibrationDueDate.Value < now).ToList();
        var expiringSoonCalibrations = equipments.Where(e => e.NextCalibrationDueDate.HasValue &&
                                                            e.NextCalibrationDueDate.Value >= now &&
                                                            e.NextCalibrationDueDate.Value <= now.AddDays(30)).ToList();

        // 5. Armar ítems de diagnóstico
        var items = new List<DiagnosticItemDto>();

        if (overdueSalesCount > 0)
        {
            items.Add(new DiagnosticItemDto(
                Id: "overdue_sales",
                Level: totalOverdueSales > 5000000 ? "critical" : "warning",
                Category: "Finanzas & Cobranzas",
                Title: $"${totalOverdueSales:N0} vencidos para cobrar ({overdueSalesCount} facturas en mora)",
                Description: $"Se registran {overdueSalesCount} comprobantes de venta con fecha de vencimiento superada que requieren gestión de cobranza.",
                Impact: $"Recupero de liquidez por ${totalOverdueSales:N0}",
                ActionLabel: "Gestionar Cobranzas",
                ActionUrl: "/facturas"
            ));
        }

        if (criticalStockList.Count > 0)
        {
            items.Add(new DiagnosticItemDto(
                Id: "critical_stock",
                Level: "warning",
                Category: "Stock & Reposición",
                Title: $"{criticalStockList.Count} artículos en punto de reposición o sin stock",
                Description: $"Productos como {string.Join(", ", criticalStockList.Take(3).Select(p => p.Name))} están en nivel crítico o stock cero.",
                Impact: "Riesgo de quiebre de stock en ventas o taller",
                ActionLabel: "Ver Stock Crítico",
                ActionUrl: "/inventario"
            ));
        }

        if (expiredCalibrations.Count > 0 || expiringSoonCalibrations.Count > 0)
        {
            items.Add(new DiagnosticItemDto(
                Id: "equipment_calibrations",
                Level: expiredCalibrations.Count > 0 ? "warning" : "info",
                Category: "Servicios & Balanzas",
                Title: $"{expiredCalibrations.Count} equipos con calibración vencida y {expiringSoonCalibrations.Count} por vencer",
                Description: "Oportunidad de servicio técnico y calibración periódica para el parque de balanzas de clientes.",
                Impact: "Generación de nuevos servicios técnicos y fidelización",
                ActionLabel: "Ver Parque de Equipos",
                ActionUrl: "/directorio"
            ));
        }

        if (openQuotesCount > 0)
        {
            items.Add(new DiagnosticItemDto(
                Id: "hot_quotes",
                Level: "success",
                Category: "Ventas & Cotizaciones",
                Title: $"{openQuotesCount} presupuestos activos por ${totalOpenQuotesAmount:N0}",
                Description: $"Hay {openQuotesCount} cotizaciones emitidas pendientes de cierre comercial con clientes.",
                Impact: $"Cierre potencial de ventas por ${totalOpenQuotesAmount:N0}",
                ActionLabel: "Ver Presupuestos",
                ActionUrl: "/presupuestos"
            ));
        }

        if (upcomingPurchasesCount > 0)
        {
            items.Add(new DiagnosticItemDto(
                Id: "upcoming_purchases",
                Level: "info",
                Category: "Compras & Pagos",
                Title: $"${totalUpcomingPurchases:N0} a pagar en los próximos 7 días ({upcomingPurchasesCount} facturas)",
                Description: $"Vencimientos de proveedores programados para esta semana.",
                Impact: $"Compromiso de caja por ${totalUpcomingPurchases:N0}",
                ActionLabel: "Ver Cuentas por Pagar",
                ActionUrl: "/compras/facturas"
            ));
        }

        var healthScore = overdueSalesCount > 5 || totalOverdueSales > 10000000 ? "Atención Requerida" : "Saludable";
        var summary = $"Hoy encontramos {items.Count} temas prioritarios para tu gestión: foco en el cobro de ${totalOverdueSales:N0} en cobranzas y el seguimiento de {openQuotesCount} cotizaciones abiertas.";

        return new LealDiagnosticReportDto(
            GeneratedAtUtc: now,
            Greeting: $"{greetingTime}, Leonel",
            Summary: summary,
            HealthScore: healthScore,
            TotalIssuesCount: items.Count,
            Items: items
        );
    }
}
