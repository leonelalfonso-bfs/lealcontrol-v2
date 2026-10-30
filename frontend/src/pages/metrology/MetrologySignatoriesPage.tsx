import { useEffect, useState } from "react";
import { api, type MetrologySignatory } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { fileToBase64 } from "../../lib/files";

/** Responsables técnicos que firman los informes de calibración: cada uno carga su aclaración y la imagen de su firma. */
export function MetrologySignatoriesPage() {
  const { user } = useAuth();
  const canSign = !!user?.isTechnicalDirector || user?.role === "Admin" || user?.role === "Administrador" || user?.role === "DirectorTecnico";
  const [list, setList] = useState<MetrologySignatory[]>([]);
  const [form, setForm] = useState({ fullName: user?.fullName ?? "", title: "Responsable técnico", license: "" });
  const [image, setImage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    setList(await api.listMetrologySignatories());
    const me = await api.getMySignatory();
    if (me) {
      setForm({ fullName: me.fullName, title: me.title ?? "", license: me.license ?? "" });
      if (me.hasSignature) setPreview(await api.signatoryImageUrl(me.userId));
    }
  };
  useEffect(() => { void load().catch((err) => setError(err.message)); }, []);

  return (
    <div className="stack" style={{ gap: 16, maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>✍️ Firmas de los informes</h1>
          <p className="muted">El informe de calibración sale con la firma y la aclaración del responsable técnico que lo emite.</p>
        </div>
      </div>
      {error && <div className="alert">{error}</div>}
      {msg && <div className="alert ok">{msg}</div>}

      {canSign ? (
        <form className="card pad stack" style={{ gap: 10 }} onSubmit={(e) => {
          e.preventDefault();
          setError(null); setMsg(null);
          void api.saveMySignatory({ ...form, signatureBase64: image }).then(async () => { setImage(null); setMsg("✓ Firma guardada."); await load(); }).catch((err) => setError(err.message));
        }}>
          <h3 style={{ margin: 0 }}>Mi firma</h3>
          <div className="grid-2">
            <label>Aclaración (nombre y apellido)<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label>
            <label>Cargo<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>Matrícula (opcional)<input value={form.license} onChange={(e) => setForm({ ...form, license: e.target.value })} /></label>
            <label>Imagen de la firma (PNG con fondo transparente, hasta 400 KB)
              <input type="file" accept="image/png,image/jpeg" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const data = await fileToBase64(f);
                const url = `data:${f.type};base64,${data}`;
                setImage(url);
                setPreview(url);
              }} />
            </label>
          </div>
          {preview && <img src={preview} alt="Firma" style={{ maxHeight: 90, maxWidth: 260, objectFit: "contain", border: "1px dashed #cbd5e1", padding: 6, background: "#fff" }} />}
          <div><button type="submit" className="btn">Guardar</button></div>
        </form>
      ) : (
        <div className="card pad muted">Solo los responsables técnicos (directores técnicos) firman informes.</div>
      )}

      <div className="card pad stack" style={{ gap: 6 }}>
        <h3 style={{ margin: 0 }}>Responsables técnicos con firma</h3>
        <table style={{ fontSize: "0.88rem" }}>
          <thead><tr><th>Aclaración</th><th>Cargo</th><th>Matrícula</th><th>Firma</th></tr></thead>
          <tbody>
            {list.map((s) => <tr key={s.userId}><td>{s.fullName}</td><td>{s.title ?? "—"}</td><td>{s.license ?? "—"}</td><td>{s.hasSignature ? "✓ cargada" : "falta"}</td></tr>)}
            {list.length === 0 && <tr><td colSpan={4} className="muted">Todavía nadie cargó su firma.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
