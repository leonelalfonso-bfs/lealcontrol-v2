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
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMovements, setLoadingMovements] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [conceptFilter, setConceptFilter] = useState<string>("all");

  useEffect(() => {
    api
      .listFinanceAccounts()
      .then(setAccounts)
      .catch((e) => setError(e.message));
  }, []);

  const openAccount = async (account: Account) => {
    setSelectedAccount(account);
    setLoadingMovements(true);
    // Reset filters on opening account
    setStatusFilter("all");
    setStartDate("");
    setEndDate("");
    setSearchQuery("");
    setConceptFilter("all");
    try {
      setMovements(await api.listFinanceMovementDetails(account.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los movimientos.");
    } finally {
      setLoadingMovements(false);
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

  // Export to Excel with custom columns and formatted numbers
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

  // Preset Date range helpers
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
              Detalle bancario · comparación entre extracto oficial y movimientos registrados.
            </p>
          </div>
          <div className="toolbar" style={{ gap: 10 }}>
            <button className="btn btn-outline" onClick={() => setSelectedAccount(null)}>
              ← Volver a Bancos y Cajas
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

        {error && <div className="alert">{error}</div>}

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
              Saldo Actual en Sistema
            </span>
            <h3 style={{ margin: "4px 0 0 0", fontSize: "1.35rem", fontWeight: 800 }}>
              {money(selectedAccount.balance, selectedAccount.currency)}
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
                <option value="Confirmed">✓ Confirmados ({totalConfirmed})</option>
                <option value="Suggested">🟡 Sugeridos ({totalSuggested})</option>
                <option value="Pending">⏳ Por revisar ({totalPending})</option>
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
                  <th>Clasificación</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th style={{ textAlign: "right" }}>Ingreso</th>
                  <th style={{ textAlign: "right" }}>Egreso</th>
                  <th style={{ textAlign: "right" }}>Saldo sistema</th>
                  <th style={{ textAlign: "right" }}>Saldo extracto</th>
                  <th style={{ textAlign: "right" }}>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {loadingMovements ? (
                  <tr>
                    <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No hay movimientos que coincidan con los filtros aplicados.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((x) => {
                    const isConfirmed = x.classificationStatus === "Confirmed";
                    const isSuggested = x.classificationStatus === "Suggested";
                    const statusText =
                      statusLabel[x.classificationStatus || "Imported"] ||
                      x.classificationStatus ||
                      "Pendiente";

                    return (
                      <tr
                        key={x.id}
                        style={{
                          background: isConfirmed ? "rgba(16, 185, 129, 0.05)" : undefined,
                          borderLeft: isConfirmed ? "3px solid #10b981" : undefined
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
                          {x.conceptName ? (
                            <span style={{ fontWeight: 600, color: isConfirmed ? "#0d9488" : "inherit" }}>
                              🏷️ {x.conceptName}
                            </span>
                          ) : (
                            <span className="muted">Sin identificar</span>
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
                            color: "#059669",
                            fontWeight: x.kind === "Credit" ? 700 : 400
                          }}
                        >
                          {x.kind === "Credit" ? `+${money(x.amount, x.currency)}` : "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            color: "#dc2626",
                            fontWeight: x.kind === "Debit" ? 700 : 400
                          }}
                        >
                          {x.kind === "Debit" ? `−${money(x.amount, x.currency)}` : "—"}
                        </td>
                        <td style={{ textAlign: "right", fontWeight: 600 }}>
                          {money(x.systemBalance, x.currency)}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {x.reportedBalance == null ? "—" : money(x.reportedBalance, x.currency)}
                        </td>
                        <td
                          style={{ textAlign: "right" }}
                          className={x.difference && Math.abs(x.difference) > 0.01 ? "negative" : ""}
                        >
                          {x.difference == null ? "—" : money(x.difference, x.currency)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">FINANZAS · TESORERÍA</span>
          <h1>Bancos y cajas</h1>
          <p className="muted">Seleccioná una cuenta para ver el detalle completo.</p>
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
