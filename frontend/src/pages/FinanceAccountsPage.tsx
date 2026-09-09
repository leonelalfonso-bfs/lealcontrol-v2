import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { Modal } from "../components/ui/Modal";
import { exportToExcel, type ExcelColumn } from "../components/ExcelTools";

type Account = {
  id: string;
  name: string;
  currency: string;
  type: string;
  balance: number;
  isActive: boolean;
};

type Concept = {
  id: string;
  code: string;
  name: string;
  direction: string;
  usableIn?: string;
  isActive: boolean;
};

type Movement = {
  id: string;
  operationDateUtc: string;
  description: string;
  externalReference?: string;
  kind: string;
  amount: number;
  currency: string;
  reportedBalance?: number;
  systemBalance: number;
  difference?: number;
  conceptId?: string;
  conceptName?: string;
  classificationStatus?: string | number;
  reconciliationStatus?: string | number;
};

const money = (n: number, c = "ARS") =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: c }).format(n);

const statusLabel: Record<string, string> = {
  Confirmed: "Confirmado",
  Suggested: "Sugerido",
  Identified: "Identificado",
  PendingIdentification: "Pendiente",
  Imported: "Pendiente",
  Excluded: "Excluido"
};

const isConfirmedStatus = (s?: string | number) =>
  s === "Confirmed" || s === 4 || String(s) === "4";
const isSuggestedStatus = (s?: string | number) =>
  s === "Suggested" || s === 1 || String(s) === "1";
const isReconciledStatus = (s?: string | number) =>
  s === "Reconciled" || s === 2 || String(s) === "2";
const isExcludedStatus = (s?: string | number) =>
  s === "Excluded" || s === 3 || String(s) === "3";
const isCreditKind = (k?: string | number) =>
  k === "Credit" || k === 0 || String(k) === "0";

function parseMovementDetails(description: string) {
  if (!description) return { mainDesc: "Movimiento", titular: "", cuit: "", extra: "" };
  const parts = description.split(" · ");
  const mainDesc = parts[0] || description;
  let titular = "";
  let cuit = "";
  let extra = "";

  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith("Titular: ")) {
      titular = p.replace("Titular: ", "").trim();
    } else if (p.startsWith("CUIT: ")) {
      cuit = p.replace("CUIT: ", "").trim();
    } else if (p.startsWith("Canal: ") || p.startsWith("CBU: ")) {
      extra += (extra ? " · " : "") + p;
    } else {
      extra += (extra ? " · " : "") + p;
    }
  }

  return { mainDesc, titular, cuit, extra };
}

