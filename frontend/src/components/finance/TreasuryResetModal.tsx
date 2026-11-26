import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Modal } from "../ui/Modal";

const PHRASE = "BORRAR COMPRAS Y FINANZAS";

type Counts = {
  accounts: number; movements: number; imports: number; cheques: number; receipts: number; paymentOrders: number;
  withholdings: number; advances: number; paymentBatches: number; fundOperations: number; expenseReportsReopened: number;
};

type PurchaseCounts = { purchaseInvoices: number; purchaseOrders: number; receptions: number; requests: number; quotations: number; arcaVouchers: number; salesDrafts: number };

/**
 * Reinicio de Compras y Finanzas (solo administradores): muestra qué se borra y pide escribir la frase.
 * Primero Compras y Ventas sin CAE (revierte asientos y stock), después Tesorería.
 */
export function TreasuryResetModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [purchases, setPurchases] = useState<PurchaseCounts | null>(null);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCounts(null);
    setPurchases(null);
    setPhrase("");
    setError(null);
    Promise.all([api.getTreasuryReset(), api.getPurchasesReset()])
      .then(([treasury, purchase]) => { setCounts(treasury); setPurchases(purchase); }).catch((err) => setError(err instanceof Error ? err.message : "No se pudo calcular."));
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.resetPurchases(phrase);
      await api.resetTreasury(phrase);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el reinicio.");
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, number | undefined][] = [
    ["Facturas de compra", purchases?.purchaseInvoices],
    ["Órdenes de compra", purchases?.purchaseOrders],
    ["Recepciones (el stock baja en lo recibido)", purchases?.receptions],
    ["Solicitudes y cotizaciones de compra", (purchases?.requests ?? 0) + (purchases?.quotations ?? 0)],
    ["Comprobantes importados de ARCA (Mis Comprobantes)", purchases?.arcaVouchers],
    ["Comprobantes de venta sin CAE (el stock vuelve)", purchases?.salesDrafts],
    ["Movimientos de todas las cuentas", counts?.movements],
    ["Importaciones de extractos", counts?.imports],
    ["Cheques y echeqs (recibidos y emitidos)", counts?.cheques],
    ["Recibos de cobro", counts?.receipts],
    ["Órdenes de pago", counts?.paymentOrders],
    ["Retenciones emitidas", counts?.withholdings],
    ["Anticipos de clientes", counts?.advances],
    ["Lotes de pago", counts?.paymentBatches],
    ["Operaciones de FCI", counts?.fundOperations]
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="⚠ Reiniciar Compras y Finanzas"
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn danger" onClick={() => void confirm()} disabled={busy || !counts || !purchases || phrase.trim().toUpperCase() !== PHRASE}>
            {busy ? "Borrando…" : "Borrar todo"}
          </button>
        </>
      }
    >
      {error && <div className="alert">{error}</div>}
      {!counts || !purchases ? (
        <p className="muted">Calculando…</p>
      ) : (
        <div className="stack" style={{ gap: 10 }}>
          <p style={{ margin: 0 }}>Se borra, de toda la empresa:</p>
          <table>
            <tbody>
              {rows.map(([label, n]) => (
                <tr key={label}><td>{label}</td><td className="t-right t-strong">{n ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Los asientos de facturas de compra, recibos y órdenes de pago se revierten en Contabilidad (asiento inverso; lo no contabilizado queda omitido).</li>
            <li>No se tocan las facturas con CAE, presupuestos, pedidos, remitos, clientes, proveedores ni productos.</li>
            {counts.expenseReportsReopened > 0 && <li>{counts.expenseReportsReopened} rendiciones aprobadas vuelven a quedar abiertas para aprobarlas de nuevo.</li>}
            <li>Las facturas de venta con CAE vuelven a figurar impagas hasta que cargues los cobros.</li>
            <li>Se conservan las {counts.accounts} cuentas, conceptos, reglas, fondos y la numeración (no se repiten números ya entregados).</li>
          </ul>
          <p className="muted" style={{ margin: 0 }}>No se puede deshacer. Después corregí el saldo inicial de cada cuenta (♻ en la cuenta) e importá los extractos.</p>
          <label>
            Escribí {PHRASE} para confirmar
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={PHRASE} style={{ width: "100%" }} />
          </label>
        </div>
      )}
    </Modal>
  );
}
