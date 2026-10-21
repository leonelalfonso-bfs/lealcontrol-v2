import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityCalibrationCertificate } from "../../api/types/quality";

const day = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const STATUS: Record<QualityCalibrationCertificate["status"], { label: string; bg: string; color: string }> = {
  Vigente: { label: "Vigente", bg: "#dcfce7", color: "#166534" },
  PorVencer: { label: "Vence en menos de 60 días", bg: "#fef3c7", color: "#92400e" },
  Vencido: { label: "Vencido", bg: "#fee2e2", color: "#991b1b" },
  SinVencimiento: { label: "Sin vencimiento", bg: "#f1f5f9", color: "#475569" }
};
const SOURCE: Record<string, string> = { StandardWeight: "Pesa", Instrument: "Termómetro" };
const emptyForm = { number: "", laboratory: "", calibrationDate: "", expirationDate: "", notes: "" };

/** PG17 · Trazabilidad: los certificados de calibración con su vencimiento, su PDF y los equipos que cubren. */
export function QualityTraceabilityPage() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("cert");
  const [rows, setRows] = useState<QualityCalibrationCertificate[]>([]);
  const [missing, setMissing] = useState<{ number: string; laboratory: string; calibrationDate?: string | null; expirationDate?: string | null; assets: number }[]>([]);
  const [form, setForm] = useState<typeof emptyForm | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api.listCalibrationCertificates().then((r) => { setRows(r.rows); setMissing(r.missing); }).catch((err) => setError(err.message));
  useEffect(() => { void load(); }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded = file ? await api.uploadQualityFile(file) : null;
      await api.saveCalibrationCertificate({
        number: form.number.trim(), laboratory: form.laboratory, notes: form.notes,
        calibrationDate: form.calibrationDate ? new Date(form.calibrationDate).toISOString() : null,
        expirationDate: form.expirationDate ? new Date(form.expirationDate).toISOString() : null,
        ...(uploaded ? { fileId: uploaded.id } : {})
      });
      setMsg(`✓ Certificado ${form.number} guardado.`);
      setForm(null);
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (c: QualityCalibrationCertificate) => {
    if (!c.fileId) return;
    try {
      const { blob, fileName } = await api.downloadQualityFile(c.fileId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = c.fileName || fileName || `certificado-${c.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo descargar.");
    }
  };

  const remove = async (c: QualityCalibrationCertificate) => {
    if (!window.confirm(`¿Borrar el certificado ${c.number}?`)) return;
    try {
      await api.deleteCalibrationCertificate(c.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar.");
    }
  };

  const q = search.trim().toLowerCase();
  const visible = rows.filter((c) => (!selected || c.number === selected) && (!q || [c.number, c.laboratory, ...c.assets.map((a) => `${a.internalCode} ${a.code}`)].join(" ").toLowerCase().includes(q)));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="page-head">
        <div>
          <h1>🔗 Trazabilidad · PG17</h1>
          <p className="muted">Certificados de calibración con su vencimiento y su PDF como evidencia, y los equipos que cubre cada uno.</p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn" onClick={() => { setForm({ ...emptyForm }); setFile(null); }}>➕ Cargar certificado</button>
          <Link to="/metrologia/patrones" className="btn ghost">⚖️ Pesas</Link>
          <Link to="/calidad/registros/equipos" className="btn ghost">PG14 Equipos</Link>
        </div>
      </div>

      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {missing.length > 0 && (
        <div className="card pad stack" style={{ gap: 6 }}>
          <strong>Certificados de equipos que todavía no están cargados acá</strong>
          {missing.map((m) => (
            <div key={m.number} className="row" style={{ gap: 10, alignItems: "center", fontSize: "0.88rem" }}>
              <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{m.number}</span>
              <span className="muted">{m.assets} equipo(s) · vence {day(m.expirationDate)}</span>
              <button type="button" className="btn ghost compact" onClick={() => setForm({
                number: m.number, laboratory: m.laboratory || "", notes: "",
                calibrationDate: m.calibrationDate?.slice(0, 10) || "", expirationDate: m.expirationDate?.slice(0, 10) || ""
              })}>Cargar con su PDF</button>
            </div>
          ))}
        </div>
      )}

      {form && (
        <form className="card pad stack" style={{ gap: 10 }} onSubmit={save}>
          <h3 style={{ margin: 0 }}>Certificado de calibración</h3>
          <div className="grid-3">
            <label>Número *<input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} required /></label>
            <label>Laboratorio<input value={form.laboratory} onChange={(e) => setForm({ ...form, laboratory: e.target.value })} /></label>
            <label>PDF del certificado<input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
            <label>Fecha de calibración<input type="date" value={form.calibrationDate} onChange={(e) => setForm({ ...form, calibrationDate: e.target.value })} /></label>
            <label>Vencimiento<input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} /></label>
            <label>Notas<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
            Los equipos se vinculan solos: son las pesas y termómetros que tienen este número de certificado en su ficha.
          </p>
          <div className="row" style={{ gap: 10 }}>
            <button type="submit" className="btn" disabled={busy}>Guardar</button>
            <button type="button" className="btn ghost" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}

      <div className="card pad stack" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <input placeholder="Buscar por certificado, laboratorio o equipo (EQ-…)" value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 380 }} />
          {selected && <button type="button" className="btn ghost compact" onClick={() => setParams({})}>Ver todos los certificados</button>}
        </div>
        <div className="table-wrap">
          <table style={{ fontSize: "0.86rem" }}>
            <thead>
              <tr><th>Certificado</th><th>Laboratorio</th><th>Calibración</th><th>Vencimiento</th><th>Estado</th><th>Equipos (N.º interno · identificación)</th><th>PDF</th><th /></tr>
            </thead>
            <tbody>
              {visible.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontFamily: "monospace", fontWeight: 700 }}>{c.number}</td>
                  <td>{c.laboratory || "—"}</td>
                  <td>{day(c.calibrationDate)}</td>
                  <td>{day(c.expirationDate)}</td>
                  <td><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: STATUS[c.status].bg, color: STATUS[c.status].color }}>{STATUS[c.status].label}</span></td>
                  <td>
                    {c.assets.length === 0 ? <span className="muted">Ningún equipo tiene este certificado</span> : c.assets.map((a) => (
                      <div key={a.id}>
                        {a.deepLinkPath ? <Link to={a.deepLinkPath}>{a.internalCode || "—"}</Link> : a.internalCode || "—"} · {a.code}
                        <span className="muted"> · {SOURCE[a.source] || a.source}{a.description ? ` ${a.description}` : ""}</span>
                      </div>
                    ))}
                  </td>
                  <td>{c.fileId ? <button type="button" className="btn ghost compact" onClick={() => void download(c)}>⬇️ PDF</button> : <span className="muted">Sin PDF</span>}</td>
                  <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                    <button type="button" className="btn ghost compact" onClick={() => setForm({
                      number: c.number, laboratory: c.laboratory || "", notes: c.notes || "",
                      calibrationDate: c.calibrationDate?.slice(0, 10) || "", expirationDate: c.expirationDate?.slice(0, 10) || ""
                    })}>Editar</button>
                    {c.assets.length === 0 && <button type="button" className="btn ghost compact" onClick={() => void remove(c)}>Borrar</button>}
                  </td>
                </tr>
              ))}
              {visible.length === 0 && <tr><td colSpan={8} className="muted" style={{ padding: 16 }}>No hay certificados cargados.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
