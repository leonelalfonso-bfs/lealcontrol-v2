import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Modal } from "../ui/Modal";

const PHRASE = "BORRAR TESORERIA";

type Counts = {
  accounts: number; movements: number; imports: number; cheques: number; receipts: number; paymentOrders: number;
  withholdings: number; advances: number; paymentBatches: number; fundOperations: number; expenseReportsReopened: number;
};

/** Reinicio total de Tesorería (solo administradores): muestra qué se borra y pide escribir la frase. */
export function TreasuryResetModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCounts(null);
    setPhrase("");
    setError(null);
    api.getTreasuryReset().then(setCounts).catch((err) => setError(err instanceof Error ? err.message : "No se pudo calcular."));
  }, [open]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.resetTreasury(phrase);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reiniciar Tesorería.");
    } finally {
      setBusy(false);
    }
  };

  const rows: [string, number | undefined][] = [
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
      title="⚠ Reiniciar Tesorería completa"
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn danger" onClick={() => void confirm()} disabled={busy || !counts || phrase.trim().toUpperCase() !== PHRASE}>
            {busy ? "Borrando…" : "Borrar todo"}
          </button>
        </>
      }
    >
      {error && <div className="alert">{error}</div>}
      {!counts ? (
        <p className="muted">Calculando…</p>
      ) : (
        <div className="stack" style={{ gap: 10, fontSize: "0.9rem" }}>
          <p style={{ margin: 0 }}>Se borra, de toda la empresa:</p>
          <table style={{ width: "100%" }}>
            <tbody>
              {rows.map(([label, n]) => (
                <tr key={label}><td>{label}</td><td style={{ textAlign: "right", fontWeight: 700 }}>{n ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Los asientos de recibos y órdenes de pago se revierten en Contabilidad (asiento inverso; lo no contabilizado queda omitido).</li>
            {counts.expenseReportsReopened > 0 && <li>{counts.expenseReportsReopened} rendiciones aprobadas vuelven a quedar abiertas para aprobarlas de nuevo.</li>}
            <li>Facturas de venta y compra vuelven a figurar impagas hasta que cargues cobros y pagos.</li>
            <li>Se conservan las {counts.accounts} cuentas, conceptos, reglas, fondos y la numeración (no se repiten números ya entregados).</li>
          </ul>
          <p className="muted" style={{ margin: 0 }}>No se puede deshacer. Después corregí el saldo inicial de cada cuenta (♻ en la cuenta) e importá los extractos.</p>
          <label style={{ fontWeight: 600 }}>
            Escribí {PHRASE} para confirmar
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} placeholder={PHRASE} style={{ width: "100%" }} />
          </label>
        </div>
      )}
    </Modal>
  );
}
