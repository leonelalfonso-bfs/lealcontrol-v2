using LealControl.Modules.Crm.Contracts.Fiscal;

namespace LealControl.Modules.Crm.IntegrationTests;

internal static class FiscalTestData
{
    // Factura A de servicios en pesos al 21%, el perfil de la primera emisión homologada.
    public static WsfeVoucherData ServiceA(
        decimal net = 0.83m, decimal vat = 0.17m, string receiver = "20123456786",
        string due = "20261012") =>
        new(1, 2, 80, receiver, 1, "20261002", "20261001", "20261002", due,
            net, 0m, 0m, vat, 0m, net + vat, [new WsfeVatLine(5, net, vat)],
            "PES", 1m, null, WsfeVoucherData.NoAssociated);
}
