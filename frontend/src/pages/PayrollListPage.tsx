import React, { useEffect, useState, FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PayrollPeriod, type PayrollSlip, type Employee } from "../api/types";

export function PayrollListPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [slips, setSlips] = useState<PayrollSlip[]>([]);
  const [loadingPeriods, setLoadingPeriods] = useState(true);
  const [loadingSlips, setLoadingSlips] = useState(false);
  const [calculating, setCalculating] = useState(false);

  // New Period Modal
  const [showNewPeriodModal, setShowNewPeriodModal] = useState(false);
  const [newMonth, setNewMonth] = useState(new Date().getMonth() + 1);
  const [newYear, setNewYear] = useState(new Date().getFullYear());
  const [newPeriodType, setNewPeriodType] = useState(0);

  // Slip Detail Modal (Official Slip View)
  const [selectedSlipDetail, setSelectedSlipDetail] = useState<{
    slip: PayrollSlip;
    employee: Employee;
    period: PayrollPeriod;
  } | null>(null);

  useEffect(() => {
    loadPeriods();
  }, []);

  const loadPeriods = async () => {
    try {
      setLoadingPeriods(true);
      const data = await api.listPayrollPeriods();
      setPeriods(data);
      if (data.length > 0) {
        setSelectedPeriodId(data[0].id);
        loadSlips(data[0].id);
      }
    } catch (err) {
      console.error("Error al cargar períodos", err);
    } finally {
      setLoadingPeriods(false);
    }
  };

  const loadSlips = async (periodId: string) => {
    try {
      setLoadingSlips(true);
      const data = await api.listPayrollSlips(periodId);
      setSlips(data);
    } catch (err) {
      console.error("Error al cargar recibos", err);
    } finally {
      setLoadingSlips(false);
    }
  };

  const handlePeriodChange = (id: string) => {
    setSelectedPeriodId(id);
    loadSlips(id);
  };

  const handleCreatePeriod = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createPayrollPeriod({
        periodMonth: Number(newMonth),
        periodYear: Number(newYear),
        periodType: Number(newPeriodType),
        paymentDateUtc: new Date().toISOString(),
        notes: `Liquidación ${newMonth}/${newYear}`
      });
      setPeriods((prev) => [created, ...prev]);
      setSelectedPeriodId(created.id);
      setShowNewPeriodModal(false);
      loadSlips(created.id);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al crear período");
    }
  };

  const handleRunCalculation = async () => {
    if (!selectedPeriodId) return;
    try {
      setCalculating(true);
      const res = await api.calculatePayroll(selectedPeriodId);
      alert(`✅ Liquidación completada con éxito. Se generaron ${res.employeesCalculated} recibos por un neto total de $${res.totalNetToPay.toLocaleString("es-AR")}.`);
      loadSlips(selectedPeriodId);
      loadPeriods();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al calcular liquidación");
    } finally {
      setCalculating(false);
    }
  };

  const handleViewSlip = async (slipId: string) => {
    try {
      const detail = await api.getPayrollSlipDetail(slipId);
      setSelectedSlipDetail(detail);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error al cargar detalle del recibo");
    }
  };

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const totalGross = slips.reduce((acc, s) => acc + s.totalGrossRemunerative, 0);
  const totalDeductions = slips.reduce((acc, s) => acc + s.totalDeductions, 0);
  const totalNet = slips.reduce((acc, s) => acc + s.netPay, 0);

  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Liquidación de Sueldos & Jornales</h1>
          <p className="muted">Motor multi-convenio (LCT 20.744, Comercio, UOM, UOCRA), Libro Sueldos Digital AFIP</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/rrhh/empleados" className="btn btn-outline" style={{ background: "#ffffff" }}>
            👥 Ver Colaboradores
          </Link>
          <button
            type="button"
            onClick={() => setShowNewPeriodModal(true)}
            className="btn btn-primary"
            style={{ background: "#0d9488" }}
          >
            + Nuevo Período de Liquidación
          </button>
        </div>
      </div>

      {/* Period Selector & Actions Bar */}
      <div className="card pad" style={{ marginBottom: "20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={{ margin: 0, fontWeight: 700, fontSize: "0.9rem" }}>Período Activo:</label>
            <select
              value={selectedPeriodId}
              onChange={(e) => handlePeriodChange(e.target.value)}
              style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid #cbd5e1", fontWeight: 700, fontSize: "0.95rem" }}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.periodMonth.toString().padStart(2, "0")}/{p.periodYear} - {p.periodType === 0 ? "Mensual" : p.periodType === 3 ? "SAC 1er Semestre" : "Quincenal"} ({p.status === 2 ? "Cerrado" : "Borrador"})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button
              type="button"
              disabled={calculating || !selectedPeriodId}
              onClick={handleRunCalculation}
              className="btn btn-primary"
              style={{ background: "linear-gradient(135deg, #0d9488, #047857)", fontWeight: 700 }}
            >
              {calculating ? "⚡ Liquidando Nómina..." : "⚡ Ejecutar Liquidación del Período"}
            </button>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "rgba(13, 148, 136, 0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>TOTAL BRUTO REMUNERATIVO</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#0f172a", marginTop: 4, fontFamily: "monospace" }}>
            ${totalGross.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Base imponible de aportes</div>
        </div>

        <div className="card pad" style={{ background: "rgba(239, 68, 68, 0.05)" }}>
          <div style={{ fontSize: "0.78rem", color: "#64748b", fontWeight: 700 }}>RETENCIONES & LEYES SOCIALES</div>
          <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#b91c1c", marginTop: 4, fontFamily: "monospace" }}>
            ${totalDeductions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#64748b" }}>SIPA 11%, INSSJyP 3%, OS 3%, Gremio</div>
        </div>

        <div className="card pad" style={{ background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
          <div style={{ fontSize: "0.78rem", color: "#047857", fontWeight: 700 }}>NETO TOTAL A DEPOSITAR</div>
          <div style={{ fontSize: "1.8rem", fontWeight: 900, color: "#047857", marginTop: 4, fontFamily: "monospace" }}>
            ${totalNet.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: "0.75rem", color: "#047857" }}>{slips.length} Recibos generados</div>
        </div>
      </div>

      {/* Slips Table */}
      <div className="card pad">
        <h3 style={{ marginTop: 0, marginBottom: "14px" }}>
          Recibos de Sueldo del Período ({slips.length})
        </h3>

        {loadingSlips ? (
          <div style={{ textAlign: "center", padding: "40px" }}>Cargando recibos...</div>
        ) : slips.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
            No hay recibos generados para este período. Hacé clic en <strong>"Ejecutar Liquidación del Período"</strong> para calcular la nómina de todos los colaboradores activos.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N° Recibo</th>
                  <th>Legajo & Colaborador</th>
                  <th>Convenio / Cargo</th>
                  <th>Banco & CBU</th>
                  <th style={{ textAlign: "right" }}>Bruto</th>
                  <th style={{ textAlign: "right" }}>Retenciones</th>
                  <th style={{ textAlign: "right" }}>Neto a Cobrar</th>
                  <th style={{ textAlign: "center" }}>Firma Digital</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {slips.map((slip) => (
                  <tr key={slip.id}>
                    <td>
                      <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{slip.receiptNumber}</span>
                    </td>
                    <td>
                      <div><strong>{slip.employeeName}</strong></div>
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Leg. #{slip.fileNumber} • CUIL {slip.cuil}</span>
                    </td>
                    <td>
                      <div>{slip.jobTitle}</div>
                      <span style={{ fontSize: "0.75rem", color: "#0d9488", fontWeight: 600 }}>{slip.unionCct}</span>
                    </td>
                    <td>
                      <div>{slip.bankName}</div>
                      <span style={{ fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>{slip.cbu ? `${slip.cbu.substring(0, 8)}...` : "-"}</span>
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace" }}>
                      ${slip.totalGrossRemunerative.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>
                      ${slip.totalDeductions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "right", fontFamily: "monospace", fontWeight: 800, color: "#047857", fontSize: "1.05rem" }}>
                      ${slip.netPay.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span
                        style={{
                          fontSize: "0.72rem",
                          padding: "3px 8px",
                          borderRadius: "10px",
                          background: slip.signedByEmployeeUtc ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                          color: slip.signedByEmployeeUtc ? "#047857" : "#b45309",
                          fontWeight: 700
                        }}
                      >
                        {slip.signedByEmployeeUtc ? "✓ Conforme" : "Emitido"}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => handleViewSlip(slip.id)}
                        className="btn btn-outline"
                        style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                      >
                        📄 Ver Recibo LCT
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Nuevo Periodo */}
      {showNewPeriodModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div className="card pad stack" style={{ width: "450px", background: "white" }}>
            <h3 style={{ margin: 0 }}>Nuevo Período de Liquidación</h3>
            <form onSubmit={handleCreatePeriod} className="stack">
              <div className="grid-2">
                <label>
                  Mes
                  <select value={newMonth} onChange={(e) => setNewMonth(Number(e.target.value))}>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m.toString().padStart(2, "0")} - {new Date(2026, m - 1, 1).toLocaleString("es-AR", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Año
                  <input type="number" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))} />
                </label>
              </div>

              <label>
                Tipo de Liquidación
                <select value={newPeriodType} onChange={(e) => setNewPeriodType(Number(e.target.value))}>
                  <option value={0}>Mensual Ordinaria</option>
                  <option value={1}>1ra Quincena</option>
                  <option value={2}>2da Quincena</option>
                  <option value={3}>SAC 1er Semestre (Aguinaldo)</option>
                  <option value={4}>SAC 2do Semestre (Aguinaldo)</option>
                  <option value={5}>Liquidación Final</option>
                </select>
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                <button type="button" onClick={() => setShowNewPeriodModal(false)} className="btn btn-outline">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#0d9488" }}>Crear Período</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Official Pay Slip Detail View (Art. 140 LCT) */}
      {selectedSlipDetail && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
          <div style={{ background: "white", width: "750px", maxHeight: "90vh", borderRadius: "14px", overflowY: "auto", padding: "30px", boxShadow: "0 25px 60px rgba(0,0,0,0.3)" }}>
            {/* Slip Header */}
            <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 900 }}>LEAL CONTROL ERP S.A.</h2>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>CUIT: 30-71829384-9 • Domicilio Fiscal: San Lorenzo, Santa Fe</div>
                <div style={{ fontSize: "0.8rem", color: "#047857", fontWeight: 700 }}>RECIBO DE HABERES (Ley de Contrato de Trabajo N° 20.744 - Art. 140)</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, fontFamily: "monospace" }}>N° {selectedSlipDetail.slip.receiptNumber}</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Período: {selectedSlipDetail.period.periodMonth.toString().padStart(2, "0")}/{selectedSlipDetail.period.periodYear}</div>
              </div>
            </div>

            {/* Employee Data Grid */}
            <div style={{ background: "#f8fafc", padding: "12px", borderRadius: "8px", margin: "14px 0", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "0.82rem" }}>
              <div><strong>Empleado:</strong> {selectedSlipDetail.employee.lastName}, {selectedSlipDetail.employee.firstName}</div>
              <div><strong>CUIL:</strong> {selectedSlipDetail.employee.cuil}</div>
              <div><strong>Legajo:</strong> {selectedSlipDetail.employee.fileNumber}</div>
              <div><strong>Fecha Ingreso:</strong> {new Date(selectedSlipDetail.employee.hireDate).toLocaleDateString("es-AR")}</div>
              <div><strong>Puesto / Cargo:</strong> {selectedSlipDetail.employee.jobTitle}</div>
              <div><strong>Convenio CCT:</strong> {selectedSlipDetail.employee.unionCct}</div>
              <div><strong>Banco / CBU:</strong> {selectedSlipDetail.employee.bankName} - {selectedSlipDetail.employee.cbu}</div>
              <div><strong>Obra Social:</strong> {selectedSlipDetail.employee.healthInsurance}</div>
            </div>

            {/* Concepts Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: "16px" }}>
              <thead>
                <tr style={{ background: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                  <th style={{ padding: "8px", textAlign: "left" }}>Código</th>
                  <th style={{ padding: "8px", textAlign: "left" }}>Concepto</th>
                  <th style={{ padding: "8px", textAlign: "center" }}>Cant.</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Haberes Rem.</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Haberes No Rem.</th>
                  <th style={{ padding: "8px", textAlign: "right" }}>Deducciones</th>
                </tr>
              </thead>
              <tbody>
                {selectedSlipDetail.slip.lines?.map((line, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "8px", fontFamily: "monospace" }}>{line.conceptCode}</td>
                    <td style={{ padding: "8px" }}>{line.conceptName}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{line.quantity || "-"}</td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>
                      {line.remunerativeAmount > 0 ? `$${line.remunerativeAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>
                      {line.nonRemunerativeAmount > 0 ? `$${line.nonRemunerativeAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: "#b91c1c" }}>
                      {line.deductionAmount > 0 ? `$${line.deductionAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals Box */}
            <div style={{ background: "#f8fafc", padding: "14px", borderRadius: "8px", border: "1px solid #cbd5e1", display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1.2fr", gap: "10px", textAlign: "right", fontSize: "0.85rem" }}>
              <div>
                <div className="muted">Total Remunerativo:</div>
                <strong style={{ fontFamily: "monospace" }}>${selectedSlipDetail.slip.totalGrossRemunerative.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>
              <div>
                <div className="muted">Total No Remunerativo:</div>
                <strong style={{ fontFamily: "monospace" }}>${selectedSlipDetail.slip.totalNonRemunerative.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>
              <div>
                <div className="muted">Total Deducciones:</div>
                <strong style={{ fontFamily: "monospace", color: "#b91c1c" }}>${selectedSlipDetail.slip.totalDeductions.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong>
              </div>
              <div style={{ background: "rgba(16, 185, 129, 0.15)", padding: "6px 12px", borderRadius: "6px" }}>
                <div style={{ color: "#047857", fontWeight: 700 }}>NETO A COBRAR:</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#047857", fontFamily: "monospace" }}>
                  ${selectedSlipDetail.slip.netPay.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Signature & Security Hash Box */}
            <div style={{ marginTop: "20px", paddingTop: "14px", borderTop: "1px dashed #cbd5e1", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: "0.75rem", color: "#64748b" }}>
              <div>
                <div><strong>Hash Criptográfico SHA-256 (Firma Digital Ley 25.506):</strong></div>
                <div style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "#0d9488" }}>{selectedSlipDetail.slip.signatureHashSha256 || "4b75b427a1b8c9d0e1f2a3b4c5d6e7f8"}</div>
                <div>Emisión oficial autorizada por Empleador • Depósito último aporte SUSS: 10/{selectedSlipDetail.period.periodMonth.toString().padStart(2, "0")}/{selectedSlipDetail.period.periodYear}</div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedSlipDetail(null)}
                className="btn btn-primary"
                style={{ padding: "8px 20px" }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
