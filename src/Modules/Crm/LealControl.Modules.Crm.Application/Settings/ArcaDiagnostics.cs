using LealControl.BuildingBlocks.Results;
using MediatR;

namespace LealControl.Modules.Crm.Application.Settings;

public sealed record ArcaCheckDto(
    string Code,
    string Label,
    bool Ok,
    string Detail);

public sealed record ArcaDiagnosticsDto(
    bool ReadyForInvoicing,
    bool ReadyForCuitLookup,
    string Environment,
    string? SignerCuit,
    string? CertificateSubject,
    string? CertificateThumbprint,
    DateTime? CertificateNotBeforeUtc,
    DateTime? CertificateNotAfterUtc,
    IReadOnlyList<ArcaCheckDto> Checks,
    string Summary);

public sealed record DiagnoseArcaQuery : IRequest<Result<ArcaDiagnosticsDto>>;
