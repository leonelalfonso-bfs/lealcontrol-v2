using System;

namespace LealControl.BuildingBlocks.Security;

/// <summary>
/// Avisa que cambiaron perfiles o usuarios de una empresa, para que los permisos en caché se
/// vuelvan a leer en el próximo pedido (sin esperar a que el usuario vuelva a iniciar sesión).
/// </summary>
public interface IPermissionChangeNotifier
{
    void PermissionsChanged(Guid tenantId);
}
