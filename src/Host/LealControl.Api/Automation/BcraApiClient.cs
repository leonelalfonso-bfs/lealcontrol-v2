using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace LealControl.Api.Automation;

public record BcraEntityDebtDto(
    [property: JsonPropertyName("entity")] string Entity,
    [property: JsonPropertyName("situation")] int Situation,
    [property: JsonPropertyName("amountThousands")] decimal AmountThousands,
    [property: JsonPropertyName("daysOverdue")] int DaysOverdue,
    [property: JsonPropertyName("isJudicialProcess")] bool IsJudicialProcess
);

public record BcraCreditReportDto(
    [property: JsonPropertyName("cuit")] string Cuit,
    [property: JsonPropertyName("legalName")] string LegalName,
    [property: JsonPropertyName("worstSituation")] int WorstSituation,
    [property: JsonPropertyName("situationDescription")] string SituationDescription,
    [property: JsonPropertyName("creditRating")] string CreditRating, // A, B, C, D
    [property: JsonPropertyName("commercialRecommendation")] string CommercialRecommendation,
    [property: JsonPropertyName("totalDebtThousands")] decimal TotalDebtThousands,
    [property: JsonPropertyName("totalDebtPesos")] decimal TotalDebtPesos,
    [property: JsonPropertyName("entitiesCount")] int EntitiesCount,
    [property: JsonPropertyName("rejectedChequesCount")] int RejectedChequesCount,
    [property: JsonPropertyName("rejectedChequesAmount")] decimal RejectedChequesAmount,
    [property: JsonPropertyName("hasJudicialProcess")] bool HasJudicialProcess,
    [property: JsonPropertyName("period")] string Period,
    [property: JsonPropertyName("entities")] List<BcraEntityDebtDto> Entities
);

public sealed class BcraApiClient
{
    private readonly HttpClient _httpClient;
    private readonly ILogger<BcraApiClient> _logger;

    public BcraApiClient(HttpClient httpClient, ILogger<BcraApiClient> logger)
    {
        _httpClient = httpClient;
        _logger = logger;
        _httpClient.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0 (Windows NT 10.0; Win64; x64) LealControlERP/2.0");
    }

