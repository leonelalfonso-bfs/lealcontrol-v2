import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import type { CalibrationReport } from "../../api/types";

function certNumberOf(r: CalibrationReport): string {
  return (r as { certificateNumber?: string }).certificateNumber || r.reportNumber || "—";
}

function statusOf(r: CalibrationReport): string {
  return (r.reportStatus || r.status || "Issued").toString();
}

function verdictOf(r: CalibrationReport): string {
  const raw = String((r as { verdict?: string }).verdict || r.result || "");
  if (raw === "Approved" || raw === "Apto") return "Apto";
  if (raw === "Rejected" || raw === "No Apto") return "No Apto";
  if (raw === "Apto con Observaciones") return "Apto con Observaciones";
  return raw || "—";
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "draft") return "warn";
  if (s === "superseded") return "prio-high";
  return "ok";
}

export function CalibrationReportsPage() {
  const { user } = useAuth();
  const [reports, setReports] = useState<CalibrationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canApprove = !!user?.isTechnicalDirector
    || user?.role === "Admin"
    || user?.role === "Administrador"
    || user?.role === "DirectorTecnico";

  const loadReports = () => {
    setLoading(true);
    api.listCalibrationReports()
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
  }, []);

  /** Mapa originalId → enmienda más reciente (no supersedida si hay varias). */
  const amendmentByOriginal = useMemo(() => {
    const map = new Map<string, CalibrationReport>();
    for (const r of reports) {
      const parentId = r.supersedesReportId;
      if (!parentId) continue;
      const prev = map.get(parentId);
      if (!prev || new Date(r.createdAtUtc) > new Date(prev.createdAtUtc)) {
        map.set(parentId, r);
      }
    }
    return map;
  }, [reports]);

  const onApprove = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await api.approveCalibrationReport(id);
      loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const onAmend = async (id: string) => {
    const reason = window.prompt(
      "Motivo de la enmienda (PG09 R2) — obligatorio:\nSe creará un borrador que sustituye el informe emitido."
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("El motivo de enmienda es obligatorio.");
      return;
    }

    setBusyId(id);
    setError(null);
    try {
      await api.amendCalibrationReport(id, { amendmentReason: reason.trim() });
      loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, textTransform: "uppercase", fontSize: "0.75rem", letterSpacing: "0.08em" }}>
            Laboratorio de Ensayos
          </span>
          <h1 style={{ margin: "2px 0 0", fontSize: "1.75rem", fontWeight: 800 }}>
            Informes de Ensayo
          </h1>
          <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
            Historial de protocolos e informes técnicos · aprobación y enmienda PG09 R2 por Director Técnico
          </p>
        </div>

        <Link to="/metrologia/ensayos/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
          Nuevo Ensayo
        </Link>
      </div>

      {error && (
        <div className="card pad" style={{ marginBottom: 12, background: "#fef2f2", color: "#991b1b" }}>{error}</div>
      )}

      <div className="card pad">
        {loading ? (
          <div className="muted" style={{ padding: 20, textAlign: "center" }}>Cargando informes de ensayo...</div>
        ) : reports.length === 0 ? (
          <div className="muted" style={{ padding: 24, textAlign: "center" }}>
            No hay informes de ensayo registrados aún.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº Informe</th>
                  <th>Fecha</th>
                  <th>Instrumento</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Técnico</th>
                  <th>DT</th>
                  <th>Dictamen</th>
                  <th style={{ textAlign: "right" }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => {
                  const status = statusOf(r);
                  const statusLower = status.toLowerCase();
                  const isDraft = statusLower === "draft";
                  const isIssued = statusLower === "issued";
                  const isSuperseded = statusLower === "superseded";
                  const amendment = amendmentByOriginal.get(r.id);
                  const isAmendment = !!r.supersedesReportId;

                  return (
                    <tr key={r.id}>
                      <td>
                        <strong style={{ color: "#0d9488" }}>{certNumberOf(r)}</strong>
                        {(r as { instructionCode?: string }).instructionCode && (
                          <div className="muted" style={{ fontSize: "0.74rem" }}>
                            {(r as { instructionCode?: string }).instructionCode}
                          </div>
                        )}
                        {isAmendment && (
                          <div className="muted" style={{ fontSize: "0.72rem", marginTop: 2 }}>
                            Enmienda PG09 R2
                            {r.supersedesReportId && (
                              <>
                                {" · "}
                                <Link to={`/metrologia/informes/${r.supersedesReportId}/imprimir`} target="_blank">
                                  ver original
                                </Link>
                              </>
                            )}
                          </div>
                        )}
                        {amendment && (
                          <div style={{ fontSize: "0.72rem", marginTop: 2 }}>
                            <Link to={`/metrologia/informes/${amendment.id}/imprimir`} target="_blank">
                              Enmienda: {certNumberOf(amendment)}
                            </Link>
                          </div>
                        )}
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
                      <td>
                        <span className={`badge ${statusBadgeClass(status)}`}>
                          {isSuperseded ? "Superseded" : status}
                        </span>
                      </td>
                      <td>{r.performedBy}</td>
                      <td>{r.approvedBy || "—"}</td>
                      <td>
                        <span className={`badge ${verdictOf(r) === "Apto" ? "ok" : verdictOf(r) === "No Apto" ? "prio-high" : "warn"}`}>
                          {verdictOf(r)}
                        </span>
                      </td>
                      <td style={{ textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        {isDraft && canApprove && (
                          <button
                            type="button"
                            className="btn compact"
                            disabled={busyId === r.id}
                            onClick={() => void onApprove(r.id)}
                            title="Aprobar como Director Técnico"
                          >
                            {busyId === r.id ? "…" : "Aprobar DT"}
                          </button>
                        )}
                        {isIssued && canApprove && (
                          <button
                            type="button"
                            className="btn ghost compact"
                            disabled={busyId === r.id}
                            onClick={() => void onAmend(r.id)}
                            title="Crear enmienda PG09 R2 (el original queda Superseded)"
                          >
                            {busyId === r.id ? "…" : "Enmendar (PG09 R2)"}
                          </button>
                        )}
                        <Link to={`/metrologia/informes/${r.id}/imprimir`} className="btn ghost compact" target="_blank" title="Imprimir / trazabilidad">
                          Ver / Imprimir
                        </Link>
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
