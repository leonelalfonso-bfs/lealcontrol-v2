import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport } from "../../api/types";

export function CalibrationReportsPage() {
  const [reports, setReports] = useState<CalibrationReport[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReports = () => {
    setLoading(true);
    api.listCalibrationReports()
      .then(setReports)
      .catch((err) => console.error("Error al cargar informes:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
  }, []);

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Certificación & Ensayos Técnicos
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            📋 Certificados e Informes de Calibración
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Historial de ensayos de repetibilidad, excentricidad, linealidad e incertidumbre expandida
          </p>
        </div>

        <Link to="/metrologia/ensayos/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
          ➕ Cargar Nuevo Ensayo
        </Link>
      </div>

      <div className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando informes y certificados...</div>
        ) : reports.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No hay informes de calibración registrados aún.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº Certificado</th>
                  <th>Fecha de Calibración</th>
                  <th>Instrumento</th>
                  <th>Cliente</th>
                  <th>Normativa Aplicada</th>
                  <th>Metrólogo Autorizado</th>
                  <th>Incertidumbre U</th>
                  <th>Dictamen</th>
                  <th>Próxima Calibración</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong style={{ color: "#0d9488" }}>{r.reportNumber}</strong>
                      <div className="muted" style={{ fontSize: "0.74rem" }}>{r.certificateType}</div>
                    </td>
                    <td>{new Date(r.calibrationDate).toLocaleDateString("es-AR")}</td>
                    <td>
                      <strong>{r.equipmentCode}</strong>
                      <div className="muted" style={{ fontSize: "0.76rem" }}>{r.equipmentDescription}</div>
                    </td>
                    <td>
                      <div>{r.customerName || "—"}</div>
                      <div className="muted" style={{ fontSize: "0.74rem" }}>{r.location || "—"}</div>
                    </td>
                    <td><span className="tag">{r.normativeApplied}</span></td>
                    <td>{r.performedBy}</td>
                    <td>
                      <span style={{ fontFamily: "monospace", fontSize: "0.84rem" }}>
                        ±{r.expandedUncertainty}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.result === "Apto" ? "ok" : r.result === "No Apto" ? "prio-high" : "warn"}`}>
                        {r.result}
                      </span>
                    </td>
                    <td>
                      {r.nextCalibrationDate ? new Date(r.nextCalibrationDate).toLocaleDateString("es-AR") : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link to={`/metrologia/informes/${r.id}/imprimir`} className="btn ghost compact" target="_blank" title="Imprimir Certificado">
                        🖨️ Imprimir
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
