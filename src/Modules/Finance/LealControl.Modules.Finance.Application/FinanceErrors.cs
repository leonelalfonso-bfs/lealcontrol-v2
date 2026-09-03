using LealControl.BuildingBlocks.Results;

namespace LealControl.Modules.Finance.Application;

public static class FinanceErrors
{
    public static readonly Error ReceiptAmountMustBePositive = Error.Validation(
        "Finance.Receipt.AmountMustBePositive",
        "El importe total de los medios de cobro debe ser mayor a cero.");

    public static readonly Error ReceiptDescriptionRequired = Error.Validation(
        "Finance.Receipt.DescriptionRequired",
        "La descripción del recibo es obligatoria.");

    public static readonly Error ReceiptForeignInvoiceRatesRequired = Error.Validation(
        "Finance.Receipt.ForeignInvoiceRatesRequired",
        "Para imputar un comprobante en otra moneda indicá importe y cotizaciones de emisión y cobro.");

    public static readonly Error PaymentSupplierNameRequired = Error.Validation(
        "Finance.Payment.SupplierNameRequired",
        "El nombre del proveedor es obligatorio.");

    public static readonly Error PaymentAmountMustBePositive = Error.Validation(
        "Finance.Payment.AmountMustBePositive",
        "El importe total de la orden de pago debe ser mayor a cero.");

    public static readonly Error PaymentAmountMustMatchLines = Error.Validation(
        "Finance.Payment.AmountMustMatchLines",
        "El importe total debe coincidir con la suma de las líneas de pago.");

    public static Error ReceiptImputationExceedsCollection(decimal imputed, decimal collected) =>
        Error.Validation(
            "Finance.Receipt.ImputationExceedsCollection",
            $"El total imputado a facturas (${imputed:N2}) supera el total de cobro recibido (${collected:N2}). Ajuste los importes imputados.");

    public static Error PaymentImputationExceedsPaid(decimal imputed, decimal paid) =>
        Error.Validation(
            "Finance.Payment.ImputationExceedsPaid",
            $"El total imputado (${imputed:N2}) supera el total pagado (${paid:N2}).");

    public static Error Validation(string code, string message) => Error.Validation(code, message);
}
