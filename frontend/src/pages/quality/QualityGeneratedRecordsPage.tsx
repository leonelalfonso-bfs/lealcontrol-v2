import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

export function QualityPg01R01Page() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [title, setTitle] = useState("PG01-R01");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getQualityDocumentListPg01R01()
      .then((res) => {
        setTitle(`${res.code} · ${res.title}`);
        setRows(res.rows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const exportExcel = () => {
    const columns: ExcelColumn<Record<string, unknown>>[] = [
      { key: "codigo", header: "Código" },
      { key: "nombre", header: "Nombre" },
      { key: "tipo", header: "Tipo" },
      { key: "versionActual", header: "Versión" },
      { key: "fechaAprobacion", header: "Aprobación", value: (r) => (r.fechaAprobacion ? excelDate(r.fechaAprobacion) : "") },
      { key: "fechaRevision", header: "Próxima revisión", value: (r) => (r.fechaRevision ? excelDate(r.fechaRevision) : "") },
      { key: "estado", header: "Estado" }
    ];
    void exportToExcel("PG01-R01_lista_documentos", rows, columns);
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <Link to="/calidad/documentos">← Documentos</Link>
          <h1 style={{ marginTop: 8 }}>{title}</h1>
          <p style={{ color: "#64748b" }}>Registro generado automáticamente desde el árbol documental (PG01).</p>
        </div>
        <button type="button" className="btn btn-outline" disabled={rows.length === 0} onClick={exportExcel}>
          Exportar Excel
        </button>
      </div>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      <div className="table-wrap card pad" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Versión</th>
              <th>Aprobación</th>
              <th>Próxima revisión</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{String(r.codigo ?? "")}</td>
                <td>{String(r.nombre ?? "")}</td>
                <td>{String(r.tipo ?? "")}</td>
                <td>{r.versionActual != null ? String(r.versionActual) : "—"}</td>
                <td>{r.fechaAprobacion ? new Date(String(r.fechaAprobacion)).toLocaleDateString("es-AR") : "—"}</td>
                <td>{r.fechaRevision ? new Date(String(r.fechaRevision)).toLocaleDateString("es-AR") : "—"}</td>
                <td>{String(r.estado ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function QualityPg01R02Page() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [title, setTitle] = useState("PG01-R02");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getQualityDocumentListPg01R02()
      .then((res) => {
        setTitle(`${res.code} · ${res.title}`);
        setRows(res.rows);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const exportExcel = () => {
    const columns: ExcelColumn<Record<string, unknown>>[] = [
      { key: "nombre", header: "Nombre" },
      { key: "organismo", header: "Organismo" },
      { key: "url", header: "URL" },
      { key: "proximaRevision", header: "Próxima revisión", value: (r) => (r.proximaRevision ? excelDate(r.proximaRevision) : "") },
      { key: "estado", header: "Estado" }
    ];
    void exportToExcel("PG01-R02_documentos_externos", rows, columns);
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <Link to="/calidad/documentos">← Documentos</Link>
          <h1 style={{ marginTop: 8 }}>{title}</h1>
        </div>
        <button type="button" className="btn btn-outline" disabled={rows.length === 0} onClick={exportExcel}>
          Exportar Excel
        </button>
      </div>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      <div className="table-wrap card pad" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Organismo</th>
              <th>URL</th>
              <th>Próxima revisión</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td>{String(r.nombre ?? "")}</td>
                <td>{String(r.organismo ?? "—")}</td>
                <td>{r.url ? <a href={String(r.url)} target="_blank" rel="noreferrer">fuente</a> : "—"}</td>
                <td>{r.proximaRevision ? new Date(String(r.proximaRevision)).toLocaleDateString("es-AR") : "—"}</td>
                <td>{String(r.estado ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
