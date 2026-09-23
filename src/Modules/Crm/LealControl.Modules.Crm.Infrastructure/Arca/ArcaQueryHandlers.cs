using LealControl.BuildingBlocks.Results;
using LealControl.Modules.Crm.Application.Abstractions;
using LealControl.Modules.Crm.Application.Customers;
using LealControl.Modules.Crm.Application.Settings;
using MediatR;

namespace LealControl.Modules.Crm.Infrastructure.Arca;

internal sealed class DiagnoseArcaQueryHandler
    : IRequestHandler<DiagnoseArcaQuery, Result<ArcaDiagnosticsDto>>
{
    private readonly IArcaIntegration _arca;

    public DiagnoseArcaQueryHandler(IArcaIntegration arca) => _arca = arca;

    public async Task<Result<ArcaDiagnosticsDto>> Handle(
        DiagnoseArcaQuery request,
        CancellationToken cancellationToken)
    {
        var dto = await _arca.DiagnoseAsync(cancellationToken);
        return Result<ArcaDiagnosticsDto>.Success(dto);
    }
}

internal sealed class ConsultArcaCuitInfrastructureHandler
    : IRequestHandler<ConsultArcaCuitQuery, Result<ArcaCuitLookupResult>>
{
    private readonly IArcaIntegration _arca;

    public ConsultArcaCuitInfrastructureHandler(IArcaIntegration arca) => _arca = arca;

    public Task<Result<ArcaCuitLookupResult>> Handle(
        ConsultArcaCuitQuery request,
        CancellationToken cancellationToken) =>
        _arca.LookupCuitAsync(request.Cuit, cancellationToken);
}
