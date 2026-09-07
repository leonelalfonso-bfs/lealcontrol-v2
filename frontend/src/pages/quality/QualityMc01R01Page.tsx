import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityConfidentialityCommitment } from "../../api/types/quality";

type Variant = "MC01-R01" | "MC01-R02";

type Props = {
  variant: Variant;
};

function variantMeta(variant: Variant) {
  if (variant === "MC01-R02") {
    return {
      code: "MC01-R02",
      title: "Compromiso de confidencialidad e imparcialidad (externo)",
      blurb: "Instancias firmadas por personal externo / terceros (cláusulas ISO 4.1 / 4.2).",
      templatePath: "/calidad/documentos/MC01-R02",
      recordsPath: "/calidad/registros/mc01-r02",
      showOrganization: true,
      list: () => api.listQualityMc01R02(),
      create: api.createQualityMc01R02,
      cancel: api.cancelQualityMc01R02
    };
  }

  return {
    code: "MC01-R01",
    title: "Compromiso de confidencialidad e imparcialidad (interno)",
    blurb: "Registro de instancias firmadas por personal interno (cláusulas ISO 4.1 / 4.2).",
    templatePath: "/calidad/documentos/MC01-R01",
    recordsPath: "/calidad/registros/mc01-r01",
    showOrganization: false,
    list: () => api.listQualityMc01R01(),
    create: api.createQualityMc01R01,
    cancel: api.cancelQualityMc01R01
  };
}

export function QualityConfidentialityRecordPage({ variant }: Props) {
  const meta = variantMeta(variant);
  const [rows, setRows] = useState<QualityConfidentialityCommitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [personName, setPersonName] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [organization, setOrganization] = useState("");
  const [signedAt, setSignedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = () => {
    setLoading(true);
    meta.list()
      .then((res) => setRows(res.rows || []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!personName.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      let signedFileId: string | undefined;
      if (file) {
        const uploaded = await api.uploadQualityFile(file, "Published");
        signedFileId = uploaded.id;
      }
      await meta.create({
        personName: personName.trim(),
        personEmail: personEmail.trim() || undefined,
        personRole: personRole.trim() || undefined,
        organization: organization.trim() || undefined,
        signedAt: signedAt ? new Date(signedAt).toISOString() : undefined,
        signedFileId,
        notes: notes.trim() || undefined
      });
      setMsg("Compromiso registrado.");
      setShowForm(false);
      setPersonName("");
      setPersonEmail("");
      setPersonRole("");
      setOrganization("");
      setNotes("");
      setFile(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async (id: string, name: string) => {
    if (!window.confirm(`¿Anular el compromiso de ${name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await meta.cancel(id);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="workspace-page pad">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <Link to={meta.templatePath} style={{ fontSize: 13 }}>← Plantilla {meta.code}</Link>
          <h1 style={{ margin: "8px 0 0" }}>{meta.code} · {meta.title}</h1>
          <p style={{ color: "#64748b", marginTop: 6 }}>{meta.blurb}</p>
        </div>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setShowForm((v) => !v)}>
          {showForm ? "Cerrar alta" : "Nuevo compromiso"}
        </button>
      </div>

      {(error || msg) && (
        <div
          className="card pad"
          style={{ marginTop: 12, background: error ? "#fef2f2" : "#f0fdf4", color: error ? "#991b1b" : "#166534" }}
        >
          {error || msg}
        </div>
      )}

      {showForm && (
        <form className="card pad" style={{ marginTop: 16 }} onSubmit={(e) => void onSubmit(e)}>
          <h3 style={{ marginTop: 0 }}>Alta de compromiso firmado</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <label>
              Persona *
              <input required value={personName} onChange={(e) => setPersonName(e.target.value)} placeholder="Nombre y apellido" />
            </label>
            {meta.showOrganization && (
              <label>
                Organización / empresa
                <input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Razón social del tercero" />
              </label>
            )}
            <label>
              Rol / puesto
              <input value={personRole} onChange={(e) => setPersonRole(e.target.value)} placeholder={meta.showOrganization ? "Ej. Auditor / Proveedor" : "Ej. Técnico de laboratorio"} />
            </label>
            <label>
              Email
              <input type="email" value={personEmail} onChange={(e) => setPersonEmail(e.target.value)} />
            </label>
            <label>
              Fecha de firma
              <input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} />
            </label>
            <label>
              PDF firmado
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <label style={{ display: "block", marginTop: 12 }}>
            Notas
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ width: "100%" }} />
          </label>
          <div style={{ marginTop: 12, justifyContent: "flex-end", display: "flex", gap: 8 }}>
            <button type="button" className="btn ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </form>
      )}

      <div className="card pad" style={{ marginTop: 16 }}>
        {loading ? (
          <div className="muted">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="muted">Aún no hay compromisos registrados.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Persona</th>
                  {meta.showOrganization && <th>Organización</th>}
                  <th>Rol</th>
                  <th>Firma</th>
                  <th>PDF</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.personName}</strong>
                      {r.personEmail ? <div className="muted" style={{ fontSize: 12 }}>{r.personEmail}</div> : null}
                    </td>
                    {meta.showOrganization && <td>{r.organization || "—"}</td>}
                    <td>{r.personRole || "—"}</td>
                    <td>{r.signedAt ? new Date(r.signedAt).toLocaleDateString("es-AR") : "—"}</td>
                    <td>
                      {r.signedFileId ? (
                        <button
                          type="button"
                          className="btn ghost compact"
                          onClick={() => void api.openQualityFile(r.signedFileId!, "open")}
                        >
                          Ver PDF
                        </button>
                      ) : (
                        <span className="muted">Sin archivo</span>
                      )}
                    </td>
                    <td>{r.status}</td>
                    <td style={{ textAlign: "right" }}>
                      {r.status === "Active" && (
                        <button
                          type="button"
                          className="btn ghost compact"
                          disabled={busy}
                          onClick={() => void onCancel(r.id, r.personName)}
                        >
                          Anular
                        </button>
                      )}
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

export function QualityMc01R01Page() {
  return <QualityConfidentialityRecordPage variant="MC01-R01" />;
}

export function QualityMc01R02Page() {
  return <QualityConfidentialityRecordPage variant="MC01-R02" />;
}
