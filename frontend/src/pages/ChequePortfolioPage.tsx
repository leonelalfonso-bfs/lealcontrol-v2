import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { CustomerSummary } from "../api/types";
import { CustomerPicker } from "../components/pickers";
import { DataTable } from "../components/ui/DataTable";
import { Modal } from "../components/ui/Modal";

import { todayAr, businessDate } from "../lib/dates";
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
  supplierId?: string | null;
  paymentOrderId?: string | null;
  customerId?: string | null;
  collectionReceiptId?: string | null;
  receivedFrom?: string | null;
};

type Account = { id: string; name: string; currency: string; type: string };

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
  const [suppliers, setSuppliers] = useState<CustomerSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  // Depósito: a qué cuenta bancaria y qué día (el crédito del extracto lo concilia la bandeja).
  const [depositing, setDepositing] = useState<{ cheque: Cheque; accountId: string; date: string } | null>(null);
  const navigate = useNavigate();
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
    supplierId: "",
    customerId: "",
    bankName: "",
    issueDate: todayAr(),
    dueDate: "",
    notes: ""
  });
  const received = useRef<HTMLInputElement>(null);
  const issued = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [c, a] = await Promise.all([api.listReceivedCheques(), api.listFinanceAccounts()]);
    setRows(c);
    setAccounts(a.filter((x) => x.type === "Bank" && x.isActive));
  };

  useEffect(() => {
    void api.listAllCustomers("").then((all) => {
      setSuppliers(all.filter((x) => x.isSupplier));
      setCustomers(all.filter((x) => x.isCustomer));
    }).catch(() => { setSuppliers([]); setCustomers([]); });
  }, []);

  const customerName = (id?: string | null) => customers.find((c) => c.id === id)?.legalName;

  const assignCustomer = async (cheque: Cheque, customerId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.assignChequeCustomer(cheque.id, customerId || null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el cliente.");
    } finally {
      setBusy(false);
    }
  };

  const assignSupplier = async (cheque: Cheque, supplierId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.assignChequeSupplier(cheque.id, supplierId || null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el proveedor.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);

  const createManual = async () => {
    const amount = Number(form.amount.replace(",", "."));
    if (!form.checkNumber.trim() || !(amount > 0)) {
      setError("Número e importe son obligatorios.");
      return;
    }
    if (!form.issueDate || !form.dueDate) {
      setError("Fecha de emisión y fecha de vencimiento (pago) son obligatorias.");
      return;
    }
    if (form.dueDate < form.issueDate) {
      setError("El vencimiento no puede ser anterior a la fecha de emisión.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.createReceivedCheque({
        checkNumber: form.checkNumber.trim(),
        amount,
        currency: form.currency || "ARS",
        issuerName: form.issuerName.trim() || (tab === "Issued" ? suppliers.find((s) => s.id === form.supplierId)?.legalName : "") || null,
        supplierId: tab === "Issued" && form.supplierId ? form.supplierId : null,
        customerId: tab === "Received" && form.customerId ? form.customerId : null,
        bankName: form.bankName.trim() || null,
        issueDateUtc: new Date(`${form.issueDate}T12:00:00Z`).toISOString(),
        dueDateUtc: new Date(`${form.dueDate}T12:00:00Z`).toISOString(),
        notes: form.notes.trim() || null,
        direction: tab
      });
      setShowCreate(false);
      setForm({
        checkNumber: "",
        amount: "",
        currency: "ARS",
        issuerName: "",
        supplierId: "",
        customerId: "",
        bankName: "",
        issueDate: todayAr(),
        dueDate: "",
        notes: ""
      });
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

  const today = todayAr();
  const visible = useMemo(() => {
    return rows
      .filter((x) => x.direction === tab)
      .filter((x) => !statusFilter || x.status === statusFilter)
      .filter((x) => !onlyOverdue || (x.dueDateUtc && x.dueDateUtc.slice(0, 10) < today && ["Available", "Issued", "Deposited", "Presented"].includes(x.status)));
  }, [rows, tab, statusFilter, onlyOverdue, today]);

  const overdueCount = rows.filter((x) => x.dueDateUtc && x.dueDateUtc.slice(0, 10) < today && ["Available", "Issued"].includes(x.status)).length;

  const deposit = (cheque: Cheque) => {
    const options = accounts.filter((a) => a.currency === cheque.currency);
    if (options.length === 0) return alert(`Creá una cuenta bancaria en ${cheque.currency} primero.`);
    setDepositing({ cheque, accountId: options[0].id, date: todayAr() });
  };

  const confirmDeposit = async () => {
    if (!depositing) return;
    setBusy(true);
    try {
      await api.depositCheque(depositing.cheque.id, {
        bankAccountId: depositing.accountId,
        depositDateUtc: new Date(`${depositing.date}T12:00:00Z`).toISOString()
      });
      setDepositing(null);
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
            {tab === "Issued" ? (
              <label style={{ minWidth: 260 }}>
                Proveedor (a quién se entrega)
                <CustomerPicker role="supplier" compact options={suppliers} value={form.supplierId} onChange={(id) => setForm((f) => ({ ...f, supplierId: id }))} />
              </label>
            ) : (
              <>
                <label style={{ minWidth: 260 }}>
                  Cliente (quién lo entregó)
                  <CustomerPicker role="customer" compact options={customers} value={form.customerId} onChange={(id) => setForm((f) => ({ ...f, customerId: id }))} />
                </label>
                <label>
                  Titular / librador
                  <input value={form.issuerName} onChange={(e) => setForm((f) => ({ ...f, issuerName: e.target.value }))} />
                </label>
              </>
            )}
            <label>
              Banco
              <input value={form.bankName} onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))} />
            </label>
            <label>
              Emisión *
              <input
                type="date"
                required
                value={form.issueDate}
                onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
              />
            </label>
            <label>
              Vencimiento (pago) *
              <input
                type="date"
                required
                value={form.dueDate}
                onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </label>
            <label>
              Notas
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </label>
            <button className="btn" disabled={busy} onClick={() => void createManual()}>Guardar</button>
          </div>
        </section>
      )}
      <Modal
        open={!!depositing}
        onClose={() => setDepositing(null)}
        title={depositing ? `Depositar cheque N° ${depositing.cheque.checkNumber} · ${money(depositing.cheque.amount, depositing.cheque.currency)}` : ""}
        contentStyle={{ maxWidth: 520 }}
        footer={
          <>
            <button className="btn btn-outline" disabled={busy} onClick={() => setDepositing(null)}>Cancelar</button>
            <button className="btn" disabled={busy || !depositing?.date} onClick={() => void confirmDeposit()}>Depositar</button>
          </>
        }
      >
        {depositing && (
          <div className="stack" style={{ display: "grid", gap: 12 }}>
            <label>
              Cuenta bancaria
              <select value={depositing.accountId} onChange={(e) => setDepositing({ ...depositing, accountId: e.target.value })}>
                {accounts.filter((a) => a.currency === depositing.cheque.currency).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label>
              Fecha del depósito
              <input type="date" value={depositing.date} onChange={(e) => setDepositing({ ...depositing, date: e.target.value })} />
            </label>
            <p className="muted" style={{ margin: 0 }}>Queda “Depositado”. Cuando importes el extracto, el crédito se empareja solo y el cheque pasa a “Acreditado”.</p>
          </div>
        )}
      </Modal>
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
              ...(tab === "Issued" ? [{
                key: "supplierId",
                header: "Entregado a (proveedor)",
                render: (x: Cheque) => x.paymentOrderId || x.status === "Cancelled"
                  ? suppliers.find((s) => s.id === x.supplierId)?.legalName || "—"
                  : <CustomerPicker role="supplier" compact options={suppliers} value={x.supplierId ?? ""} disabled={busy}
                      placeholder="Asignar proveedor" aria-label={`Proveedor del cheque ${x.checkNumber}`}
                      onChange={(id) => void assignSupplier(x, id)} />
              }] : []),
              ...(tab === "Received" ? [{
                key: "customerId",
                header: "Recibido de (cliente)",
                render: (x: Cheque) => x.collectionReceiptId || !["Available", "Deposited"].includes(x.status)
                  ? customerName(x.customerId) || x.receivedFrom || "—"
                  : <CustomerPicker role="customer" compact options={customers} value={x.customerId ?? ""} disabled={busy}
                      placeholder={x.receivedFrom || "Asignar cliente"} aria-label={`Cliente del cheque ${x.checkNumber}`}
                      onChange={(id) => void assignCustomer(x, id)} />
              }] : []),
              { key: "bankName", header: "Banco", render: (x) => x.bankName || "—" },
              { key: "dueDateUtc", header: "Vencimiento", render: (x) => x.dueDateUtc ? businessDate(x.dueDateUtc) : "—" },
              { key: "amount", header: "Importe", render: (x) => money(x.amount, x.currency) },
              { key: "status", header: "Estado", render: (x) => <span className="badge">{labels[x.status] || x.status}</span> },
              {
                key: "actions",
                header: "Acciones",
                render: (x) => (
                  <div className="toolbar" style={{ gap: 4 }}>
                    {tab === "Issued" && x.supplierId && !x.paymentOrderId && x.status === "Issued" && (
                      <button className="btn btn-sm" disabled={busy} onClick={() => navigate(`/finanzas/ordenes-pago/nueva?supplierId=${x.supplierId}&chequeId=${x.id}`)}>Orden de pago</button>
                    )}
                    {tab === "Received" && x.status === "Available" && <button className="btn btn-sm" disabled={busy} onClick={() => deposit(x)}>Depositar</button>}
                    {tab === "Received" && x.status === "Available" && (
                      <button className="btn btn-sm btn-outline" disabled={busy} onClick={() => navigate(`/finanzas/ordenes-pago/nueva?chequeId=${x.id}`)}>Endosar</button>
                    )}
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
