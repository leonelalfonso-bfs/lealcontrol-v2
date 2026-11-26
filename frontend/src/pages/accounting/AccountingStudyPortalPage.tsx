import React, { useEffect, useState, FormEvent } from "react";
import { AccountingTabs } from "../../components/accounting/AccountingTabs";
import { FxRevaluationCard } from "../../components/accounting/FxRevaluationCard";
import { FiscalYearsCard } from "../../components/accounting/FiscalYearsCard";
import { InventoryValuationCard } from "../../components/accounting/InventoryValuationCard";
import { api } from "../../api/client";

import { todayAr } from "../../lib/dates";
export function AccountingStudyPortalPage() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Payroll Devengamiento Assistant State
  const [payrollDate, setPayrollDate] = useState(todayAr());
  const [payrollPeriod, setPayrollPeriod] = useState("");
  const [grossSalaries, setGrossSalaries] = useState<number>(0);
  const [employerContrib, setEmployerContrib] = useState<number>(0);
  const [netSalaries, setNetSalaries] = useState<number>(0);
  const [socialSecurityToPay, setSocialSecurityToPay] = useState<number>(0);
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
        lock: !currentLocked
      });
      const monthStr = String(month).padStart(2, "0");
      setMsg(`✓ Período ${monthStr}/${year} ${!currentLocked ? "CERRADO y BLOQUEADO con candado fiscal" : "REABIERTO para ajustes"}.`);
      loadData();
    } catch (err: any) {
      setError(err?.message || "Error al actualizar estado del período.");
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
          <p className="muted">Bloqueo de meses auditados, asistente de cierre anual y asiento de sueldos</p>
        </div>
      </div>

      <AccountingTabs />

      {msg && <div className="alert ok">{msg}</div>}
      {error && <div className="alert">{error}</div>}

      {/* 2 Column Operations Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))", gap: 20 }}>
        <FiscalYearsCard onChanged={loadData} />

        <FxRevaluationCard />

        <InventoryValuationCard />

        {/* Asistente 2: Devengamiento de Sueldos F.931 */}
        <div className="card pad">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: "28px" }}>👥</div>
            <div>
              <h3 style={{ margin: 0 }}>Asiento de Devengamiento de Sueldos</h3>
              <p className="muted t-small" style={{ margin: 0 }}>
                Registra el devengamiento mensual de haberes y aportes patronales F.931.
              </p>
            </div>
          </div>

          <form onSubmit={handleAutoPostPayroll} className="stack" style={{ gap: 10 }}>
            <div className="grid-2" style={{ gap: 10 }}>
              <label>
                Período:
                <input value={payrollPeriod} onChange={(e) => setPayrollPeriod(e.target.value)} placeholder="Ej. Agosto 2026" required />
              </label>

              <label>
                Fecha Contable:
                <input type="date" value={payrollDate} onChange={(e) => setPayrollDate(e.target.value)} required />
              </label>
            </div>

            <div className="grid-2" style={{ gap: 10 }}>
              <label>
                Sueldos Brutos ($):
                <input type="number" min="0" step="0.01" value={grossSalaries} onChange={(e) => setGrossSalaries(parseFloat(e.target.value) || 0)} required />
              </label>

              <label>
                Contribuciones Patronales ($):
                <input type="number" min="0" step="0.01" value={employerContrib} onChange={(e) => setEmployerContrib(parseFloat(e.target.value) || 0)} required />
              </label>
            </div>

            <div className="grid-2" style={{ gap: 10 }}>
              <label>
                Netos a Pagar ($):
                <input type="number" min="0" step="0.01" value={netSalaries} onChange={(e) => setNetSalaries(parseFloat(e.target.value) || 0)} required />
              </label>

              <label>
                F.931 a Pagar ($):
                <input type="number" min="0" step="0.01" value={socialSecurityToPay} onChange={(e) => setSocialSecurityToPay(parseFloat(e.target.value) || 0)} required />
              </label>
            </div>

            <button
              type="submit"
              className="btn"
              disabled={payrollLoading}
              style={{ marginTop: 4 }}
            >
              {payrollLoading ? "Registrando..." : "📝 Contabilizar Asiento de Sueldos y F.931"}
            </button>
          </form>
        </div>
      </div>

      {/* Fiscal Year Periods Locking Table */}
      <div className="card pad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              🔒 Candado Fiscal & Cierre de Períodos Mensuales
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))} style={{ width: "auto" }}>
                {[0, 1, 2].map((back) => {
                  const y = new Date().getFullYear() - back;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
            </h3>
            <p className="muted t-small" style={{ margin: 0 }}>
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
                <th className="t-right">Acción de Bloqueo</th>
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
                    <td className="t-right">
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
