import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/client";
import { DataTable } from "../components/ui/DataTable";

type Cheque = {
  id: string;
  checkNumber: string;
  amount: number;
  currency: string;
  issuerName?: string;
  bankName?: string;
  dueDateUtc?: string;
  status: string;
  direction: string;
  notes?: string;
};

type Account = { id: string; name: string; currency: string };

const money = (n: number, c = "ARS") => new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);
const labels: Record<string, string> = {
  Available: "En cartera",
  Issued: "Emitido",
  Deposited: "Depositado",
  Presented: "Presentado",
  Credited: "Acreditado",
  Debited: "Debitado",
  UsedForPayment: "Endosado / aplicado",
  Rejected: "Rechazado",
  Expired: "Vencido",
  Cancelled: "Anulado"
};

export function ChequePortfolioPage() {
  const [rows, setRows] = useState<Cheque[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tab, setTab] = useState<"Received" | "Issued">("Received");
  const [statusFilter, setStatusFilter] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    checkNumber: "",
    amount: "",
    currency: "ARS",
    issuerName: "",
    bankName: "",
    dueDate: "",
    notes: ""
  });
  const received = useRef<HTMLInputElement>(null);
  const issued = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [c, a] = await Promise.all([api.listReceivedCheques(), api.listFinanceAccounts()]);
    setRows(c);
    setAccounts(a.filter((x) => x.currency === "ARS"));
  };

  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);

  const createManual = async () => {
    const amount = Number(form.amount.replace(",", "."));
    if (!form.checkNumber.trim() || !(amount > 0)) {
      setError("Número e importe son obligatorios.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createReceivedCheque({
        checkNumber: form.checkNumber.trim(),
        amount,
        currency: form.currency || "ARS",
        issuerName: form.issuerName.trim() || null,
        bankName: form.bankName.trim() || null,
        dueDateUtc: form.dueDate ? new Date(`${form.dueDate}T12:00:00Z`).toISOString() : null,
        notes: form.notes.trim() || null,
        direction: tab
      });
      setShowCreate(false);
      setForm({ checkNumber: "", amount: "", currency: "ARS", issuerName: "", bankName: "", dueDate: "", notes: "" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el cheque.");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File, direction: "received" | "issued") => {
    setBusy(true);
    try {
      const content = await file.text();
      const r = direction === "received" ? await api.importReceivedCheques(content) : await api.importIssuedCheques(content);
      await load();
      alert(`Importados: ${r.imported}. Duplicados: ${r.duplicates}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const today = new Date().toISOString().slice(0, 10);
  const visible = useMemo(() => {
    return rows
      .filter((x) => x.direction === tab)
      .filter((x) => !statusFilter || x.status === statusFilter)
      .filter((x) => !onlyOverdue || (x.dueDateUtc && x.dueDateUtc.slice(0, 10) < today && ["Available", "Issued", "Deposited", "Presented"].includes(x.status)));
  }, [rows, tab, statusFilter, onlyOverdue, today]);

  const overdueCount = rows.filter((x) => x.dueDateUtc && x.dueDateUtc.slice(0, 10) < today && ["Available", "Issued"].includes(x.status)).length;

  const deposit = async (cheque: Cheque) => {
    const bankAccountId = accounts[0]?.id;
    if (!bankAccountId) return alert("Creá una cuenta bancaria primero.");
    setBusy(true);
    try {
      await api.depositCheque(cheque.id, { bankAccountId, depositDateUtc: new Date().toISOString() });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo depositar.");
    } finally {
      setBusy(false);
    }
  };

  const reject = async (cheque: Cheque) => {
    const note = window.prompt("Motivo del rechazo:");
    if (note === null) return;
    setBusy(true);
    try {
      await api.rejectCheque(cheque.id, { rejectDateUtc: new Date().toISOString(), note: note || undefined });
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo rechazar.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (cheque: Cheque) => {
    const reason = window.prompt("Motivo de anulación:");
    if (!reason?.trim()) return;
    setBusy(true);
    try {
      await api.cancelCheque(cheque.id, reason.trim());
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo anular.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · VALORES</span>
          <h1>Cartera de cheques</h1>
          <p className="muted">Recibidos y emitidos con acciones de depósito, rechazo y anulación.</p>
        </div>
        <div className="toolbar">
          <button className="btn" disabled={busy} onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "Cerrar alta" : "＋ Nuevo cheque"}
          </button>
          <button className="btn btn-outline" disabled={busy} onClick={() => received.current?.click()}>⇧ Importar recibidos</button>
          <button className="btn btn-outline" disabled={busy} onClick={() => issued.current?.click()}>⇧ Importar emitidos</button>
          <input ref={received} type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f, "received"); }} />
          <input ref={issued} type="file" accept=".csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f, "issued"); }} />
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      {showCreate && (
        <section className="card pad" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Alta manual — cheque {tab === "Received" ? "recibido" : "emitido"}</h3>
          <div className="toolbar" style={{ flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <label>
              Número
              <input value={form.checkNumber} onChange={(e) => setForm((f) => ({ ...f, checkNumber: e.target.value }))} />
            </label>
            <label>
              Importe
              <input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} inputMode="decimal" />
            </label>
            <label>
              Moneda
              <select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                <option value="ARS">ARS</option>
                <option value="USD">USD</option>
              </select>
            </label>
            <label>
              Titular / librador
              <input value={form.issuerName} onChange={(e) => setForm((f) => ({ ...f, issuerName: e.target.value }))} />
            </label>
            <label>
              Banco
              <input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
            </label>
            <label>
              Vencimiento
              <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </label>
            <label>
              Notas
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            <button className="btn" disabled={busy} onClick={() => void createManual()}>Guardar</button>
          </div>
        </section>
      )}
      {overdueCount > 0 && <div className="alert" style={{ background: "rgba(245,158,11,0.15)" }}>⚠ {overdueCount} cheque(s) vencido(s) en cartera.</div>}
      <section className="card pad">
        <div className="toolbar" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <div className="toolbar">
            <button className={tab === "Received" ? "btn" : "btn btn-outline"} onClick={() => setTab("Received")}>Recibidos ({rows.filter((x) => x.direction === "Received").length})</button>
            <button className={tab === "Issued" ? "btn" : "btn btn-outline"} onClick={() => setTab("Issued")}>Emitidos ({rows.filter((x) => x.direction === "Issued").length})</button>
          </div>
          <div className="toolbar">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <label><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Solo vencidos</label>
          </div>
        </div>
        <div className="table-wrap" style={{ marginTop: 14 }}>
          <DataTable
            empty="No hay cheques con los filtros actuales."
            columns={[
              { key: "checkNumber", header: "Número", render: (x) => <strong>{x.checkNumber}</strong> },
              { key: "issuerName", header: "Titular", render: (x) => x.issuerName || "—" },
              { key: "bankName", header: "Banco", render: (x) => x.bankName || "—" },
              { key: "dueDateUtc", header: "Vencimiento", render: (x) => x.dueDateUtc ? new Date(x.dueDateUtc).toLocaleDateString("es-AR") : "—" },
              { key: "amount", header: "Importe", render: (x) => money(x.amount, x.currency) },
              { key: "status", header: "Estado", render: (x) => <span className="badge">{labels[x.status] || x.status}</span> },
              {
                key: "actions",
                header: "Acciones",
                render: (x) => (
                  <div className="toolbar" style={{ gap: 4 }}>
                    {tab === "Received" && x.status === "Available" && <button className="btn btn-sm" disabled={busy} onClick={() => void deposit(x)}>Depositar</button>}
                    {tab === "Received" && ["Available", "Deposited", "Presented"].includes(x.status) && <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => void reject(x)}>Rechazar</button>}
                    {!["UsedForPayment", "Credited", "Debited", "Cancelled"].includes(x.status) && <button className="btn btn-sm ghost" disabled={busy} onClick={() => void cancel(x)}>Anular</button>}
                  </div>
                )
              }
            ]}
            rows={visible}
            rowKey={(x) => x.id}
          />
        </div>
        <p className="muted" style={{ marginTop: 10 }}>El historial de estados queda registrado en las notas de cada cheque.</p>
      </section>
    </div>
  );
}
