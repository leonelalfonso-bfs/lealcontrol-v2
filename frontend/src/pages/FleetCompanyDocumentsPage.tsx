import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type CompanyDocument, type CompanyDocumentWrite } from "../api/client";
import { FleetAttachment } from "../components/fleet/FleetAttachment";

const CATEGORIES: Record<string, string> = {
  Art: "ART – certificado de cobertura", LifeInsurance: "Seguro de vida obligatorio", Liability: "Seguro de responsabilidad civil",
  WorkProcedure: "Procedimiento de trabajo", Training: "Capacitación", SafetyProgram: "Programa de seguridad / higiene", Other: "Otro"
};
const STATE: Record<CompanyDocument["state"], { text: string; color: string }> = {
  Ok: { text: "Vigente", color: "#2E6B1F" }, DueSoon: { text: "Por vencer", color: "#9A5B00" }, Expired: { text: "Vencido", color: "#A1271B" }, Missing: { text: "—", color: "#64748b" }
};
const day = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "Sin vencimiento");
const EMPTY: CompanyDocumentWrite = { category: "Art", title: "", number: "", issuer: "", issueDate: "", expirationDate: "", alertDaysBefore: 30 };

/** Documentación de la empresa que piden los clientes para el ingreso a planta, con sus vencimientos y el archivo escaneado. */
export function FleetCompanyDocumentsPage() {
  const [docs, setDocs] = useState<CompanyDocument[]>([]);
  const [history, setHistory] = useState(false);
  const [form, setForm] = useState<CompanyDocumentWrite | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api.listCompanyDocuments(history).then(setDocs).catch((err) => setError(err.message));
  useEffect(() => { void load(); }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <div>
          <h1>🏢 Documentación de la empresa</h1>
          <p className="muted">ART, seguro de vida obligatorio, responsabilidad civil, procedimientos de trabajo y capacitaciones: con vencimiento, aviso y archivo, para el legajo de ingreso a planta.</p>
        </div>
        <div className="toolbar">
          <Link to="/flota/legajo" className="btn btn-outline">📦 Legajo para ingreso a planta</Link>
          <button type="button" className="btn" onClick={() => { setEditingId(null); setForm({ ...EMPTY }); }}>＋ Documento</button>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      {form && (
        <form className="card pad stack" style={{ gap: 10 }} onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          api.saveCompanyDocument(editingId, { ...form, issueDate: form.issueDate || null, expirationDate: form.expirationDate || null })
            .then(() => { setForm(null); setEditingId(null); return load(); }).catch((err) => setError(err.message));
        }}>
          <h3 style={{ margin: 0 }}>{editingId ? "Editar documento" : "Nuevo documento"}</h3>
          <div className="grid-3">
            <label>Tipo
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>Título{["WorkProcedure", "Training", "Other"].includes(form.category) ? " *" : ""}<input value={form.title ?? ""} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej.: Trabajo en altura" /></label>
            <label>Número / póliza<input value={form.number ?? ""} onChange={(e) => setForm({ ...form, number: e.target.value })} /></label>
            <label>Emisor (aseguradora, ART…)<input value={form.issuer ?? ""} onChange={(e) => setForm({ ...form, issuer: e.target.value })} /></label>
            <label>Emitido el<input type="date" value={form.issueDate ?? ""} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></label>
            <label>Vence el (vacío si no vence)<input type="date" value={form.expirationDate ?? ""} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} /></label>
            <label>Avisar con (días)<input type="number" min={0} max={365} value={form.alertDaysBefore} onChange={(e) => setForm({ ...form, alertDaysBefore: Number(e.target.value) })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="submit" className="btn">Guardar</button>
            <button type="button" className="btn btn-outline" onClick={() => { setForm(null); setEditingId(null); }}>Cancelar</button>
          </div>
          {!editingId && <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>Después de guardar, subí el archivo con “📎 Subir”.</p>}
        </form>
      )}

      <div className="card pad stack" style={{ gap: 8 }}>
        <label className="row" style={{ gap: 6, alignItems: "center", fontWeight: 500 }}>
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} /> Ver también los archivados
        </label>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Documento</th><th>Número</th><th>Emisor</th><th>Vence</th><th>Estado</th><th>Archivo</th><th style={{ textAlign: "right" }}>Acciones</th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} style={d.isActive ? undefined : { opacity: 0.55 }}>
                  <td>{d.title || d.categoryLabel}{d.title && <div className="muted" style={{ fontSize: "0.78rem" }}>{d.categoryLabel}</div>}</td>
                  <td>{d.number || "—"}</td>
                  <td>{d.issuer || "—"}</td>
                  <td>{day(d.expirationDate)}</td>
                  <td style={{ color: STATE[d.state].color, fontWeight: 700 }}>{d.isActive ? (d.expirationDate ? STATE[d.state].text : "Vigente") : "Archivado"}</td>
                  <td><FleetAttachment kind="company-documents" id={d.id} fileName={d.fileName} onChanged={() => void load()} /></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" className="btn btn-outline compact" onClick={() => {
                      setEditingId(d.id);
                      setForm({ category: d.category, title: d.title, number: d.number, issuer: d.issuer ?? "", issueDate: d.issueDate ?? "", expirationDate: d.expirationDate ?? "", alertDaysBefore: d.alertDaysBefore });
                    }}>Editar</button>{" "}
                    <button type="button" className="btn btn-outline compact" onClick={() => void api.archiveCompanyDocument(d.id).then(load)}>{d.isActive ? "Archivar" : "Reactivar"}</button>
                  </td>
                </tr>
              ))}
              {docs.length === 0 && <tr><td colSpan={7} className="muted">Todavía no hay documentos cargados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
