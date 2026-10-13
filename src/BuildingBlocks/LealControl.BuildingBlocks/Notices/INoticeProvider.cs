using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace LealControl.BuildingBlocks.Notices;

public enum NoticeSeverity { Info, Warning, Critical }

/// <summary>Dato sensible que hace falta poder ver para recibir el aviso.</summary>
public enum NoticeSensitivity { None, Amounts, Costs, Salaries }

/// <summary>Empresa y día (de Argentina) para los que se arma el aviso.</summary>
public sealed record NoticeContext(Guid TenantId, string ConnectionString, DateOnly Today);

/// <summary>Un renglón del aviso: qué pasa, detalle y adónde ir a resolverlo.</summary>
public sealed record NoticeItem(string Title, string? Detail, string? Link, NoticeSeverity Severity);

/// <summary>
/// Un tipo de aviso que publica un módulo (vencimientos de flota, facturas vencidas…). Lo recibe
/// cada usuario que lo eligió y que tiene, en ese módulo, al menos <see cref="MinimumLevel"/>
/// (1 = Ver, 2 = Cargar, 3 = Aprobar, 4 = Administrar) y el permiso sensible que pida.
/// </summary>
public interface INoticeProvider
{
    /// <summary>Clave estable ("fleet.expirations"); se guarda en las suscripciones.</summary>
    string Code { get; }
    /// <summary>Módulo de permisos ("fleet", "sales", "finance"…).</summary>
    string Module { get; }
    int MinimumLevel { get; }
    NoticeSensitivity Sensitivity { get; }
    string Label { get; }
    string Description { get; }
    /// <summary>Activado para quien todavía no eligió.</summary>
    bool DefaultOn { get; }

    Task<IReadOnlyList<NoticeItem>> GetAsync(NoticeContext context, CancellationToken cancellationToken);
}
