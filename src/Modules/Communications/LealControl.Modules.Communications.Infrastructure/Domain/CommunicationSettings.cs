using System;

namespace LealControl.Modules.Communications.Infrastructure.Domain;

/// <summary>Configuración de Comunicaciones de la empresa.</summary>
public sealed class CommunicationSettings
{
    public const int DefaultUnattendedAfterHours = 24;

    private CommunicationSettings() { }

    public Guid TenantId { get; private set; }

    /// <summary>
    /// Horas hábiles (lunes a viernes, hora argentina) sin respuesta a partir de las cuales un mail recibido
    /// queda "sin atender": va a la carpeta SLA y a los avisos.
    /// </summary>
    public int UnattendedAfterHours { get; private set; } = DefaultUnattendedAfterHours;

    public DateTime UpdatedAtUtc { get; private set; }

    public static CommunicationSettings For(Guid tenantId) => new() { TenantId = tenantId, UpdatedAtUtc = DateTime.UtcNow };

    public void SetUnattendedAfterHours(int hours)
    {
        UnattendedAfterHours = Math.Clamp(hours, 1, 240);
        UpdatedAtUtc = DateTime.UtcNow;
    }
}