    public async Task<BcraCreditReportDto> GetCreditReportAsync(string rawCuit, CancellationToken ct = default)
    {
        var cleanCuit = new string(rawCuit.Where(char.IsDigit).ToArray());
        if (cleanCuit.Length != 11)
        {
            throw new ArgumentException("El CUIT/CUIL debe contener 11 dígitos numéricos.");
        }

        var legalName = "";
        var worstSituation = 1;
        var totalDebtThousands = 0m;
        var entities = new List<BcraEntityDebtDto>();
        var hasJudicialProcess = false;
        var period = DateTime.UtcNow.ToString("yyyyMM");

        // 1. Consultar Deudas
        try
        {
            var deudasUrl = $"https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{cleanCuit}";
            var response = await _httpClient.GetAsync(deudasUrl, ct);

            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.TryGetProperty("results", out var results))
                {
                    if (results.TryGetProperty("denominacion", out var den))
                    {
                        legalName = den.GetString() ?? "";
                    }

                    if (results.TryGetProperty("periodos", out var periodos) && periodos.GetArrayLength() > 0)
                    {
                        var primerPeriodo = periodos[0];
                        if (primerPeriodo.TryGetProperty("periodo", out var p))
                        {
                            period = p.GetString() ?? period;
                        }

                        if (primerPeriodo.TryGetProperty("entidades", out var entidadesArray))
                        {
                            foreach (var item in entidadesArray.EnumerateArray())
                            {
                                var entidadNombre = item.TryGetProperty("entidad", out var e) ? e.GetString() ?? "Entidad Financiera" : "Entidad";
                                var sit = item.TryGetProperty("situacion", out var s) ? s.GetInt32() : 1;
                                var monto = item.TryGetProperty("monto", out var m) ? m.GetDecimal() : 0m;
                                var dias = item.TryGetProperty("diasAtrasoPago", out var d) ? d.GetInt32() : 0;
                                var procJud = item.TryGetProperty("procesoJud", out var pj) && pj.GetBoolean();

                                if (sit > worstSituation) worstSituation = sit;
                                if (procJud) hasJudicialProcess = true;
                                totalDebtThousands += monto;

                                entities.Add(new BcraEntityDebtDto(
                                    Entity: entidadNombre,
                                    Situation: sit,
                                    AmountThousands: monto,
                                    DaysOverdue: dias,
                                    IsJudicialProcess: procJud
                                ));
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error consultando deudas BCRA para CUIT {Cuit}", cleanCuit);
        }

        // 2. Consultar Cheques Rechazados
        var rejectedCount = 0;
        var rejectedAmount = 0m;

        try
        {
            var chequesUrl = $"https://api.bcra.gob.ar/centraldedeudores/v1.0/ChequesRechazados/{cleanCuit}";
            var response = await _httpClient.GetAsync(chequesUrl, ct);

            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;

                if (root.TryGetProperty("results", out var results) && results.TryGetProperty("cheques", out var chequesArray))
                {
                    rejectedCount = chequesArray.GetArrayLength();
                    foreach (var ch in chequesArray.EnumerateArray())
                    {
                        if (ch.TryGetProperty("monto", out var m))
                        {
                            rejectedAmount += m.GetDecimal();
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error consultando cheques rechazados BCRA para CUIT {Cuit}", cleanCuit);
        }

        // 3. Evaluar Calificación y Recomendación Comercial
        string rating;
        string situationDesc;
        string recommendation;

        switch (worstSituation)
        {
            case 1:
                situationDesc = "Situación 1 (Normal / Cumplimiento puntual)";
                if (rejectedCount == 0 && !hasJudicialProcess)
                {
                    rating = "A";
                    recommendation = "🟢 EXCELENTE: Apto para Crédito Comercial y Cuenta Corriente con límite estándar o ampliado.";
                }
                else
                {
                    rating = "B";
                    recommendation = "🟡 PRECAUCIÓN: Cumplimiento regular pero registra antecedentes de cheques o gestiones.";
                }
                break;

            case 2:
                situationDesc = "Situación 2 (Seguimiento especial / Atraso hasta 90 días)";
                rating = "B";
                recommendation = "🟡 RIESGO MEDIO: Se recomienda límite de crédito acotado o pago con anticipo del 50%.";
                break;

            case 3:
                situationDesc = "Situación 3 (Con problemas / Atraso hasta 180 días)";
                rating = "C";
                recommendation = "🟠 RIESGO ALTO: Se desaconseja cuenta corriente. Exigir valores a corto plazo o anticipo.";
                break;

            case 4:
                situationDesc = "Situación 4 (Alto riesgo de insolvencia / Atraso hasta 365 días)";
                rating = "D";
                recommendation = "🔴 CRÍTICO: Alto riesgo de incobrabilidad. Operar exclusivamente de contado contra entrega.";
                break;

            case 5:
                situationDesc = "Situación 5 (Irrecuperable / Incobrable +365 días)";
                rating = "D";
                recommendation = "❌ BLOQUEADO: Deudor incobrable en sistema financiero. Venta al contado estricto únicamente.";
                break;

            default:
                situationDesc = $"Situación {worstSituation} (Irrecuperable técnico / Disposición legal)";
                rating = "D";
                recommendation = "⚠️ ALERTA: Situación irregular ante el Banco Central. Verificar antecedentes.";
                break;
        }

        return new BcraCreditReportDto(
            Cuit: cleanCuit,
            LegalName: legalName,
            WorstSituation: worstSituation,
            SituationDescription: situationDesc,
            CreditRating: rating,
            CommercialRecommendation: recommendation,
            TotalDebtThousands: totalDebtThousands,
            TotalDebtPesos: totalDebtThousands * 1000m,
            EntitiesCount: entities.Count,
            RejectedChequesCount: rejectedCount,
            RejectedChequesAmount: rejectedAmount,
            HasJudicialProcess: hasJudicialProcess,
            Period: period,
            Entities: entities
        );
    }
}
