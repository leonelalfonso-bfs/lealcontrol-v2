import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function ChartOfAccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  const loadAccounts = () => {
    setLoading(true);
    api.listAccounts()
      .then((data) => setAccounts(data || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const filteredAccounts = accounts.filter((a) => {
    const matchesSearch =
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.name.toLowerCase().includes(search.toLowerCase());
    const matchesType = selectedType === "ALL" || a.accountType === selectedType;
    return matchesSearch && matchesType;
  });

  const handleDelete = async (acc: any) => {
    if (!window.confirm(`¿Estás seguro de eliminar la cuenta ${acc.code} - ${acc.name}?`)) return;
    try {
      setError(null);
      await api.deleteAccount(acc.id);
      loadAccounts();
    } catch (err: any) {
      setError(err?.message || "Error al eliminar cuenta.");
    }
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Page Header */}
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1>🌳 Plan de Cuentas Contable</h1>
          <p className="muted">Estructura jerárquica del plan de cuentas, rubros y cuentas imputables</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link
            to="/contabilidad/modelos"
            className="btn ghost"
            title="Gestionar Asientos Modelos"
          >
            ⚙️ Asientos Modelos
          </Link>
          <Link
            to="/contabilidad/plan-cuentas/nuevo"
            className="btn"
            style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff", fontWeight: 700 }}
          >
            ➕ Nueva Cuenta Contable
          </Link>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="tab-row">
        <Link to="/contabilidad" className="tab-btn">
          📊 Tablero Ejecutivo & P&L
        </Link>
        <Link to="/contabilidad/modelos" className="tab-btn">
          ⚙️ Asientos Modelos
        </Link>
        <Link to="/contabilidad/plan-cuentas" className="tab-btn active">
          🌳 Plan de Cuentas ({accounts.length})
        </Link>
        <Link to="/contabilidad/asientos" className="tab-btn">
          📖 Libro Diario
        </Link>
        <Link to="/contabilidad/mayor" className="tab-btn">
          🔍 Libro Mayor
        </Link>
        <Link to="/contabilidad/sumas-saldos" className="tab-btn">
          ⚖️ Sumas y Saldos
        </Link>
        <Link to="/contabilidad/conciliacion" className="tab-btn">
          🏦 Conciliación Bancaria
        </Link>
        <Link to="/contabilidad/portal-estudio" className="tab-btn">
          🏢 Cierres & IVA Digital (ARCA)
        </Link>
      </div>

      {error && <div className="alert">{error}</div>}

      {/* Search & Chapter Filters */}
      <div className="card pad" style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <input
            type="text"
            placeholder="🔍 Buscar por código o denominación de cuenta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #cbd5e1" }}
          />
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          {[
            { id: "ALL", label: "Todas" },
            { id: "Asset", label: "1. Activo" },
            { id: "Liability", label: "2. Pasivo" },
            { id: "Equity", label: "3. Pat. Neto" },
            { id: "Income", label: "4. Ingresos" },
            { id: "Expense", label: "5. Egresos" }
          ].map((t) => (
            <button
              key={t.id}
              className={`tab-btn ${selectedType === t.id ? "active" : ""}`}
              onClick={() => setSelectedType(t.id)}
              style={{ fontSize: "0.82rem", padding: "6px 12px" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accounts Tree Table */}
      <div className="card pad">
        {loading ? (
          <p style={{ textAlign: "center", padding: 30 }} className="muted">
            Cargando Plan de Cuentas...
          </p>
        ) : filteredAccounts.length === 0 ? (
          <p style={{ textAlign: "center", padding: 30 }} className="muted">
            No se encontraron cuentas contables con los filtros seleccionados.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table" style={{ width: "100%", fontSize: "0.88rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--surface-sunken)", borderBottom: "2px solid #cbd5e1" }}>
                  <th style={{ width: 140 }}>Código</th>
                  <th>Denominación de la Cuenta</th>
                  <th style={{ width: 110 }}>Capítulo</th>
                  <th style={{ width: 90, textAlign: "center" }}>Nivel</th>
                  <th style={{ width: 110, textAlign: "center" }}>Imputable</th>
                  <th style={{ width: 80, textAlign: "center" }}>Moneda</th>
                  <th style={{ width: 80, textAlign: "center" }}>Estado</th>
                  <th style={{ width: 140, textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredAccounts.map((acc) => {
                  const indent = (acc.level - 1) * 22;
                  const isGroup = !acc.isDirectPosting;

                  return (
                    <tr key={acc.id} style={{ background: isGroup ? "rgba(241, 245, 249, 0.5)" : "transparent", borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ fontFamily: "monospace", fontWeight: isGroup ? 800 : 500, color: isGroup ? "#0f172a" : "#0d9488" }}>
                        {acc.code}
                      </td>
                      <td>
                        <div style={{ paddingLeft: indent, display: "flex", alignItems: "center", gap: 8 }}>
                          <span>{isGroup ? "📁" : "📄"}</span>
                          <span style={{ fontWeight: isGroup ? 800 : 500, color: isGroup ? "#0f172a" : "#334155" }}>
                            {acc.name}
                          </span>
                          {acc.adjustsForInflation && (
                            <span style={{ fontSize: "0.68rem", padding: "2px 6px", background: "#fef3c7", color: "#92400e", borderRadius: 4, fontWeight: 700 }}>
                              AxI (RT6)
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${acc.accountType === "Asset" ? "ok" : acc.accountType === "Liability" ? "error" : "primary"}`} style={{ fontSize: "0.72rem" }}>
                          {acc.accountType === "Asset" ? "Activo" : acc.accountType === "Liability" ? "Pasivo" : acc.accountType === "Equity" ? "P. Neto" : acc.accountType === "Income" ? "Ingreso" : "Egreso"}
                        </span>
                      </td>
                      <td style={{ textAlign: "center" }}>Nivel {acc.level}</td>
                      <td style={{ textAlign: "center" }}>
                        {acc.isDirectPosting ? (
                          <span className="badge ok" style={{ fontSize: "0.72rem" }}>Imputable</span>
                        ) : (
                          <span className="badge ghost" style={{ fontSize: "0.72rem" }}>Agrupadora</span>
                        )}
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700 }}>{acc.currency || "ARS"}</td>
                      <td style={{ textAlign: "center" }}>
                        {acc.isActive !== false ? (
                          <span className="badge ok" style={{ fontSize: "0.68rem" }}>Activa</span>
                        ) : (
                          <span className="badge error" style={{ fontSize: "0.68rem" }}>Inactiva</span>
                        )}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                          {isGroup && (
                            <Link
                              to={`/contabilidad/plan-cuentas/nuevo?parent=${acc.code}`}
                              className="btn ghost compact"
                              title="Agregar subcuenta dependiente"
                              style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                            >
                              + Sub
                            </Link>
                          )}
                          <Link
                            to={`/contabilidad/plan-cuentas/${acc.id}`}
                            className="btn ghost compact"
                            title="Editar cuenta"
                            style={{ padding: "3px 8px", fontSize: "0.75rem" }}
                          >
                            ✏️ Editar
                          </Link>
                          <button
                            type="button"
                            className="btn ghost compact"
                            title="Eliminar cuenta"
                            onClick={() => handleDelete(acc)}
                            style={{ padding: "3px 8px", fontSize: "0.75rem", color: "#ef4444" }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
