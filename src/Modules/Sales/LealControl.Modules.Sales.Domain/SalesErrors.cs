using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Sales.Domain;

public static class SalesErrors
{
    public static readonly Error QuoteCustomerRequired = Error.Validation(
        "Sales.Quote.CustomerRequired",
        "El presupuesto necesita un cliente.");

    public static readonly Error QuoteNotFound = Error.NotFound(
        "Sales.Quote.NotFound",
        "El presupuesto no existe.");

    public static readonly Error QuoteNotEditable = Error.Conflict(
        "Sales.Quote.NotEditable",
        "El presupuesto no se puede editar en este estado.");

    public static readonly Error QuoteAlreadyCancelled = Error.Conflict(
        "Sales.Quote.AlreadyCancelled",
        "El presupuesto ya está anulado.");

    public static readonly Error QuoteHasSalesOrder = Error.Conflict(
        "Sales.Quote.ConflictHasOrder",
        "Este presupuesto ya generó un pedido de venta. No se puede anular ni eliminar mientras ese pedido exista.");

    public static readonly Error OpportunityNotFound = Error.NotFound(
        "Sales.Quote.OpportunityNotFound",
        "La oportunidad no existe.");

    public static readonly Error OpportunityNotWon = Error.Validation(
        "Sales.Quote.OpportunityNotWon",
        "No se puede crear un presupuesto desde una oportunidad cerrada.");

    public static readonly Error OpportunityCustomerRequired = Error.Validation(
        "Sales.Quote.OpportunityCustomerRequired",
        "La oportunidad debe tener cliente para generar el presupuesto.");

    public static readonly Error QuoteAlreadyFromOpportunity = Error.Conflict(
        "Sales.Quote.AlreadyFromOpportunity",
        "Ya existe un presupuesto para esta oportunidad.");

    public static readonly Error LineDescriptionRequired = Error.Validation(
        "Sales.Quote.LineDescriptionRequired",
        "La línea necesita descripción.");

    public static readonly Error InvalidQuantity = Error.Validation(
        "Sales.Quote.InvalidQuantity",
        "La cantidad debe ser mayor a cero.");

    public static readonly Error CategoryNameRequired = Error.Validation(
        "Sales.Category.NameRequired",
        "El nombre de la categoría es obligatorio.");

    public static readonly Error ProductNameRequired = Error.Validation(
        "Sales.Product.NameRequired",
        "El nombre del producto o servicio es obligatorio.");

    public static readonly Error ProductCodeRequired = Error.Validation(
        "Sales.Product.CodeRequired",
        "El código o SKU es obligatorio.");

    public static readonly Error ProductNotFound = Error.NotFound(
        "Sales.Product.NotFound",
        "El producto o servicio no existe.");

    public static readonly Error InvalidProductPrice = Error.Validation(
        "Sales.Product.InvalidPrice",
        "El precio debe ser mayor o igual a cero.");
}
