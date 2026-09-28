import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityInternalAudit } from "../../api/types/quality";
import { excelDate, exportToExcel, type ExcelColumn } from "../../components/ExcelTools";

const dateInput = (value?: string | null) => value?.slice(0, 10) || "";
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("es-AR") : "—";
const isoDate = (value: string) => new Date(`${value}T12:00:00Z`).toISOString();
const backups = [
  { code: "PG04-R02", label: "Plan de auditoría", key: "planFileId" },
  { code: "PG04-R03", label: "Informe de auditoría", key: "reportFileId" },
  { code: "PG04-R04", label: "Lista de verificación", key: "checklistFileId" }
] as const;
type BackupKey = typeof backups[number]["key"];

export function QualityPg04Page() {
  const currentYear = new Date().getFullYear();
  const [rows, setRows] = useState<QualityInternalAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [programYear, setProgramYear] = useState(String(currentYear));
  const [plannedDate, setPlannedDate] = useState(new Date().toISOString().slice(0, 10));
  const [scope, setScope] = useState("");
  const [criteria, setCriteria] = useState("");
  const [auditor, setAuditor] = useState("");
  const [auditee, setAuditee] = useState("");
  const [notes, setNotes] = useState("");
  const [executedDate, setExecutedDate] = useState("");
  const selected = rows.find((row) => row.id === selectedId) || null;
  const years = useMemo(() => Array.from(new Set([currentYear, ...rows.map((row) => row.programYear)]))
    .sort((a, b) => b - a), [currentYear, rows]);
  const filtered = useMemo(() => rows.filter((row) =>
    (yearFilter === "all" || String(row.programYear) === yearFilter)
    && (statusFilter === "all" || row.status === statusFilter)), [rows, yearFilter, statusFilter]);

  useEffect(() => {
    void api.listQualityPg04().then((response) => setRows(response.rows || []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { setExecutedDate(dateInput(selected?.executedDate)); }, [selected?.id, selected?.executedDate]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(null); setMessage(null);
    try {
      const created = await api.createQualityInternalAudit({
        programYear: Number(programYear), plannedDate: isoDate(plannedDate),
        scope: scope.trim(), criteria: criteria.trim(), auditor: auditor.trim(),
        auditee: auditee.trim(), notes: notes.trim()
      });
      setRows((current) => [created, ...current]);
      setSelectedId(created.id); setShowForm(false);
      setScope(""); setCriteria(""); setAuditor(""); setAuditee(""); setNotes("");
      setMessage(`${created.number} programada.`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const markDone = async () => {
    if (!selected || !executedDate) { setError("Indicá la fecha de realización."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const updated = await api.updateQualityInternalAudit(selected.id, { status: "Done", executedDate: isoDate(executedDate) });
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setMessage("Auditoría realizada. Ya podés cargar los respaldos R02, R03 y R04.");
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const uploadBackup = async (key: BackupKey, file?: File) => {
    if (!selected || !file) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const uploaded = await api.uploadQualityFile(file, "Source");
      const updated = await api.updateQualityInternalAudit(selected.id, { [key]: uploaded.id });
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setMessage(`${file.name} guardado como respaldo.`);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  };

  const exportExcel = () => {
    const columns: ExcelColumn<QualityInternalAudit>[] = [
      { key: "number", header: "Número" },
      { key: "programYear", header: "Año" },
      { key: "plannedDate", header: "Fecha programada", value: (row) => excelDate(row.plannedDate) },
      { key: "executedDate", header: "Fecha realizada", value: (row) => row.executedDate ? excelDate(row.executedDate) : "" },
      { key: "scope", header: "Alcance" },
      { key: "criteria", header: "Criterios", value: (row) => row.criteria || "" },
      { key: "auditor", header: "Auditor" },
      { key: "auditee", header: "Auditado / área" },
      { key: "status", header: "Estado", value: (row) => row.status === "Done" ? "Realizada" : "Programada" }
    ];
    void exportToExcel(`PG04-R01_${yearFilter}_${statusFilter}`, filtered, columns);
  };

  return <div className="workspace-page pad">
    <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div><Link to="/calidad/documentos/PG04-R01" style={{ fontSize: 13 }}>← PG04-R01</Link>
        <h1 style={{ margin: "8px 0 0" }}>PG04 · Programa de auditorías internas</h1>
        <p className="muted">Programá auditorías, registrá cuándo se realizaron y adjuntá luego los respaldos R02, R03 y R04.</p></div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <button type="button" className="btn btn-outline" disabled={!filtered.length} onClick={exportExcel}>Exportar Excel</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowForm((open) => !open)}>
          {showForm ? "Cerrar alta" : "Programar auditoría"}</button>
      </div>
    </div>
    {(error || message) && <div className="card pad" style={{ marginTop: 12, color: error ? "#991b1b" : "#166534", background: error ? "#fef2f2" : "#f0fdf4" }}>{error || message}</div>}
    {showForm && <form className="card pad" style={{ marginTop: 16 }} onSubmit={(event) => void create(event)}>
      <h2 style={{ marginTop: 0 }}>Nueva programación · PG04-R01</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <label>Año *<input type="number" min="2001" required value={programYear} onChange={(event) => setProgramYear(event.target.value)} /></label>
        <label>Fecha programada *<input type="date" required value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></label>
        <label>Auditor *<input required value={auditor} onChange={(event) => setAuditor(event.target.value)} /></label>
        <label>Auditado / área<input value={auditee} onChange={(event) => setAuditee(event.target.value)} /></label>
      </div>
      <label style={{ marginTop: 12 }}>Alcance *<textarea rows={2} required value={scope} onChange={(event) => setScope(event.target.value)} /></label>
      <label style={{ marginTop: 12 }}>Criterios<input value={criteria} onChange={(event) => setCriteria(event.target.value)} placeholder="Normas, procedimientos o requisitos aplicables" /></label>
      <label style={{ marginTop: 12 }}>Notas<textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
      <button className="btn btn-primary" disabled={busy} style={{ marginTop: 12 }}>Guardar programación</button>
    </form>}
    <div className="card pad" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
      <select aria-label="Filtrar año" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
        <option value="all">Todos los años</option>{years.map((year) => <option key={year} value={String(year)}>{year}</option>)}
      </select>
      {([["all", "Todas"], ["Planned", "Programadas"], ["Done", "Realizadas"]] as const).map(([value, label]) =>
        <button type="button" key={value} className={statusFilter === value ? "btn btn-primary compact" : "btn btn-outline compact"}
          onClick={() => setStatusFilter(value)}>{label}</button>)}
      <span className="muted" style={{ marginLeft: "auto" }}>{filtered.length} auditorías</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 16, marginTop: 16, alignItems: "start" }}>
      <section className="card pad"><h2 style={{ marginTop: 0 }}>Programación · PG04-R01</h2>
        {loading ? <p>Cargando…</p> : !filtered.length ? <p className="muted">No hay auditorías con este filtro.</p> :
          <div className="table-wrap"><table className="table"><thead><tr>
            <th>Nº</th><th>Programada</th><th>Alcance</th><th>Auditor</th><th>Estado</th>
          </tr></thead><tbody>{filtered.map((row) => <tr key={row.id} onClick={() => setSelectedId(row.id)}
            style={{ cursor: "pointer", background: selectedId === row.id ? "#ecfeff" : undefined }}>
            <td><strong>{row.number}</strong></td><td>{dateLabel(row.plannedDate)}</td><td>{row.scope}</td>
            <td>{row.auditor}</td><td>{row.status === "Done" ? "Realizada" : "Programada"}</td>
          </tr>)}</tbody></table></div>}
      </section>
      <section className="card pad">{!selected ? <p className="muted">Seleccioná una auditoría para ver su programación y respaldos.</p> : <>
        <h2 style={{ marginTop: 0 }}>{selected.number}</h2>
        <p><strong>Estado:</strong> {selected.status === "Done" ? "Realizada" : "Programada"}</p>
        <p><strong>Fecha programada:</strong> {dateLabel(selected.plannedDate)} · <strong>Año:</strong> {selected.programYear}</p>
        {selected.executedDate && <p><strong>Fecha realizada:</strong> {dateLabel(selected.executedDate)}</p>}
        <p><strong>Alcance:</strong> {selected.scope}</p><p><strong>Criterios:</strong> {selected.criteria || "—"}</p>
        <p><strong>Auditor:</strong> {selected.auditor} · <strong>Auditado / área:</strong> {selected.auditee || "—"}</p>
        {selected.notes && <p><strong>Notas:</strong> {selected.notes}</p>}
        <Link className="btn btn-outline compact" to={`/calidad/registros/auditorias/${selected.id}/pdf`}>Exportar PDF del programa</Link>
        {selected.status === "Planned" && <div className="card pad" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Registrar realización</h3>
          <label>Fecha de realización *<input type="date" required value={executedDate} onChange={(event) => setExecutedDate(event.target.value)} /></label>
          <button type="button" className="btn btn-primary" disabled={busy || !executedDate} style={{ marginTop: 10 }} onClick={() => void markDone()}>
            Marcar como realizada</button>
        </div>}
        {selected.status === "Done" && <div style={{ marginTop: 18 }}><h3>Archivos de respaldo</h3>
          <p className="muted">Adjuntá cada registro después de realizar la auditoría. Podés reemplazar el archivo si hace falta.</p>
          {backups.map((backup) => <div key={backup.code} className="card pad" style={{ marginTop: 10 }}>
            <strong>{backup.code} · {backup.label}</strong>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {selected[backup.key] ? <button type="button" className="btn btn-outline compact"
                onClick={() => void api.openQualityFile(selected[backup.key]!, "download")}>Descargar respaldo</button> :
                <span className="muted">Sin archivo</span>}
              <input aria-label={`Cargar ${backup.code}`} type="file" disabled={busy}
                onChange={(event) => { void uploadBackup(backup.key, event.target.files?.[0]); event.target.value = ""; }} />
            </div></div>)}
        </div>}
      </>}</section>
    </div>
  </div>;
}
