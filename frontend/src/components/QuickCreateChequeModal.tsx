import { useEffect, useState } from "react";
import { api } from "../api/client";

export type ChequeDirection = "Received" | "Issued";

export type QuickCreatedCheque = {
  id: string;
  checkNumber: string;
  amount: number;
  currency: string;
  bankName?: string;
  issuerName?: string;
  dueDateUtc?: string;
  status: string;
  direction: string;
};

type Props = {
  open: boolean;
  direction: ChequeDirection;
  defaultAmount?: number;
  defaultCurrency?: string;
  onClose: () => void;
  onCreated: (cheque: QuickCreatedCheque) => void;
};

type FormState = {
  checkNumber: string;
  amount: string;
  currency: string;
  issuerName: string;
  bankName: string;
  dueDate: string;
  notes: string;
};

/**
 * Alta rápida de cheque en cartera sin salir del formulario (OP / Recibo).
 */
export function QuickCreateChequeModal({
  open,
  direction,
  defaultAmount,
  defaultCurrency = "ARS",
  onClose,
  onCreated
}: Props) {
  const [form, setForm] = useState<FormState>({
    checkNumber: "",
    amount: "",
    currency: defaultCurrency || "ARS",
    issuerName: "",
    bankName: "",
    dueDate: "",
    notes: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      checkNumber: "",
      amount: defaultAmount && defaultAmount > 0 ? String(defaultAmount) : "",
      currency: defaultCurrency || "ARS",
      issuerName: "",
      bankName: "",
      dueDate: "",
      notes: ""
    });
  }, [open, defaultAmount, defaultCurrency]);

  if (!open) return null;

  const set = (key: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const amount = Number(String(form.amount).replace(",", "."));
    if (!form.checkNumber.trim() || !(amount > 0)) {
      setError("Número e importe son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = (await api.createReceivedCheque({
        checkNumber: form.checkNumber.trim(),
        amount,
        currency: form.currency || "ARS",
        issuerName: form.issuerName.trim() || null,
        bankName: form.bankName.trim() || null,
        dueDateUtc: form.dueDate ? new Date(`${form.dueDate}T12:00:00Z`).toISOString() : null,
        notes: form.notes.trim() || null,
        direction
      })) as QuickCreatedCheque;
      onCreated(created);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cheque.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
        padding: 16
      }}
      onClick={onClose}
    >
      <section
        className="card pad"
        style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>Nuevo cheque en cartera</h3>
            <p className="muted" style={{ margin: "4px 0 0" }}>
              {direction === "Issued" ? "Cheque propio emitido" : "Cheque recibido de terceros"}
            </p>
          </div>
          <button type="button" className="btn btn-outline compact" onClick={onClose} disabled={busy}>
            Cerrar
          </button>
        </div>

        {error && <div className="alert">{error}</div>}

        <div className="toolbar" style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
          <label>
            Número
            <input
              value={form.checkNumber}
              onChange={(e) => set("checkNumber", e.target.value)}
              autoFocus
            />
          </label>
          <label>
            Importe
            <input
              value={form.amount}
              onChange={(e) => set("amount", e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label>
            Moneda
            <select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label>
            Titular / librador
            <input value={form.issuerName} onChange={(e) => set("issuerName", e.target.value)} />
          </label>
          <label>
            Banco
            <input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
          </label>
          <label>
            Vencimiento
            <input type="date" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
          </label>
          <label style={{ flex: "1 1 100%" }}>
            Notas
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
        </div>

        <div className="toolbar" style={{ justifyContent: "flex-end", marginTop: 16, gap: 8 }}>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn" onClick={() => void save()} disabled={busy}>
            {busy ? "Guardando…" : "Crear y seleccionar"}
          </button>
        </div>
      </section>
    </div>
  );
}
