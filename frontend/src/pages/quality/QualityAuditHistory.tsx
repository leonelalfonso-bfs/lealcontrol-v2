import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { QualityAuditEventRow } from "../../api/types/quality";

interface Props {
  entityType: string;
  entityId: string | null | undefined;
  title?: string;
}

function tryPretty(json: string): string {
  if (!json) return "—";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function QualityAuditHistory({ entityType, entityId, title = "Historial de cambios" }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<QualityAuditEventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !entityId) return;
    setLoading(true);
    setError(null);
    api.getQualityAuditTrail(entityType, entityId)
      .then((res) => setRows(res.rows || []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [open, entityType, entityId]);

  if (!entityId) return null;

  return (
    <div style={{ marginTop: 16, borderTop: "1px solid var(--surface-border)", paddingTop: 12 }}>
      <button
        type="button"
        className="btn btn-outline compact"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Ocultar historial" : title}
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {loading && <p className="muted">Cargando historial…</p>}
          {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <p className="muted">Sin eventos registrados todavía.</p>
          )}
          {!loading && rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: "1px solid var(--surface-border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    background: "var(--surface-muted)"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 13 }}>{r.summary || r.eventType}</strong>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {new Date(r.occurredAtUtc).toLocaleString("es-AR")}
                      {r.performedByName ? ` · ${r.performedByName}` : ""}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn ghost compact"
                    style={{ marginTop: 4, fontSize: 12 }}
                    onClick={() => setExpanded((id) => (id === r.id ? null : r.id))}
                  >
                    {expanded === r.id ? "Ocultar antes/después" : "Ver antes / después"}
                  </button>
                  {expanded === r.id && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginTop: 8
                      }}
                    >
                      <div>
                        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Antes</div>
                        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: 0, maxHeight: 220, overflow: "auto" }}>
                          {tryPretty(r.beforeJson)}
                        </pre>
                      </div>
                      <div>
                        <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>Después</div>
                        <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", margin: 0, maxHeight: 220, overflow: "auto" }}>
                          {tryPretty(r.afterJson)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
