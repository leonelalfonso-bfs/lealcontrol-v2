using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Crm.Domain;

public static class CrmErrors
{
    public static readonly Error LegalNameRequired = Error.Validation(
        "Crm.Customer.LegalNameRequired",
        "La razón social es obligatoria.");

    public static readonly Error InvalidCuit = Error.Validation(
        "Crm.Document.InvalidCuit",
        "El CUIT debe tener 11 dígitos.");

    public static readonly Error InvalidCuitChecksum = Error.Validation(
        "Crm.Document.InvalidCuitChecksum",
        "El CUIT no es válido (dígito verificador incorrecto).");

    public static readonly Error InvalidDni = Error.Validation(
        "Crm.Document.InvalidDni",
        "El DNI debe tener entre 7 y 8 dígitos.");

    public static readonly Error DocumentRequired = Error.Validation(
        "Crm.Document.Required",
        "El documento es obligatorio.");

    public static readonly Error CuitRequiredForTaxCondition = Error.Validation(
        "Crm.Customer.CuitRequired",
        "Esta condición de IVA requiere un CUIT válido.");

    public static readonly Error InvalidEmail = Error.Validation(
        "Crm.Email.Invalid",
        "El email no tiene un formato válido.");

    public static readonly Error InvalidPhone = Error.Validation(
        "Crm.Phone.Invalid",
        "El teléfono no tiene un formato válido.");

    public static readonly Error InvalidAddress = Error.Validation(
        "Crm.Address.Invalid",
        "La dirección está incompleta.");

    public static readonly Error InvalidCreditLimit = Error.Validation(
        "Crm.Customer.InvalidCreditLimit",
        "El límite de crédito no puede ser negativo.");

    public static readonly Error CustomerNotFound = Error.NotFound(
        "Crm.Customer.NotFound",
        "El cliente no existe.");

    public static readonly Error CustomerInactive = Error.Conflict(
        "Crm.Customer.Inactive",
        "El cliente está inactivo.");

    public static readonly Error DuplicateDocument = Error.Conflict(
        "Crm.Customer.DuplicateDocument",
        "Ya existe un cliente con ese documento en este tenant.");

    public static readonly Error LocationNameRequired = Error.Validation(
        "Crm.Location.NameRequired",
        "El nombre de la planta/sucursal es obligatorio.");

    public static readonly Error LocationNotFound = Error.NotFound(
        "Crm.Location.NotFound",
        "La planta no existe en este cliente.");

    public static readonly Error ContactNameRequired = Error.Validation(
        "Crm.Contact.NameRequired",
        "El nombre del contacto es obligatorio.");

    public static readonly Error ContactChannelRequired = Error.Validation(
        "Crm.Contact.ChannelRequired",
        "El contacto necesita al menos un teléfono, WhatsApp o email.");

    public static readonly Error ContactNotFound = Error.NotFound(
        "Crm.Contact.NotFound",
        "El contacto no existe en este cliente.");

    public static readonly Error InvalidTaxRate = Error.Validation(
        "Crm.FiscalRate.InvalidRate",
        "La alícuota debe estar entre 0 y 100.");

    public static readonly Error LeadNameRequired = Error.Validation(
        "Crm.Lead.NameRequired",
        "El nombre del prospecto es obligatorio.");

    public static readonly Error LeadNotFound = Error.NotFound(
        "Crm.Lead.NotFound",
        "El prospecto no existe.");

    public static readonly Error LeadAlreadyConverted = Error.Conflict(
        "Crm.Lead.AlreadyConverted",
        "El prospecto ya fue convertido en cliente.");

    public static readonly Error LeadArchived = Error.Conflict(
        "Crm.Lead.Archived",
        "El prospecto está archivado.");

    public static readonly Error OpportunityTitleRequired = Error.Validation(
        "Crm.Opportunity.TitleRequired",
        "El título de la oportunidad es obligatorio.");

    public static readonly Error OpportunityNotFound = Error.NotFound(
        "Crm.Opportunity.NotFound",
        "La oportunidad no existe.");

    public static readonly Error OpportunityClosed = Error.Conflict(
        "Crm.Opportunity.Closed",
        "La oportunidad ya está cerrada.");

    public static readonly Error OpportunityLostReasonRequired = Error.Validation(
        "Crm.Opportunity.LostReasonRequired",
        "Indicá el motivo de pérdida.");

    public static readonly Error OpportunityInvalidTransition = Error.Validation(
        "Crm.Opportunity.InvalidTransition",
        "La oportunidad debe avanzar respetando el flujo comercial y la evidencia de cada etapa.");

    public static readonly Error OpportunityCustomerRequired = Error.Validation(
        "Crm.Opportunity.CustomerRequired",
        "Vinculá una empresa antes de preparar la propuesta.");

    public static readonly Error ActivityDescriptionRequired = Error.Validation(
        "Crm.Activity.DescriptionRequired",
        "La actividad necesita una descripción o un tipo de canal.");

    public static readonly Error EquipmentCodeRequired = Error.Validation(
        "Crm.Equipment.CodeRequired",
        "El código interno del equipo es obligatorio.");

    public static readonly Error EquipmentTypeRequired = Error.Validation(
        "Crm.Equipment.TypeRequired",
        "El tipo de equipo es obligatorio.");

    public static readonly Error EquipmentNotFound = Error.NotFound(
        "Crm.Equipment.NotFound",
        "El equipo no existe en este cliente.");
}
