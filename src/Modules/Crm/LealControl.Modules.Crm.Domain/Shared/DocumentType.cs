namespace LealControl.Modules.Crm.Domain.Shared;

public enum DocumentType
{
    Cuit = 1,
    Dni = 2,
    Passport = 3,
    Foreign = 4,
    // Consumidor final anónimo: se informa a ARCA como "99 - Sin identificar".
    Unidentified = 5
}
