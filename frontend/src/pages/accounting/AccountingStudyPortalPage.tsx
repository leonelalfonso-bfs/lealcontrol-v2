import React, { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";

export function AccountingStudyPortalPage() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Year End Closing Assistant State
  const [closingYear, setClosingYear] = useState(new Date().getFullYear());
  const [closingDate, setClosingDate] = useState(`${new Date().getFullYear()}-12-31`);
  const [closingLoading, setClosingLoading] = useState(false);

  // Payroll Devengamiento Assistant State
  const [payrollDate, setPayrollDate] = useState(new Date().toISOString().split("T")[0]);
  const [payrollPeriod, setPayrollPeriod] = useState("Agosto 2026");
  const [grossSalaries, setGrossSalaries] = useState<number>(10000000);
  const [employerContrib, setEmployerContrib] = useState<number>(2400000);
  const [netSalaries, setNetSalaries] = useState<number>(8300000);
  const [socialSecurityToPay, setSocialSecurityToPay] = useState<number>(4100000);
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("");
  const [payrollLoading, setPayrollLoading] = useState(false);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      api.listFiscalPeriods(),
      api.listCostCenters()
    ])
      .then(([pers, ccs]) => {
        setPeriods(pers);
        setCostCenters(ccs);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
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
      loadData();
    } catch (err: any) {
      setError(err?.message || "Error al actualizar estado del período.");
    }
  };

  const handleRunYearEndClosing = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm(`¿Confirmás la ejecución del Cierre Anual y Refundición de Resultados para el Ejercicio ${closingYear}? Se generará el asiento de cierre correspondiente.`)) return;

    try {
      setClosingLoading(true);
      setError(null);
      const res = await api.runYearEndClosing({
        year: closingYear,
        closingDate: closingDate ? new Date(closingDate).toISOString() : undefined
      });
      setMsg(`✓ ${res.message} (Asiento Nº ${res.entryNumber} con ${res.linesCount} líneas procesadas).`);
    } catch (err: any) {
      setError(err?.message || "Error al ejecutar el cierre anual.");
    } finally {
      setClosingLoading(false);
    }
  };

  const handleAutoPostPayroll = async (e: FormEvent) => {
    e.preventDefault();
    const totalDebe = grossSalaries + employerContrib;
    const totalHaber = netSalaries + socialSecurityToPay;

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      setError(`El asiento de sueldos está desbalanceado: Total Debe ($${totalDebe.toLocaleString()}) != Total Haber ($${totalHaber.toLocaleString()}). Verificá que Brutos + Contribuciones sea igual a Netos + F.931.`);
      return;
    }

    try {
      setPayrollLoading(true);
      setError(null);
      const res = await api.autoPostPayroll({
        date: new Date(payrollDate).toISOString(),
        periodDescription: payrollPeriod,
        totalGrossSalaries: grossSalaries,
        totalEmployerContributions: employerContrib,
        totalNetSalaries: netSalaries,
        totalSocialSecurityToPay: socialSecurityToPay,
        costCenterId: selectedCostCenter || undefined
      });
      setMsg(`✓ ${res.message} (Asiento Nº ${res.entryNumber} registrado en el Libro Diario).`);
    } catch (err: any) {
      setError(err?.message || "Error al registrar asiento de sueldos.");
    } finally {
      setPayrollLoading(false);
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
          <p className="muted">Bloqueo de meses auditados, Asistente de Cierre Anual, Asiento de Sueldos y exportación oficial de Libro IVA Digital para ARCA</p>
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
        <Link to="/contabilidad/conciliacion" className="tab-btn">
          🏦 Conciliación Bancaria
        </Link>
        <Link to="/contabilidad/portal-estudio" className="tab-btn active">
          🏢 Cierres & IVA Digital (ARCA)
        </Link>
      </div>

      {msg && <div className="alert ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      {/* 2 Column Operations Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
        {/* Asistente 1: Cierre Anual & Refundición */}
        <div className="card pad" style={{ border: "1px solid #9333ea", background: "rgba(147, 51, 234, 0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: "28px" }}>🏛️</div>
            <div>
              <h3 style={{ margin: 0, color: "#581c87" }}>Asistente de Cierre Anual & Refundición</h3>
              <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
                Cancela cuentas de ingresos y egresos (4 y 5) contra Resultado del Ejercicio.
              </p>
            </div>
          </div>

          <form onSubmit={handleRunYearEndClosing} className="stack" style={{ gap: 12 }}>
            <div className="grid-2" style={{ gap: 10 }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Año Fiscal a Cerrar:
                <select value={closingYear} onChange={(e) => setClosingYear(Number(e.target.value))}>
                  <option value={2026}>2026</option>
                  <option value={2025}>2025</option>
                  <option value={2024}>2024</option>
                </select>
              </label>

              <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                Fecha del Asiento:
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  required
                />
              </label>
            </div>

            <button
              type="submit"
              className="btn"
              disabled={closingLoading}
              style={{ background: "#9333ea", color: "#fff", fontWeight: 700, marginTop: 4 }}
            >
              {closingLoading ? "Ejecutando Cierre..." : "⚡ Ejecutar Asiento de Refundición de Resultados"}
            </button>
          </form>
        </div>

        {/* Asistente 2: Devengamiento de Sueldos F.931 */}
        <div className="card pad" style={{ border: "1px solid #0d9488", background: "rgba(13, 148, 136, 0.02)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: "28px" }}>👥</div>
            <div>
              <h3 style={{ margin: 0, color: "#0f766e" }}>Asiento de Devengamiento de Sueldos</h3>
              <p className="muted" style={{ margin: 0, fontSize: "12px" }}>
                Registra el devengamiento mensual de haberes y aportes patronales F.931.
              </p>
            </div>
          </div>

          <form onSubmit={handleAutoPostPayroll} className="stack" style={{ gap: 10 }}>
            <div className="grid-2" style={{ gap: 10 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Período:
                <input value={payrollPeriod} onChange={(e) => setPayrollPeriod(e.target.value)} placeholder="Ej. Agosto 2026" required />
              </label>

              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Fecha Contable:
                <input type="date" value={payrollDate} onChange={(e) => setPayrollDate(e.target.value)} required />
              </label>
            </div>

            <div className="grid-2" style={{ gap: 10 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Sueldos Brutos ($):
                <input type="number" min="0" step="0.01" value={grossSalaries} onChange={(e) => setGrossSalaries(parseFloat(e.target.value) || 0)} required />
              </label>

              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Contribuciones Patronales ($):
                <input type="number" min="0" step="0.01" value={employerContrib} onChange={(e) => setEmployerContrib(parseFloat(e.target.value) || 0)} required />
              </label>
            </div>

            <div className="grid-2" style={{ gap: 10 }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                Netos a Pagar ($):
                <input type="number" min="0" step="0.01" value={netSalaries} onChange={(e) => setNetSalaries(parseFloat(e.target.value) || 0)} required />
              </label>

              <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                F.931 a Pagar ($):
                <input type="number" min="0" step="0.01" value={socialSecurityToPay} onChange={(e) => setSocialSecurityToPay(parseFloat(e.target.value) || 0)} required />
              </label>
            </div>

            <button
              type="submit"
              className="btn"
              disabled={payrollLoading}
              style={{ background: "#0d9488", color: "#fff", fontWeight: 700, marginTop: 4 }}
            >
              {payrollLoading ? "Registrando..." : "📝 Contabilizar Asiento de Sueldos y F.931"}
            </button>
          </form>
        </div>
      </div>

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