export function FinanceAccountsPage() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loadingMovements, setLoadingMovements] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  // Selection state for inline concept dropdowns: movementId -> conceptId
  const [inlineConcepts, setInlineConcepts] = useState<Record<string, string>>({});

  // Modal for rule creation & advanced classification
  const [modalMovement, setModalMovement] = useState<Movement | null>(null);
  const [modalConceptId, setModalConceptId] = useState("");
  const [modalCreateRule, setModalCreateRule] = useState(false);
  const [modalPattern, setModalPattern] = useState("");

  // Modal for Bank CSV Import / Update
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [conceptFilter, setConceptFilter] = useState<string>("all");

  useEffect(() => {
    Promise.all([
      api.listFinanceAccounts().catch(() => []),
      api.listFinanceConcepts().catch(() => [])
    ])
      .then(([accs, concs]) => {
        setAccounts(accs);
        setConcepts(concs.filter((c: Concept) => c.isActive));
      })
      .catch((e) => setError(e.message));
  }, []);

  const openAccount = async (account: Account) => {
    setSelectedAccount(account);
    setLoadingMovements(true);
    setError(null);
    setSuccessMsg(null);
    setStatusFilter("all");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setConceptFilter("all");
    try {
      const list = await api.listFinanceMovementDetails(account.id);
      setMovements(list);
      // Initialize inline concept selection
      const initConcepts: Record<string, string> = {};
      list.forEach((m: Movement) => {
        if (m.conceptId) initConcepts[m.id] = m.conceptId;
      });
      setInlineConcepts(initConcepts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los movimientos.");
    } finally {
      setLoadingMovements(false);
    }
  };

  const handleClassifyInline = async (movementId: string) => {
    const movement = movements.find((m) => m.id === movementId);
    if (movement && isReconciledStatus(movement.reconciliationStatus)) {
      setError("Este movimiento ya está conciliado con un recibo u orden de pago. No se puede reclasificar.");
      return;
    }
    const conceptId = inlineConcepts[movementId];
    if (!conceptId) {
      setError("Por favor seleccioná un concepto antes de confirmar.");
      return;
    }

    try {
      setActionBusy(movementId);
      setError(null);
      await api.classifyFinanceMovement(movementId, {
        financialConceptId: conceptId,
        confirm: true
      });

      const selectedConceptObj = concepts.find((c) => c.id === conceptId);
      const usable = selectedConceptObj?.usableIn || "";

      // Recibo / OP: abrir el formulario con el movimiento precargado.
      if (usable === "Receipt" && selectedAccount) {
        navigate(
          `/finanzas/cobranzas?movementId=${movementId}&accountId=${selectedAccount.id}&amount=${movement?.amount ?? ""}`
        );
        return;
      }
      if (usable === "PaymentOrder" && selectedAccount) {
        navigate(
          `/finanzas/pagos/nueva?movementId=${movementId}&accountId=${selectedAccount.id}&amount=${movement?.amount ?? ""}`
        );
        return;
      }

      // Solo movimiento (comisión, gastos bancarios, etc.): queda confirmado + excluido de cobro/OP.
      setMovements((prev) =>
        prev.map((m) =>
          m.id === movementId
            ? {
                ...m,
                conceptId,
                conceptName: selectedConceptObj?.name || m.conceptName,
                classificationStatus: "Confirmed",
                reconciliationStatus: usable === "MovementOnly" || usable === "Transfer" ? "Excluded" : m.reconciliationStatus
              }
            : m
        )
      );
      setSuccessMsg(
        usable === "MovementOnly" || usable === "Transfer"
          ? "Movimiento confirmado (concepto de solo tesorería; no requiere recibo ni OP)."
          : "Movimiento clasificado y confirmado correctamente."
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      if (selectedAccount) await openAccount(selectedAccount);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : "Error al clasificar el movimiento.");
    } finally {
      setActionBusy(null);
    }
  };

  const openClassifyModal = (m: Movement) => {
    setModalMovement(m);
    setModalConceptId(inlineConcepts[m.id] || m.conceptId || (concepts[0]?.id ?? ""));
    setModalCreateRule(false);
    // Suggest clean pattern from description
    const { titular, mainDesc } = parseMovementDetails(m.description);
    const patternSuggestion = titular || mainDesc.split(/[\s\-_/:]+/)[0] || m.description;
    setModalPattern(patternSuggestion.toUpperCase());
  };

  const handleSaveModalClassification = async () => {
    if (!modalMovement || !modalConceptId) return;
    if (isReconciledStatus(modalMovement.reconciliationStatus)) {
      setError("Este movimiento ya está conciliado con un recibo u orden de pago. No se puede reclasificar.");
      return;
    }

    try {
      setActionBusy(modalMovement.id);
      setError(null);

      await api.classifyFinanceMovement(modalMovement.id, {
        financialConceptId: modalConceptId,
        confirm: true
      });

      if (modalCreateRule && modalPattern.trim()) {
        try {
          await api.createFinanceConceptRule({
            financialConceptId: modalConceptId,
            accountId: selectedAccount?.id,
            matchMode: "Contains",
            pattern: modalPattern.trim(),
            priority: 100,
            isActive: true
          });
        } catch {
          // ignore rule error
        }
      }

      const selectedConceptObj = concepts.find((c) => c.id === modalConceptId);
      const usable = selectedConceptObj?.usableIn || "";
      const movementId = modalMovement.id;
      const amount = modalMovement.amount;
      setModalMovement(null);

      if (usable === "Receipt" && selectedAccount) {
        navigate(`/finanzas/cobranzas?movementId=${movementId}&accountId=${selectedAccount.id}&amount=${amount}`);
        return;
      }
      if (usable === "PaymentOrder" && selectedAccount) {
        navigate(`/finanzas/pagos/nueva?movementId=${movementId}&accountId=${selectedAccount.id}&amount=${amount}`);
        return;
      }

      setSuccessMsg(
        usable === "MovementOnly" || usable === "Transfer"
          ? "Movimiento confirmado (concepto de solo tesorería; no requiere recibo ni OP)."
          : "Movimiento confirmado y regla registrada para futuros extractos."
      );
      setTimeout(() => setSuccessMsg(null), 4000);
      if (selectedAccount) await openAccount(selectedAccount);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : "Error al guardar clasificación.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleApplyRules = async () => {
    if (!selectedAccount) return;
    try {
      setActionBusy("apply-rules");
      setError(null);
      const res = await api.applyFinanceConceptRules();
      // Reload movements
      const list = await api.listFinanceMovementDetails(selectedAccount.id);
      setMovements(list);
      const initConcepts: Record<string, string> = {};
      list.forEach((m: Movement) => {
        if (m.conceptId) initConcepts[m.id] = m.conceptId;
      });
      setInlineConcepts(initConcepts);
      setSuccessMsg(
        `Reglas aplicadas: ${res.suggested} sugeridos / actualizados, ${res.pending} pendientes.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (e: any) {
      setError(e instanceof Error ? e.message : "Error al aplicar reglas de tesorería.");
    } finally {
      setActionBusy(null);
    }
  };

  // CSV Import handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      setImportCsv(text);
      if (selectedAccount && text.trim()) {
        try {
          setImportLoading(true);
          const preview = await api.previewFinanceBankImport(selectedAccount.id, text);
          setImportPreview(preview);
        } catch (err: any) {
          setError(err.message || "Error al previsualizar extracto.");
        } finally {
          setImportLoading(false);
        }
      }
    };
    reader.readAsText(file, "ISO-8859-1"); // Standard encoding for Argentina bank CSVs
  };

  const handleConfirmImport = async () => {
    if (!selectedAccount || !importCsv.trim()) return;
    setImportLoading(true);
    setError(null);
    try {
      const res = await api.confirmFinanceBankImport(selectedAccount.id, importCsv);
      setShowImportModal(false);
      setImportCsv("");
      setImportPreview([]);
      setSuccessMsg(`¡Extracto procesado! Nuevos importados: ${res.imported}. Movimientos actualizados con Titular/CUIT: ${res.updated || 0}. Duplicados: ${res.duplicates}.`);
      await openAccount(selectedAccount);
    } catch (err: any) {
      setError(err.message || "Error al importar extracto.");
    } finally {
      setImportLoading(false);
    }
  };

  // Unique list of concepts present in movements for filter dropdown
  const uniqueConcepts = useMemo(() => {
    const set = new Set<string>();
    movements.forEach((m) => {
      if (m.conceptName) set.add(m.conceptName);
    });
    return Array.from(set).sort();
  }, [movements]);

  // Filtered movements based on classification, date range, search query and concept
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      // Classification filter
      if (statusFilter === "Pending" && (isConfirmedStatus(m.classificationStatus) || isExcludedStatus(m.reconciliationStatus))) return false;
      if (statusFilter === "Suggested" && !isSuggestedStatus(m.classificationStatus)) return false;
      if (statusFilter === "Confirmed" && !(isConfirmedStatus(m.classificationStatus) || isExcludedStatus(m.reconciliationStatus))) return false;

      // Concept filter
      if (conceptFilter !== "all" && m.conceptName !== conceptFilter) return false;

      // Date range filter
      if (startDate) {
        const mDate = m.operationDateUtc.slice(0, 10);
        if (mDate < startDate) return false;
      }
      if (endDate) {
        const mDate = m.operationDateUtc.slice(0, 10);
        if (mDate > endDate) return false;
      }

      // Search query (matches description, titular, cuit, externalReference)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const descMatch = m.description?.toLowerCase().includes(q);
        const refMatch = m.externalReference?.toLowerCase().includes(q);
        const concMatch = m.conceptName?.toLowerCase().includes(q);
        if (!descMatch && !refMatch && !concMatch) return false;
      }

      return true;
    });
  }, [movements, statusFilter, conceptFilter, startDate, endDate, searchQuery]);

  // Total summary of filtered movements
  const { filteredCredits, filteredDebits } = useMemo(
    () =>
      filteredMovements.reduce(
        (acc, m) => {
          if (m.kind === "Credit") acc.filteredCredits += m.amount;
          else acc.filteredDebits += m.amount;
          return acc;
        },
        { filteredCredits: 0, filteredDebits: 0 }
      ),
    [filteredMovements]
  );

  const filteredNet = filteredCredits - filteredDebits;

  // Export to Excel
  const handleExportExcel = () => {
    if (!selectedAccount) return;

    const fileName = `extracto-${selectedAccount.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}`;

    const columns: ExcelColumn<Movement>[] = [
      {
        key: "operationDateUtc",
        header: "Fecha",
        value: (row) => new Date(row.operationDateUtc).toLocaleDateString("es-AR")
      },
      {
        key: "description",
        header: "Leyenda Extracto",
        value: (row) => row.description
      },
      {
        key: "externalReference",
        header: "Referencia Externa",
        value: (row) => row.externalReference || ""
      },
      {
        key: "conceptName",
        header: "Concepto Tesorería",
        value: (row) => row.conceptName || "Sin identificar"
      },
      {
        key: "classificationStatus",
        header: "Estado",
        value: (row) => statusLabel[row.classificationStatus || "Imported"] || row.classificationStatus || "Pendiente"
      },
      {
        key: "kind",
        header: "Tipo",
        value: (row) => (row.kind === "Credit" ? "Ingreso" : "Egreso")
      },
      {
        key: "income",
        header: `Ingreso (${selectedAccount.currency})`,
        value: (row) => (row.kind === "Credit" ? row.amount : 0)
      },
      {
        key: "expense",
        header: `Egreso (${selectedAccount.currency})`,
        value: (row) => (row.kind === "Debit" ? row.amount : 0)
      },
      {
        key: "systemBalance",
        header: `Saldo Sistema (${selectedAccount.currency})`,
        value: (row) => row.systemBalance
      },
      {
        key: "reportedBalance",
        header: `Saldo Extracto (${selectedAccount.currency})`,
        value: (row) => (row.reportedBalance == null ? "" : row.reportedBalance)
      }
    ];

    void exportToExcel(fileName, filteredMovements, columns);
  };

  const setDatePreset = (preset: "thisMonth" | "lastMonth" | "last30Days" | "all") => {
    const today = new Date();
    if (preset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (preset === "thisMonth") {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (preset === "lastMonth") {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      setStartDate(first.toISOString().slice(0, 10));
      setEndDate(last.toISOString().slice(0, 10));
    } else if (preset === "last30Days") {
      const prev = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      setStartDate(prev.toISOString().slice(0, 10));
      setEndDate(today.toISOString().slice(0, 10));
    }
  };

  if (selectedAccount) {
    const totalConfirmed = movements.filter(
      (m) => isConfirmedStatus(m.classificationStatus) || isExcludedStatus(m.reconciliationStatus)
    ).length;
    const totalSuggested = movements.filter((m) => isSuggestedStatus(m.classificationStatus)).length;
    const totalPending = movements.length - totalConfirmed - totalSuggested;

    return (
      <div className="page-wide" style={{ paddingBottom: 60 }}>
        {/* Page Head */}
        <div className="page-head">
          <div>
            <span className="eyebrow">FINANZAS · TESORERÍA & EXTRACTOS</span>
            <h1>{selectedAccount.name}</h1>
            <p className="muted">
              Detalle bancario · identificación de titulares/CUITs, clasificación progresiva y conciliación.
            </p>
          </div>
          <div className="toolbar" style={{ gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSelectedAccount(null)}>
              ← Volver a Cuentas
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowImportModal(true);
                setImportCsv("");
                setImportPreview([]);
              }}
              style={{ fontWeight: 700 }}
            >
              📤 Importar / Actualizar Extracto CSV
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleApplyRules}
              disabled={actionBusy !== null}
              title="Ejecutar motor de reglas para identificar movimientos automáticamente"
            >
              ⚙ Aplicar Reglas
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleExportExcel}
              disabled={filteredMovements.length === 0}
              title="Descargar extracto en Excel con los filtros aplicados"
            >
              📊 Excel ({filteredMovements.length})
            </button>
          </div>
        </div>

        {error && (
          <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", borderColor: "#f87171", marginBottom: 16 }}>
            ⚠️ {error}
          </div>
        )}

        {successMsg && (
          <div
            className="alert"
            style={{
              background: "#dcfce7",
              color: "#166534",
              borderColor: "#86efac",
              marginBottom: 16
            }}
          >
            ✓ {successMsg}
          </div>
        )}

        {/* KPIs Summary Cards */}
        <div className="kpi kpi-4" style={{ marginBottom: 20 }}>
          <div className="card">
            <span className="muted">Saldo Actual en Sistema</span>
            <h3 style={{ margin: "4px 0 0 0", color: selectedAccount.balance < 0 ? "#dc2626" : "#0f172a", fontSize: "1.35rem", fontWeight: 800 }}>
              {money(selectedAccount.balance, selectedAccount.currency)}
            </h3>
          </div>
          <div className="card">
            <span className="muted">Total Ingresos (Filtro)</span>
            <h3 style={{ margin: "4px 0 0 0", color: "#059669", fontSize: "1.35rem", fontWeight: 800 }}>
              +{money(filteredCredits, selectedAccount.currency)}
            </h3>
          </div>
          <div className="card">
            <span className="muted">Total Egresos (Filtro)</span>
            <h3 style={{ margin: "4px 0 0 0", color: "#dc2626", fontSize: "1.35rem", fontWeight: 800 }}>
              −{money(filteredDebits, selectedAccount.currency)}
            </h3>
          </div>
          <div className="card">
            <span className="muted">Clasificación de Tesorería</span>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <span style={{ color: "#059669", fontWeight: 700, fontSize: "0.88rem" }}>
                ✓ {totalConfirmed} confirmados
              </span>
              <span style={{ color: "#b45309", fontWeight: 700, fontSize: "0.88rem" }}>
                ⏳ {totalPending + totalSuggested} pendientes
              </span>
            </div>
          </div>
        </div>

        {/* Filter Panel */}
        <section className="card pad" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
            {/* Search Input */}
            <label style={{ flex: "1 1 260px" }}>
              Buscar titular, CUIT, concepto o referencia
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ej.: CONSORCIO, 30716480107, KRAFT, IIBB..."
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
              />
            </label>

            {/* Classification Status Filter */}
            <label style={{ flex: "0 1 180px" }}>
              Estado / Clasificación
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
              >
                <option value="all">🔍 Todos ({movements.length})</option>
                <option value="Pending">⏳ Pendientes ({totalPending})</option>
                <option value="Suggested">🟡 Sugeridos ({totalSuggested})</option>
                <option value="Confirmed">✓ Confirmados ({totalConfirmed})</option>
              </select>
            </label>

            {/* Concept Filter */}
            {uniqueConcepts.length > 0 && (
              <label style={{ flex: "0 1 200px" }}>
                Concepto de Tesorería
                <select
                  value={conceptFilter}
                  onChange={(e) => setConceptFilter(e.target.value)}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                >
                  <option value="all">🏷️ Todos los conceptos</option>
                  {uniqueConcepts.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Date Range: Start */}
            <label style={{ flex: "0 1 140px" }}>
              Fecha Desde
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
              />
            </label>

            {/* Date Range: End */}
            <label style={{ flex: "0 1 140px" }}>
              Fecha Hasta
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--surface-border)" }}
              />
            </label>

            {/* Date Presets */}
            <div className="toolbar" style={{ gap: 6, paddingBottom: 2 }}>
              <button
                type="button"
                className="btn btn-outline compact"
                onClick={() => setDatePreset("thisMonth")}
                title="Filtrar movimientos del mes en curso"
              >
                Este Mes
              </button>
              <button
                type="button"
                className="btn btn-outline compact"
                onClick={() => setDatePreset("last30Days")}
                title="Últimos 30 días"
              >
                30 días
              </button>
              <button
                type="button"
                className="btn ghost compact"
                onClick={() => setDatePreset("all")}
                title="Limpiar rango de fechas"
              >
                Todo
              </button>
            </div>
          </div>
        </section>

        {/* Movements Table */}
        <section className="card pad">
          <div className="toolbar" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <h2 style={{ margin: 0 }}>Movimientos Bancarios</h2>
              <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
                Mostrando {filteredMovements.length} de {movements.length} movimientos.
              </p>
            </div>
            <div className="toolbar" style={{ gap: 8 }}>
              <button
                type="button"
                className="btn btn-outline compact"
                onClick={handleExportExcel}
                disabled={filteredMovements.length === 0}
                style={{ fontWeight: 600 }}
              >
                📥 Descargar Excel
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Movimiento / Leyenda</th>
                  <th>Titular / Contraparte</th>
                  <th>Concepto Tesorería</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Importe</th>
                  <th style={{ textAlign: "right" }}>Saldo sistema</th>
                  <th style={{ textAlign: "center", width: "160px" }}>Acción Clasificar</th>
                </tr>
              </thead>
              <tbody>
                {loadingMovements ? (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No hay movimientos que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((x) => {
                    const isConfirmed = isConfirmedStatus(x.classificationStatus);
                    const isSuggested = isSuggestedStatus(x.classificationStatus);
                    const isReconciled = isReconciledStatus(x.reconciliationStatus);
                    const isExcluded = isExcludedStatus(x.reconciliationStatus);
                    const isDone = isConfirmed || isReconciled || isExcluded;
                    const isPending = !isDone;
                    const { mainDesc, titular, cuit, extra } = parseMovementDetails(x.description);
                    const conceptMeta = concepts.find((c) => c.id === (inlineConcepts[x.id] || x.conceptId));
                    const usable = conceptMeta?.usableIn || "";

                    return (
                      <tr
                        key={x.id}
                        style={{
                          background: isDone ? "rgba(16, 185, 129, 0.05)" : undefined,
                          borderLeft: isDone
                            ? "3px solid #10b981"
                            : isSuggested
                              ? "3px solid #f59e0b"
                              : "3px solid #cbd5e1"
                        }}
                      >
                        <td>{new Date(x.operationDateUtc).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{mainDesc}</strong>
                          <small className="muted" style={{ display: "block", fontSize: "0.76rem" }}>
                            {x.externalReference ? `Comprobante N° ${x.externalReference}` : extra || "Sin comprobante"}
                          </small>
                        </td>
                        <td>
                          {titular ? (
                            <div>
                              <strong style={{ color: "#0f172a", fontSize: "0.86rem", display: "block" }}>
                                {titular}
                              </strong>
                              {cuit && (
                                <small style={{ color: "#0369a1", fontSize: "0.75rem", fontFamily: "monospace", fontWeight: 600 }}>
                                  CUIT: {cuit}
                                </small>
                              )}
                            </div>
                          ) : (
                            <span className="muted" style={{ fontSize: "0.8rem" }}>—</span>
                          )}
                        </td>
                        <td>
                          {isDone ? (
                            <span style={{ fontWeight: 600, color: "#065f46" }}>
                              🏷️ {x.conceptName || "Identificado"}
                            </span>
                          ) : (
                            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                              <select
                                value={inlineConcepts[x.id] || x.conceptId || ""}
                                onChange={(e) =>
                                  setInlineConcepts({ ...inlineConcepts, [x.id]: e.target.value })
                                }
                                style={{
                                  fontSize: "0.82rem",
                                  padding: "4px 6px",
                                  borderRadius: "6px",
                                  border: isSuggested ? "1px solid #f59e0b" : "1px solid var(--surface-border)",
                                  background: isSuggested ? "#fffbeb" : "white",
                                  maxWidth: "180px"
                                }}
                              >
                                <option value="">⏳ Sin identificar</option>
                                {concepts.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </td>
                        <td>
                          {isReconciled ? (
                            <span
                              className="badge ok"
                              style={{
                                background: "rgba(14, 165, 233, 0.15)",
                                color: "#0369a1",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              🔗 Conciliado
                            </span>
                          ) : isExcluded || (isConfirmed && (usable === "MovementOnly" || usable === "Transfer")) ? (
                            <span
                              className="badge ok"
                              style={{
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "#065f46",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              ✓ Confirmado
                            </span>
                          ) : isConfirmed ? (
                            <span
                              className="badge ok"
                              style={{
                                background: "rgba(16, 185, 129, 0.15)",
                                color: "#065f46",
                                fontWeight: 700,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              ✓ Confirmado
                            </span>
                          ) : isSuggested ? (
                            <span
                              className="badge warn"
                              style={{
                                background: "rgba(245, 158, 11, 0.15)",
                                color: "#92400e",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              🟡 Sugerido
                            </span>
                          ) : (
                            <span
                              className="badge off"
                              style={{
                                background: "rgba(100, 116, 139, 0.12)",
                                color: "#475569",
                                fontWeight: 500,
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              ⏳ Pendiente
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              color: x.kind === "Credit" ? "#059669" : "#dc2626",
                              fontWeight: 600,
                              fontSize: "0.85rem"
                            }}
                          >
                            {x.kind === "Credit" ? "Ingreso" : "Egreso"}
                          </span>
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: 700,
                            color: x.kind === "Credit" ? "#059669" : "#dc2626"
                          }}
                        >
                          {x.kind === "Credit" ? "+" : "−"}
                          {money(x.amount, x.currency)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontFamily: "monospace",
                            fontWeight: 600,
                            color: "#0f172a"
                          }}
                        >
                          {money(x.systemBalance, x.currency)}
                        </td>
                        <td style={{ textAlign: "center" }}>
                          {isPending ? (
                            <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                              <button
                                type="button"
                                className="btn compact"
                                disabled={actionBusy === x.id || !(inlineConcepts[x.id] || x.conceptId)}
                                onClick={() => handleClassifyInline(x.id)}
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "3px 8px",
                                  background: "#10b981",
                                  borderColor: "#10b981",
                                  color: "white",
                                  fontWeight: 700,
                                  borderRadius: "6px"
                                }}
                                title="Confirmar clasificación de este movimiento"
                              >
                                {actionBusy === x.id ? "..." : "✓ Confirmar"}
                              </button>
                              <button
                                type="button"
                                className="btn ghost compact"
                                onClick={() => openClassifyModal(x)}
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "3px 6px",
                                  borderRadius: "6px"
                                }}
                                title="Abrir opciones avanzadas o crear regla automática"
                              >
                                ⚙
                              </button>
                            </div>
                          ) : isReconciled ? (
                            <span style={{ fontSize: "0.75rem", color: "#059669", fontWeight: 700, background: "rgba(16, 185, 129, 0.1)", padding: "3px 8px", borderRadius: "6px" }}>
                              ✓ Conciliado
                            </span>
                          ) : isExcluded || usable === "MovementOnly" || usable === "Transfer" ? (
                            <span
                              style={{
                                fontSize: "0.75rem",
                                color: "#065f46",
                                fontWeight: 700,
                                background: "rgba(16, 185, 129, 0.1)",
                                padding: "3px 8px",
                                borderRadius: "6px"
                              }}
                              title="Concepto de solo movimiento: no genera recibo ni orden de pago"
                            >
                              ✓ Cerrado
                            </span>
                          ) : (
                            <div style={{ display: "flex", gap: "4px", justifyContent: "center", alignItems: "center" }}>
                              {isCreditKind(x.kind) ? (
                                <Link
                                  to={`/finanzas/cobranzas?movementId=${x.id}&accountId=${selectedAccount.id}&amount=${x.amount}`}
                                  className="btn compact"
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "2px 8px",
                                    background: "#0ea5e9",
                                    borderColor: "#0ea5e9",
                                    color: "white",
                                    fontWeight: 700,
                                    borderRadius: "6px",
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center"
                                  }}
                                  title="Registrar cobro imputando esta transferencia"
                                >
                                  💳 Cobrar
                                </Link>
                              ) : (
                                <Link
                                  to={`/finanzas/pagos/nueva?movementId=${x.id}&accountId=${selectedAccount.id}&amount=${x.amount}`}
                                  className="btn compact"
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "2px 8px",
                                    background: "#f59e0b",
                                    borderColor: "#f59e0b",
                                    color: "white",
                                    fontWeight: 700,
                                    borderRadius: "6px",
                                    textDecoration: "none",
                                    display: "inline-flex",
                                    alignItems: "center"
                                  }}
                                  title="Registrar orden de pago imputando este egreso"
                                >
                                  💸 Pagar
                                </Link>
                              )}
                              <button
                                type="button"
                                className="btn ghost compact"
                                onClick={() => openClassifyModal(x)}
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "2px 6px",
                                  color: "#64748b"
                                }}
                                title="Cambiar concepto o crear regla"
                              >
                                ✏️
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <Modal
          open={showImportModal}
          onClose={() => setShowImportModal(false)}
          title={`📤 Importar o Actualizar Extracto Bancario (${selectedAccount.name})`}
          contentStyle={{ maxWidth: 780, maxHeight: "90vh", overflowY: "auto" }}
          footer={(
            <>
              <button type="button" className="btn ghost" onClick={() => setShowImportModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={importLoading || !importCsv.trim()}
                onClick={handleConfirmImport}
                style={{ fontWeight: 700 }}
              >
                {importLoading ? "Procesando Extracto..." : "✓ Confirmar e Importar / Actualizar"}
              </button>
            </>
          )}
        >
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 0 }}>
                Seleccioná el archivo <strong>CSV exportado de Banco Galicia / Santander / Macro / etc.</strong> o pegá el contenido. El sistema extraerá automáticamente los <strong>nombres de los titulares, CUITs y motivos</strong>, y actualizará los movimientos existentes.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
                <label>
                  <strong>Seleccionar archivo CSV:</strong>
                  <input
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileChange}
                    style={{ marginTop: 6, display: "block" }}
                  />
                </label>

                <label>
                  <strong>O pegar contenido CSV:</strong>
                  <textarea
                    rows={4}
                    value={importCsv}
                    onChange={async (e) => {
                      const text = e.target.value;
                      setImportCsv(text);
                      if (text.trim()) {
                        try {
                          const preview = await api.previewFinanceBankImport(selectedAccount.id, text);
                          setImportPreview(preview);
                        } catch {
                          setImportPreview([]);
                        }
                      }
                    }}
                    placeholder="Pegar filas del CSV aquí..."
                    style={{ width: "100%", padding: "8px", fontFamily: "monospace", fontSize: "0.8rem", borderRadius: 6, border: "1px solid var(--surface-border)" }}
                  />
                </label>
              </div>

              {/* Preview Table */}
              {importPreview.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: "0 0 8px 0" }}>Vista Previa ({importPreview.length} filas detectadas):</h4>
                  <div className="table-wrap" style={{ maxHeight: 220, overflowY: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Movimiento & Titular / CUIT</th>
                          <th>Tipo</th>
                          <th style={{ textAlign: "right" }}>Importe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.slice(0, 15).map((row, idx) => (
                          <tr key={idx}>
                            <td>{new Date(row.operationDateUtc).toLocaleDateString("es-AR")}</td>
                            <td>
                              <strong>{row.description}</strong>
                              {row.externalReference && (
                                <small className="muted" style={{ display: "block", fontSize: "0.72rem" }}>
                                  Ref: {row.externalReference}
                                </small>
                              )}
                            </td>
                            <td>{row.kind === 0 || row.kind === "Credit" ? "Ingreso" : "Egreso"}</td>
                            <td style={{ textAlign: "right", fontWeight: 700, color: row.kind === 0 || row.kind === "Credit" ? "#059669" : "#dc2626" }}>
                              {money(row.amount, selectedAccount.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {importPreview.length > 15 && (
                    <small className="muted" style={{ display: "block", marginTop: 4 }}>
                      ... y {importPreview.length - 15} filas más.
                    </small>
                  )}
                </div>
              )}

        </Modal>

        <Modal
          open={!!modalMovement}
          onClose={() => setModalMovement(null)}
          title="🏷️ Clasificar Movimiento Bancario"
          contentStyle={{ maxWidth: 500 }}
          footer={modalMovement ? (
            <>
              <button type="button" className="btn ghost" onClick={() => setModalMovement(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={actionBusy !== null || !modalConceptId}
                onClick={handleSaveModalClassification}
                style={{ fontWeight: 700 }}
              >
                {actionBusy === modalMovement.id ? "Guardando..." : "✓ Confirmar Clasificación"}
              </button>
            </>
          ) : undefined}
        >
              {modalMovement ? (
              <>
              <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", marginBottom: "16px", fontSize: "0.85rem" }}>
                <div><strong>Fecha:</strong> {new Date(modalMovement.operationDateUtc).toLocaleDateString("es-AR")}</div>
                <div><strong>Leyenda extracto:</strong> {modalMovement.description}</div>
                <div>
                  <strong>Importe:</strong>{" "}
                  <span style={{ color: modalMovement.kind === "Credit" ? "#059669" : "#dc2626", fontWeight: 700 }}>
                    {modalMovement.kind === "Credit" ? "+" : "−"}{money(modalMovement.amount, modalMovement.currency)}
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <label style={{ display: "block" }}>
                  <strong>Concepto de Tesorería *</strong>
                  <select
                    value={modalConceptId}
                    onChange={(e) => setModalConceptId(e.target.value)}
                    style={{ width: "100%", marginTop: "4px", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--surface-border)" }}
                  >
                    <option value="">-- Seleccionar concepto --</option>
                    {concepts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.88rem", marginTop: 4 }}>
                  <input
                    type="checkbox"
                    checked={modalCreateRule}
                    onChange={(e) => setModalCreateRule(e.target.checked)}
                  />
                  <span>Crear regla para clasificar automáticamente en el futuro</span>
                </label>

                {modalCreateRule && (
                  <div style={{ padding: "10px", background: "#fffbeb", borderRadius: "6px", border: "1px solid #fde68a", fontSize: "0.82rem" }}>
                    <label style={{ display: "block" }}>
                      <strong>Texto a reconocer en futuros extractos:</strong>
                      <input
                        type="text"
                        value={modalPattern}
                        onChange={(e) => setModalPattern(e.target.value.toUpperCase())}
                        style={{ width: "100%", marginTop: "4px", padding: "6px 8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                      />
                    </label>
                    <small className="muted" style={{ display: "block", marginTop: "4px" }}>
                      Cada vez que un extracto contenga este texto en <em>{selectedAccount.name}</em>, se sugerirá este concepto automáticamente.
                    </small>
                  </div>
                )}
              </div>
              </>
              ) : null}
        </Modal>
      </div>
    );
  }

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · TESORERÍA</span>
          <h1>Bancos y Cajas</h1>
          <p className="muted">Seleccioná una cuenta para ver el detalle, importar extractos y clasificar movimientos.</p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      <div className="account-cards">
        {accounts.map((x) => (
          <button className="account-card" key={x.id} onClick={() => void openAccount(x)}>
            <div className="account-card-title">
              <span className="account-icon">▦</span>
              <strong>{x.name}</strong>
            </div>
            <span className="muted">
              {x.type} · {x.currency}
            </span>
            <div className="account-card-footer">
              <strong className={x.balance < 0 ? "negative" : ""}>{money(x.balance, x.currency)}</strong>
              <span>Ver cuenta →</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
