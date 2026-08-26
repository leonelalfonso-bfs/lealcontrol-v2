import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
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
  classificationStatus?: string;
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

export function FinanceAccountsPage() {
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
      setMovements((prev) =>
        prev.map((m) =>
          m.id === movementId
            ? {
                ...m,
                conceptId,
                conceptName: selectedConceptObj?.name || m.conceptName,
                classificationStatus: "Confirmed"
              }
            : m
        )
      );
      setSuccessMsg("Movimiento clasificado y confirmado correctamente.");
      setTimeout(() => setSuccessMsg(null), 4000);
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
    const cleaned = m.description.split(/[\s\-_/:]+/)[0] || m.description;
    setModalPattern(cleaned.toUpperCase());
  };

  const handleSaveModalClassification = async () => {
    if (!modalMovement || !modalConceptId) return;

    try {
      setActionBusy(modalMovement.id);
      setError(null);

      // Classify movement
      await api.classifyFinanceMovement(modalMovement.id, {
        financialConceptId: modalConceptId,
        confirm: true
      });

      // Optionally create rule
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
          // ignore rule error if rule creation fails
        }
      }

      const selectedConceptObj = concepts.find((c) => c.id === modalConceptId);
      setMovements((prev) =>
        prev.map((m) =>
          m.id === modalMovement.id
            ? {
                ...m,
                conceptId: modalConceptId,
                conceptName: selectedConceptObj?.name || m.conceptName,
                classificationStatus: "Confirmed"
              }
            : m
        )
      );

      setModalMovement(null);
      setSuccessMsg("Movimiento confirmado y regla registrada para futuros extractos.");
      setTimeout(() => setSuccessMsg(null), 4000);
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
      if (statusFilter === "Confirmed" && m.classificationStatus !== "Confirmed") return false;
      if (statusFilter === "Suggested" && m.classificationStatus !== "Suggested") return false;
      if (statusFilter === "Pending") {
        if (m.classificationStatus === "Confirmed" || m.classificationStatus === "Suggested")
          return false;
      }

      // Concept filter
      if (conceptFilter !== "all" && m.conceptName !== conceptFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const descMatch = m.description.toLowerCase().includes(q);
        const refMatch = m.externalReference?.toLowerCase().includes(q) || false;
        const conceptMatch = m.conceptName?.toLowerCase().includes(q) || false;
        if (!descMatch && !refMatch && !conceptMatch) return false;
      }

      // Date range filter
      if (startDate) {
        const mDate = new Date(m.operationDateUtc);
        const sDate = new Date(`${startDate}T00:00:00`);
        if (mDate < sDate) return false;
      }
      if (endDate) {
        const mDate = new Date(m.operationDateUtc);
        const eDate = new Date(`${endDate}T23:59:59`);
        if (mDate > eDate) return false;
      }

      return true;
    });
  }, [movements, statusFilter, conceptFilter, searchQuery, startDate, endDate]);

  // Financial summary of filtered rows
  const filteredCredits = useMemo(
    () =>
      filteredMovements
        .filter((m) => m.kind === "Credit")
        .reduce((sum, m) => sum + (m.amount || 0), 0),
    [filteredMovements]
  );

  const filteredDebits = useMemo(
    () =>
      filteredMovements
        .filter((m) => m.kind === "Debit")
        .reduce((sum, m) => sum + (m.amount || 0), 0),
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
        header: "Concepto / Detalle",
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
      },
      {
        key: "difference",
        header: `Diferencia (${selectedAccount.currency})`,
        value: (row) => (row.difference == null ? "" : row.difference)
      }
    ];

    exportToExcel(fileName, filteredMovements, columns);
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
    const totalConfirmed = movements.filter((m) => m.classificationStatus === "Confirmed").length;
    const totalSuggested = movements.filter((m) => m.classificationStatus === "Suggested").length;
    const totalPending = movements.length - totalConfirmed - totalSuggested;

    return (
      <div className="page-wide" style={{ paddingBottom: 60 }}>
        {/* Page Head */}
        <div className="page-head">
          <div>
            <span className="eyebrow">FINANZAS · TESORERÍA & EXTRACTOS</span>
            <h1>{selectedAccount.name}</h1>
            <p className="muted">
              Detalle bancario · clasificación progresiva de extractos y conciliación.
            </p>
          </div>
          <div className="toolbar" style={{ gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSelectedAccount(null)}>
              ← Volver a Bancos y Cajas
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleApplyRules}
              disabled={actionBusy !== null}
              title="Ejecutar motor de reglas para identificar movimientos automáticamente"
            >
              ⚙ Aplicar Reglas Automáticas
            </button>
            <button
              type="button"
              className="btn"
              onClick={handleExportExcel}
              disabled={filteredMovements.length === 0}
              style={{
                backgroundColor: "#16a34a",
                borderColor: "#16a34a",
                color: "#ffffff",
                fontWeight: 700
              }}
              title="Descargar extracto en Excel con los filtros aplicados"
            >
              📊 Exportar Excel ({filteredMovements.length})
            </button>
          </div>
        </div>

        {error && (
          <div className="alert" style={{ marginBottom: 16 }}>
            {error}
          </div>
        )}

        {successMsg && (
          <div
            className="alert"
            style={{
              marginBottom: 16,
              background: "rgba(16, 185, 129, 0.12)",
              borderColor: "#10b981",
              color: "#065f46",
              fontWeight: 600
            }}
          >
            ✓ {successMsg}
          </div>
        )}

        {/* Filtered Financial Summary KPIs */}
        <div className="grid-4" style={{ marginBottom: 16 }}>
          <div className="card pad" style={{ borderLeft: "4px solid #10b981" }}>
            <span className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 700 }}>
              Ingresos del Período
            </span>
            <h3 style={{ margin: "4px 0 0 0", color: "#059669", fontSize: "1.35rem" }}>
              +{money(filteredCredits, selectedAccount.currency)}
            </h3>
          </div>

          <div className="card pad" style={{ borderLeft: "4px solid #ef4444" }}>
            <span className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 700 }}>
              Egresos del Período
            </span>
            <h3 style={{ margin: "4px 0 0 0", color: "#dc2626", fontSize: "1.35rem" }}>
              −{money(filteredDebits, selectedAccount.currency)}
            </h3>
          </div>

          <div className="card pad" style={{ borderLeft: "4px solid #3b82f6" }}>
            <span className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 700 }}>
              Flujo Neto Filtrado
            </span>
            <h3
              style={{
                margin: "4px 0 0 0",
                color: filteredNet >= 0 ? "#059669" : "#dc2626",
                fontSize: "1.35rem"
              }}
            >
              {filteredNet >= 0 ? `+${money(filteredNet, selectedAccount.currency)}` : money(filteredNet, selectedAccount.currency)}
            </h3>
          </div>

          <div className="card pad" style={{ borderLeft: "4px solid #f59e0b" }}>
            <span className="muted" style={{ fontSize: "0.78rem", textTransform: "uppercase", fontWeight: 700 }}>
              Movimientos por Revisar
            </span>
            <h3 style={{ margin: "4px 0 0 0", color: totalPending > 0 ? "#b45309" : "#059669", fontSize: "1.35rem", fontWeight: 800 }}>
              {totalPending + totalSuggested} pendientes
            </h3>
          </div>
        </div>

        {/* Filter Panel */}
        <section className="card pad" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
            {/* Search Input */}
            <label style={{ flex: "1 1 240px" }}>
              Buscar concepto o referencia
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ej.: Depósito, COMISION, IIBB..."
              />
            </label>

            {/* Classification Status Filter */}
            <label style={{ flex: "0 1 180px" }}>
              Estado / Clasificación
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">🔍 Todos los estados ({movements.length})</option>
                <option value="Pending">⏳ Solo Pendientes ({totalPending})</option>
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
              />
            </label>

            {/* Date Range: End */}
            <label style={{ flex: "0 1 140px" }}>
              Fecha Hasta
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>

            {/* Date Presets */}
            <div className="toolbar" style={{ gap: 6, paddingBottom: 2 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setDatePreset("thisMonth")}
                title="Filtrar movimientos del mes en curso"
              >
                Este Mes
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setDatePreset("last30Days")}
                title="Últimos 30 días"
              >
                30 días
              </button>
              <button
                type="button"
                className="btn ghost btn-sm"
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
                className="btn btn-outline btn-sm"
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
                  <th>Concepto / Leyenda</th>
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
                    <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No hay movimientos que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((x) => {
                    const isConfirmed = x.classificationStatus === "Confirmed";
                    const isSuggested = x.classificationStatus === "Suggested";
                    const isPending = !isConfirmed;
                    const statusText =
                      statusLabel[x.classificationStatus || "Imported"] ||
                      x.classificationStatus ||
                      "Pendiente";

                    return (
                      <tr
                        key={x.id}
                        style={{
                          background: isConfirmed ? "rgba(16, 185, 129, 0.05)" : undefined,
                          borderLeft: isConfirmed ? "3px solid #10b981" : isSuggested ? "3px solid #f59e0b" : "3px solid #cbd5e1"
                        }}
                      >
                        <td>{new Date(x.operationDateUtc).toLocaleDateString("es-AR")}</td>
                        <td>
                          <strong>{x.description}</strong>
                          <small className="muted" style={{ display: "block", fontSize: "0.76rem" }}>
                            {x.externalReference || "Sin referencia"}
                          </small>
                        </td>
                        <td>
                          {isConfirmed ? (
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
                          {isConfirmed ? (
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
                              className="badge"
                              style={{
                                background: "rgba(100, 116, 139, 0.1)",
                                color: "#475569",
                                padding: "2px 8px",
                                borderRadius: 12,
                                fontSize: "0.78rem"
                              }}
                            >
                              ⏳ {statusText}
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              color: x.kind === "Credit" ? "#059669" : "#dc2626",
                              fontWeight: 600
                            }}
                          >
                            {x.kind === "Credit" ? "Ingreso" : "Egreso"}
                          </span>
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            color: x.kind === "Credit" ? "#059669" : "#dc2626",
                            fontWeight: 700
                          }}
                        >
                          {x.kind === "Credit" ? `+${money(x.amount, x.currency)}` : `−${money(x.amount, x.currency)}`}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
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
                          ) : (
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
                              ✏️ Modificar
                            </button>
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

        {/* Modal de Clasificación Avanzada & Reglas */}
        {modalMovement && (
          <div className="modal-backdrop">
            <div className="modal-card card pad" style={{ maxWidth: 500 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ margin: 0 }}>🏷️ Clasificar Movimiento Bancario</h3>
                <button
                  type="button"
                  className="btn ghost compact"
                  onClick={() => setModalMovement(null)}
                >
                  ✕
                </button>
              </div>

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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setModalMovement(null)}
                >
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
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · TESORERÍA</span>
          <h1>Bancos y cajas</h1>
          <p className="muted">Seleccioná una cuenta para ver el detalle y clasificar movimientos.</p>
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
