using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Customers;
using LealControl.Modules.Crm.Application.Settings;

namespace LealControl.Modules.Crm.Application.Abstractions;

public interface IArcaIntegration
{
    Task<ArcaDiagnosticsDto> DiagnoseAsync(CancellationToken cancellationToken = default);

    Task<Result<ArcaCuitLookupResult>> LookupCuitAsync(
        string cuit,
        CancellationToken cancellationToken = default);

    Task<Result<ArcaSalesPointsDto>> ListSalesPointsAsync(CancellationToken cancellationToken = default);
}

public sealed record ArcaSalesPointDto(int Number, string EmissionType, bool Blocked);

public sealed record ArcaSalesPointsDto(int? Suggested, IReadOnlyList<ArcaSalesPointDto> Points);
