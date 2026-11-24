import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { businessDate } from "../../lib/dates";
import { Modal } from "../ui/Modal";

type Summary = {
  accountName: string;
  openingBalance: number;
  imported: number;
  deleted: number;
  keptAsPending: number;
  systemBackToPending: number;
  imports: number;
  from?: string | null;
  to?: string | null;
};

/**
 * Volver a cargar el extracto desde cero: muestra qué se borra y qué queda pendiente antes de confirmar,
 * y pide escribir el nombre de la cuenta.
 */
export function ResetStatementModal({ account, onClose, onDone }: {
  account: { id: string; name: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const [opening, setOpening] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    setSummary(null);
    setConfirmName("");
    setError(null);
    api.getStatementResetPlan(account.id).then((plan) => { setSummary(plan); setOpening(String(plan.openingBalance)); }).catch((err) => setError(err instanceof Error ? err.message : "No se pudo calcular."));
  }, [account]);

  if (!account) return null;
  const matches = confirmName.trim().toLowerCase() === account.name.trim().toLowerCase();

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const value = Number(opening.replace(",", "."));
      await api.resetStatement(account.id, confirmName,
        opening.trim() !== "" && Number.isFinite(value) && value !== summary?.openingBalance ? value : null);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reiniciar el extracto.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`♻ Reiniciar extracto · ${account.name}`}
      footer={
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn danger" onClick={() => void confirm()} disabled={!matches || busy || !summary || summary.imported === 0}>
            {busy ? "Borrando…" : `Borrar ${summary?.deleted ?? ""} movimientos`}
          </button>
        </>
      }
    >
      {error && <div className="alert">{error}</div>}
      {!summary ? (
        <p className="muted">Calculando…</p>
      ) : summary.imported === 0 ? (
        <p className="muted">La cuenta no tiene movimientos importados.</p>
      ) : (
        <div className="stack" style={{ gap: 10, fontSize: "0.9rem" }}>
          <p style={{ margin: 0 }}>
            Hay <strong>{summary.imported}</strong> movimientos importados del extracto
            {summary.from && <> ({businessDate(summary.from)} al {businessDate(summary.to)})</>}, en {summary.imports} importación(es).
          </p>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li><strong>Se borran {summary.deleted}</strong>: gastos, impuestos y movimientos sin documento. Las reglas los vuelven a sugerir al importar.</li>
            {summary.keptAsPending > 0 && (
              <li><strong>{summary.keptAsPending} quedan como pendientes de banco</strong>: tienen un cobro, pago, cheque o transferencia vinculado; al reimportar se emparejan solos.</li>
            )}
            {summary.systemBackToPending > 0 && (
              <li><strong>{summary.systemBackToPending} movimientos del sistema</strong> (recibos, órdenes de pago, depósitos) vuelven a esperar el extracto.</li>
            )}
            <li>Recibos, órdenes de pago, cheques y asientos no se tocan. Después podés volver a subir el mismo archivo.</li>
          </ul>
          <p className="muted" style={{ margin: 0 }}>Se pierden las clasificaciones confirmadas a mano de los movimientos que se borran. No se puede deshacer.</p>
          <label style={{ fontWeight: 600 }}>
            Saldo inicial de la cuenta
            <input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} style={{ width: "100%" }} />
            <span className="muted" style={{ fontWeight: 400, fontSize: "0.8rem" }}>
              El saldo del banco antes del primer renglón del extracto que vas a cargar: el saldo de ese renglón, más su débito o menos su crédito.
            </span>
          </label>
          <label style={{ fontWeight: 600 }}>
            Escribí el nombre de la cuenta para confirmar
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} placeholder={account.name} style={{ width: "100%" }} />
          </label>
        </div>
      )}
    </Modal>
  );
}
