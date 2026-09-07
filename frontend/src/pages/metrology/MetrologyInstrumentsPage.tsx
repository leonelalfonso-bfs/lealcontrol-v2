import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/client";
import type { MetrologyInstrument } from "../../api/types";

const emptyForm = {
  code: "",
  kind: "Thermometer",
  description: "Termómetro ambiental",
  brand: "",
  model: "",
  serialNumber: "",
  measurementRange: "-20 … 60 °C",
  resolution: "0.1 °C",
  certificateNumber: "",
  traceabilityLab: "",
  calibrationDate: "",
  expirationDate: "",
  status: "Valid",
  notes: ""
};

export function MetrologyInstrumentsPage() {
  const [items, setItems] = useState<MetrologyInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.listMetrologyInstruments({ kind: "Thermometer" })
      .then(setItems)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id: string, code: string) => {
    if (!window.confirm(`¿Eliminar instrumento ${code}?`)) return;
    try {
      await api.deleteMetrologyInstrument(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="page-wide">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow" style={{ color: "#0d9488", fontWeight: 800, fontSize: "0.75rem" }}>METROLOGÍA</span>
          <h1 style={{ margin: "4px 0 0" }}>Instrumentos auxiliares</h1>
          <p className="muted" style={{ margin: 0 }}>Termómetros y otros instrumentos de medición (PG14 / PG16)</p>
        </div>
        <Link to="/metrologia/instrumentos/nuevo" className="btn" style={{ background: "linear-gradient(135deg, #0d9488, #0f766e)", color: "#fff" }}>
          Nuevo termómetro
        </Link>
      </div>

      {error && <div className="card pad" style={{ marginTop: 12, background: "#fef2f2", color: "#991b1b" }}>{error}</div>}

      <div className="card pad" style={{ marginTop: 16 }}>
        {loading ? (
          <div className="muted">Cargando…</div>
        ) : items.length === 0 ? (
          <div className="muted">No hay termómetros cargados. Creá el primero para vincularlo a los ensayos.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Certificado</th>
                  <th>Calibración</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.code}</strong></td>
                    <td>
                      {i.description || "—"}
                      <div className="muted" style={{ fontSize: 12 }}>{[i.brand, i.model, i.serialNumber].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{i.certificateNumber || "—"}</td>
                    <td>{i.calibrationDate ? new Date(i.calibrationDate).toLocaleDateString("es-AR") : "—"}</td>
                    <td>{i.expirationDate ? new Date(i.expirationDate).toLocaleDateString("es-AR") : "—"}</td>
                    <td><span className={`badge ${i.status === "Valid" ? "ok" : "warn"}`}>{i.status}</span></td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <Link to={`/metrologia/instrumentos/${i.id}`} className="btn ghost compact">Editar</Link>
                      <button type="button" className="btn ghost compact" onClick={() => void onDelete(i.id, i.code)}>Eliminar</button>
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

export function MetrologyInstrumentFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id || id === "nuevo";
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) return;
    api.getMetrologyInstrument(id!)
      .then((item) => {
        setForm({
          code: item.code || "",
          kind: item.kind || "Thermometer",
          description: item.description || "",
          brand: item.brand || "",
          model: item.model || "",
          serialNumber: item.serialNumber || "",
          measurementRange: item.measurementRange || "",
          resolution: item.resolution || "",
          certificateNumber: item.certificateNumber || "",
          traceabilityLab: item.traceabilityLab || "",
          calibrationDate: item.calibrationDate ? item.calibrationDate.slice(0, 10) : "",
          expirationDate: item.expirationDate ? item.expirationDate.slice(0, 10) : "",
          status: item.status || "Valid",
          notes: item.notes || ""
        });
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id, isNew]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      code: form.code.trim(),
      kind: form.kind,
      description: form.description.trim(),
      brand: form.brand.trim(),
      model: form.model.trim(),
      serialNumber: form.serialNumber.trim(),
      measurementRange: form.measurementRange.trim(),
      resolution: form.resolution.trim(),
      certificateNumber: form.certificateNumber.trim(),
      traceabilityLab: form.traceabilityLab.trim(),
      calibrationDate: form.calibrationDate ? new Date(form.calibrationDate).toISOString() : undefined,
      expirationDate: form.expirationDate ? new Date(form.expirationDate).toISOString() : undefined,
      status: form.status,
      notes: form.notes.trim() || undefined
    };
    try {
      if (isNew) await api.createMetrologyInstrument(body);
      else await api.updateMetrologyInstrument(id!, body);
      navigate("/metrologia/instrumentos");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: keyof typeof emptyForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="page-wide">
      <Link to="/metrologia/instrumentos" style={{ fontSize: 13 }}>← Instrumentos</Link>
      <h1 style={{ marginTop: 8 }}>{isNew ? "Nuevo termómetro" : `Editar ${form.code}`}</h1>
      {error && <div className="card pad" style={{ background: "#fef2f2", color: "#991b1b", marginTop: 12 }}>{error}</div>}
      <form className="card pad" style={{ marginTop: 16 }} onSubmit={(e) => void onSubmit(e)}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <label>Código<input required value={form.code} onChange={(e) => set("code", e.target.value)} placeholder="EQ 001" /></label>
          <label>Tipo
            <select value={form.kind} onChange={(e) => set("kind", e.target.value)}>
              <option value="Thermometer">Termómetro</option>
              <option value="Other">Otro</option>
            </select>
          </label>
          <label>Descripción<input value={form.description} onChange={(e) => set("description", e.target.value)} /></label>
          <label>Marca<input value={form.brand} onChange={(e) => set("brand", e.target.value)} /></label>
          <label>Modelo<input value={form.model} onChange={(e) => set("model", e.target.value)} /></label>
          <label>Nº serie<input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} /></label>
          <label>Rango<input value={form.measurementRange} onChange={(e) => set("measurementRange", e.target.value)} /></label>
          <label>Resolución<input value={form.resolution} onChange={(e) => set("resolution", e.target.value)} /></label>
          <label>Nº certificado<input value={form.certificateNumber} onChange={(e) => set("certificateNumber", e.target.value)} /></label>
          <label>Lab. trazabilidad<input value={form.traceabilityLab} onChange={(e) => set("traceabilityLab", e.target.value)} /></label>
          <label>Fecha calibración<input type="date" value={form.calibrationDate} onChange={(e) => set("calibrationDate", e.target.value)} /></label>
          <label>Vencimiento<input type="date" value={form.expirationDate} onChange={(e) => set("expirationDate", e.target.value)} /></label>
          <label>Estado
            <select value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="Valid">Valid</option>
              <option value="Expired">Expired</option>
              <option value="Inactive">Inactive</option>
            </select>
          </label>
        </div>
        <label style={{ display: "block", marginTop: 12 }}>
          Notas
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={{ width: "100%" }} />
        </label>
        <div style={{ marginTop: 16, displayContent: "flex-end", display: "flex", gap: 8 }}>
          <button type="button" className="btn ghost" onClick={() => navigate("/metrologia/instrumentos")}>Cancelar</button>
          <button type="submit" className="btn" disabled={saving} style={{ background: "#0d9488", color: "#fff" }}>
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
