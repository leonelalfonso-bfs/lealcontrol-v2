namespace LealControl.BuildingBlocks.Security;

/// <summary>
/// Datos sensibles que puede ver el usuario del pedido (perfil + excepciones). Fuera de un pedido
/// (procesos en segundo plano) todo es visible.
/// </summary>
public interface ISensitiveDataAccess
{
    bool CanSeeAmounts { get; }
    bool CanSeeCosts { get; }
    bool CanSeeSalaries { get; }
}

/// <summary>Sin restricciones: procesos internos y pruebas.</summary>
public sealed class UnrestrictedSensitiveDataAccess : ISensitiveDataAccess
{
    public bool CanSeeAmounts => true;
    public bool CanSeeCosts => true;
    public bool CanSeeSalaries => true;
}
