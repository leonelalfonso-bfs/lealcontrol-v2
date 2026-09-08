import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { CalibrationReport, MetrologyEquipment } from "../../api/types";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";
import {
  EQUIPMENT_STATUS,
  labelOf,
  METROLOGY_REPORT_STATUS,
  METROLOGY_VERDICT
} from "./qualityLabels";

const IT_TITLES: Record<string, string> = {
  IT01: "Balanzas de Alta Capacidad Cargas Rodantes",
  IT02: "Balanzas de Media Capacidad",
  IT03: "Balanzas de Baja Capacidad y de Venta al Público",
  IT04: "Balanzas tipo tolva"
};

type RecordKey = "r1" | "r2" | "r3";

const RECORD_META: Record<
  RecordKey,
  { codeSuffix: "R01" | "R02" | "R03"; title: string; focus: "equipment" | "reports" | "seals" }
> = {
  r1: { codeSuffix: "R01", title: "Identificación", focus: "equipment" },
  r2: { codeSuffix: "R02", title: "Ensayos", focus: "reports" },
  r3: { codeSuffix: "R03", title: "Precintos", focus: "seals" }
};

function normalizeItCode(raw?: string): string | null {
  if (!raw) return null;
  const c = raw.trim().toUpperCase();
  return IT_TITLES[c] ? c : null;
}

function normalizeRecord(raw?: string): RecordKey | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "r1" || v === "r01") return "r1";
  if (v === "r2" || v === "r02") return "r2";
  if (v === "r3" || v === "r03") return "r3";
  return null;
}

function certOf(r: CalibrationReport): string {
  return r.certificateNumber || r.reportNumber || "—";
}

function reportStatusOf(r: CalibrationReport): string {
  return (r.reportStatus || r.status || "Issued").toString();
}

function verdictLabel(r: CalibrationReport): string {
  const raw = String(r.verdict || r.result || "");
  return labelOf(METROLOGY_VERDICT, raw, raw || "—");
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR");
}

