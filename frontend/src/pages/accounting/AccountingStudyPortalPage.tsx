import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function AccountingStudyPortalPage() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPeriods = () => {
    setLoading(true);
    api.listFiscalPeriods()
      .then((data) => setPeriods(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPeriods();
  }, []);

  const handleToggleLock = async (year: number, month: number, currentLocked: boolean) => {
    try {
      setError(null);
      await api.lockFiscalPeriod({
        year,
        month,
        lock: !currentLocked,
        user: "Contador Auditor"
      });
      const monthStr = String(month).padStart(2, "0");
      setMsg(`✓ Período ${monthStr}/${year} ${!currentLocked ? "CERRADO y BLOQUEADO con candado fiscal" : "REABIERTO para ajustes"}.`);
      loadPeriods();
    } catch (err: any) {
      setError(err?.message || "Error al actualizar estado del período.");
    }
  };

  const months = [
    { num: 1, name: "Enero" },
    { num: 2, name: "Febrero" },
    { num: 3, name: "Marzo" },
    { num: 4, name: "Abril" },
    { num: 5, name: "Mayo" },
    { num: 6, name: "Junio" },
    { num: 7, name: "Julio" },
    { num: 8, name: "Agosto" },
    { num: 9, name: "Septiembre" },
    { num: 10, name: "Octubre" },
    { num: 11, name: "Noviembre" },
    { num: 12, name: "Diciembre" }
  ];

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>🏢 Portal para Estudios Contables & Cierres Fiscales</h1>
          <p className="muted">Bloqueo de meses auditados y exportación oficial de Libro IVA Digital para ARCA</p>
        </div>
      </div>

      {/* Nav Tabs */}
      <div className="tab-row">
        <Link to="/contabilidad" className="tab-btn">
          📊 Tablero Ejecutivo & P&L
        </Link>
        <Link to="/contabilidad/plan-cuentas" className="tab-btn">
          🌳 Plan de Cuentas
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
        <Link to="/contabilidad/portal-estudio" className="tab-btn active">
          🏢 Cierres & IVA Digital (ARCA)
        </Link>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      {/* ARCA Export Box */}
      <div className="card pad" style={{ border: "1px solid var(--accent)", background: "rgba(37, 99, 235, 0.03)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontSize: "32px" }}>🏛️</div>
          <div>
            <h3 style={{ margin: 0 }}>Generación de Libro IVA Digital Oficial (ARCA / AFIP)</h3>
            <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
              Archivos planos .TXT con diseño de registro según RG 4597/2019 listos para importar al portal de AFIP.
            </p>
          </div>
        </div>

        <div className="grid-3" style={{ gap: 14, alignItems: "flex-end", maxWidth: "600px" }}>
          <label>
            Año Fiscal:
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}>
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </label>

          <label>
            Mes Fiscal:
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}>
              {months.map((m) => (
                <option key={m.num} value={m.num}>
                  {String(m.num).padStart(2, "0")} - {m.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row" style={{ gap: 12, marginTop: 18 }}>
          <button
            type="button"
            className="btn"
            onClick={() => window.open(`/api/v1/accounting/reports/iva-digital-sales?year=${selectedYear}&month=${selectedMonth}`, "_blank")}
          >
            📥 Descargar IVA Digital Ventas (.TXT)
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => window.open(`/api/v1/accounting/reports/iva-digital-purchases?year=${selectedYear}&month=${selectedMonth}`, "_blank")}
          >
            📥 Descargar IVA Digital Compras (.TXT)
          </button>
        </div>
      </div>

      {/* Fiscal Year Periods Locking Table */}
      <div className="card pad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0 }}>🔒 Candado Fiscal & Cierre de Períodos Mensuales (Año {selectedYear})</h3>
            <p className="muted" style={{ margin: 0, fontSize: "13px" }}>
              Al bloquear un período, el sistema impide agregar o alterar comprobantes y asientos de dicho mes.
            </p>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th>Estado del Período</th>
                <th>Fecha de Cierre</th>
                <th>Auditor / Responsable</th>
                <th style={{ textAlign: "right" }}>Acción de Bloqueo</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const p = periods.find((x) => x.year === selectedYear && x.month === m.num);
                const isLocked = p?.status === "Locked";

                return (
                  <tr key={m.num}>
                    <td>
                      <strong>{m.name} {selectedYear}</strong> ({String(m.num).padStart(2, "0")}/{selectedYear})
                    </td>
                    <td>
                      <span className={`badge ${isLocked ? "prio-high" : "ok"}`}>
                        {isLocked ? "🔒 CERRADO / BLOQUEADO" : "🟢 ABIERTO"}
                      </span>
                    </td>
                    <td>{p?.lockedAtUtc ? new Date(p.lockedAtUtc).toLocaleString("es-AR") : "-"}</td>
                    <td>{p?.lockedBy || "-"}</td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className={`btn ${isLocked ? "ghost" : ""}`}
                        style={{ fontSize: "12px", padding: "4px 10px" }}
                        onClick={() => handleToggleLock(selectedYear, m.num, isLocked)}
                      >
                        {isLocked ? "🔓 Reabrir Mes" : "🔒 Cerrar con Candado"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