export function QualityLinkedItPage() {
  const params = useParams<{ itCode: string; record: string }>();
  const itCode = normalizeItCode(params.itCode);
  const record = normalizeRecord(params.record);

  const [equipment, setEquipment] = useState<MetrologyEquipment[]>([]);
  const [reports, setReports] = useState<CalibrationReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const meta = record ? RECORD_META[record] : null;
  const itTitle = itCode ? IT_TITLES[itCode] : "";
  const docCode = itCode && meta ? `${itCode}-${meta.codeSuffix}` : "";
  const pageTitle = itCode && meta ? `${itCode} · R${meta.codeSuffix.slice(1)} ${meta.title}` : "Registro IT";

  useEffect(() => {
    if (!itCode || !meta) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const load =
      meta.focus === "equipment"
        ? api.listMetrologyEquipment({ instructionCode: itCode }).then((rows) => {
            setEquipment(rows);
            setReports([]);
          })
        : api.listCalibrationReports({ instructionCode: itCode }).then((rows) => {
            setReports(rows);
            setEquipment([]);
          });

    load
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [itCode, meta?.focus]);

  const subtitle = useMemo(() => {
    if (!itCode || !meta) return "";
    return `${itTitle} — ${meta.title} (vinculado a Metrología)`;
  }, [itCode, itTitle, meta]);

  const exportExcel = () => {
    if (!itCode || !meta) return;
    if (meta.focus === "equipment") {
      const cols: ExcelColumn<MetrologyEquipment>[] = [
        { key: "code", header: "Código" },
        { key: "description", header: "Descripción" },
        { key: "customerName", header: "Cliente" },
        { key: "maxCapacity", header: "Capacidad" },
        { key: "unit", header: "Unidad" },
        { key: "status", header: "Estado", value: (r) => labelOf(EQUIPMENT_STATUS, r.status) },
        { key: "location", header: "Ubicación" }
      ];
      void exportToExcel(`${docCode}_identificacion`, equipment, cols);
      return;
    }
    if (meta.focus === "seals") {
      const cols: ExcelColumn<CalibrationReport>[] = [
        { key: "certificate", header: "Certificado", value: (r) => certOf(r) },
        { key: "date", header: "Fecha", value: (r) => excelDate(r.calibrationDate) },
        { key: "equipmentCode", header: "Instrumento" },
        { key: "customerName", header: "Cliente" },
        { key: "seals", header: "Precintos", value: (r) => r.sealsPlaced || "" },
        { key: "status", header: "Estado", value: (r) => labelOf(METROLOGY_REPORT_STATUS, reportStatusOf(r)) },
        { key: "verdict", header: "Dictamen", value: (r) => verdictLabel(r) }
      ];
      void exportToExcel(`${docCode}_precintos`, reports, cols);
      return;
    }
    const cols: ExcelColumn<CalibrationReport>[] = [
      { key: "certificate", header: "Certificado", value: (r) => certOf(r) },
      { key: "date", header: "Fecha", value: (r) => excelDate(r.calibrationDate) },
      { key: "equipmentCode", header: "Instrumento" },
      { key: "equipmentDescription", header: "Descripción" },
      { key: "customerName", header: "Cliente" },
      { key: "status", header: "Estado", value: (r) => labelOf(METROLOGY_REPORT_STATUS, reportStatusOf(r)) },
      { key: "verdict", header: "Dictamen", value: (r) => verdictLabel(r) },
      { key: "performedBy", header: "Técnico" }
    ];
    void exportToExcel(`${docCode}_ensayos`, reports, cols);
  };

  if (!itCode || !meta) {
    return (
      <div className="workspace-page pad">
        <p style={{ color: "#b91c1c" }}>Instructivo o registro no válido. Usá IT01–IT04 y r1/r2/r3.</p>
        <Link to="/calidad/registros">← Registros operativos</Link>
      </div>
    );
  }

  return (
    <div className="workspace-page pad">
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <Link to="/calidad/registros" style={{ fontSize: 13 }}>
            ← Registros
          </Link>
          <Link to={`/calidad/documentos/${encodeURIComponent(docCode)}`} style={{ fontSize: 13 }}>
            Árbol: {docCode}
          </Link>
        </div>
        <h1 style={{ margin: "8px 0 0" }}>{pageTitle}</h1>
        <p style={{ color: "#64748b", marginTop: 6, maxWidth: 760 }}>{subtitle}</p>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-outline" onClick={exportExcel} disabled={loading}>
          Excel
        </button>
        {meta.focus === "equipment" && (
          <Link className="btn btn-outline" to="/metrologia/equipos">
            Metrología · Equipos
          </Link>
        )}
        {(meta.focus === "reports" || meta.focus === "seals") && (
          <Link className="btn btn-outline" to="/metrologia/informes">
            Metrología · Informes
          </Link>
        )}
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {loading && <p>Cargando…</p>}

      {!loading && meta.focus === "equipment" && (
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Cliente</th>
                <th>Capacidad</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {equipment.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    Sin equipos asociados a {itCode}.
                  </td>
                </tr>
              )}
              {equipment.map((eq) => (
                <tr key={eq.id}>
                  <td>
                    <strong>{eq.code}</strong>
                  </td>
                  <td>{eq.description || "—"}</td>
                  <td>{eq.customerName || "—"}</td>
                  <td>
                    {eq.maxCapacity != null ? `${eq.maxCapacity} ${eq.unit || "kg"}` : "—"}
                  </td>
                  <td>{labelOf(EQUIPMENT_STATUS, eq.status)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn ghost compact" to={`/metrologia/equipos/${eq.id}`}>
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && meta.focus === "reports" && (
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Certificado</th>
                <th>Fecha</th>
                <th>Instrumento</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Dictamen</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Sin informes con instrucción {itCode}.
                  </td>
                </tr>
              )}
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong style={{ color: "#0d9488" }}>{certOf(r)}</strong>
                  </td>
                  <td>{fmtDate(r.calibrationDate)}</td>
                  <td>
                    <strong>{r.equipmentCode}</strong>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.equipmentDescription || "—"}
                    </div>
                  </td>
                  <td>{r.customerName || "—"}</td>
                  <td>{labelOf(METROLOGY_REPORT_STATUS, reportStatusOf(r))}</td>
                  <td>{verdictLabel(r)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn ghost compact" to={`/metrologia/informes/${r.id}/imprimir`} target="_blank">
                      Ver / Imprimir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && meta.focus === "seals" && (
        <div className="card" style={{ padding: 0, overflow: "auto" }}>
          <table className="table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Certificado</th>
                <th>Fecha</th>
                <th>Instrumento</th>
                <th>Cliente</th>
                <th>Precintos colocados</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {reports.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Sin informes con instrucción {itCode}.
                  </td>
                </tr>
              )}
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong style={{ color: "#0d9488" }}>{certOf(r)}</strong>
                  </td>
                  <td>{fmtDate(r.calibrationDate)}</td>
                  <td>{r.equipmentCode}</td>
                  <td>{r.customerName || "—"}</td>
                  <td>{r.sealsPlaced || "—"}</td>
                  <td>{labelOf(METROLOGY_REPORT_STATUS, reportStatusOf(r))}</td>
                  <td style={{ textAlign: "right" }}>
                    <Link className="btn ghost compact" to={`/metrologia/informes/${r.id}/imprimir`} target="_blank">
                      Ver / Imprimir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
