import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { labelOf, QUALITY_DOC_STATUS } from "./qualityLabels";
import { usePresentationMode } from "../../context/PresentationModeContext";

function fmtDate(v?: string | null) {
  if (!v) return "—";
  try {
    return new Date(v).toLocaleDateString("es-AR");
  } catch {
    return v;
  }
}

export function QualityDashboardPage() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getQualityDashboard>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { active: presentation } = usePresentationMode();

  useEffect(() => {
    api.getQualityDashboard()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const kpi = [
    { label: "Documentos", value: data?.totalDocuments ?? "—" },
    { label: "Vigentes", value: data?.current ?? "—" },
    { label: "NC abiertas", value: data?.openNonConformities ?? "—" },
    { label: "Quejas fuera de plazo", value: data?.overdueComplaints ?? "—", danger: (data?.overdueComplaints ?? 0) > 0 },
    { label: "Revisión vencida", value: data?.overdueReview ?? "—", danger: (data?.overdueReview ?? 0) > 0 },
    { label: "Calibraciones vencidas", value: data?.calibrationsOverdue ?? "—", danger: (data?.calibrationsOverdue ?? 0) > 0 },
    { label: "Calibraciones ≤30 días", value: data?.calibrationsDueSoon ?? "—" },
    { label: "Autorizaciones ≤60 días", value: data?.authorizationsExpiring ?? "—" }
  ];

  return (
    <div className="workspace-page pad">
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <span className="eyebrow" style={{ color: "#0f766e", fontWeight: 800 }}>CALIDAD · ISO/IEC 17025</span>
          <h1 style={{ margin: "4px 0 0" }}>Tablero del SGC</h1>
          {presentation && (
            <p style={{ margin: "6px 0 0", color: "#b45309", fontWeight: 700, fontSize: 13 }}>
              Modo presentación activo · solo lectura
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Link className="btn btn-primary" to="/calidad/documentos">Árbol documental</Link>
          <Link className="btn btn-outline" to="/calidad/registros">Registros operativos</Link>
        </div>
      </div>

      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}

      {data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 12,
              marginTop: 16
            }}
          >
            {kpi.map((k) => (
              <div className="card pad" key={k.label}>
                <div style={{ fontSize: 12, color: "#64748b" }}>{k.label}</div>
                <strong style={{ fontSize: 26, color: k.danger ? "#b91c1c" : undefined }}>{k.value}</strong>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: 14,
              marginTop: 20
            }}
          >
            <AlertList
              title="Documentos a revisar"
              empty="Sin vencimientos próximos."
              items={(data.alerts?.documentsReview || []).map((d) => ({
                key: d.code,
                primary: `${d.displayCode || d.code} · ${d.title}`,
                secondary: `${labelOf(QUALITY_DOC_STATUS, d.status)} · ${fmtDate(d.nextReviewDate)}${d.overdue ? " · vencido" : ""}`,
                href: `/calidad/documentos/${encodeURIComponent(d.code)}`,
                danger: !!d.overdue
              }))}
            />
            <AlertList
              title="NC / TNC / R / OM abiertas"
              empty="Sin no conformidades abiertas."
              items={(data.alerts?.nonConformities || []).map((n) => ({
                key: n.id,
                primary: `${n.number} · ${n.kind}`,
                secondary: `${n.status}${n.dueDate ? ` · vence ${fmtDate(n.dueDate)}` : ""}`,
                href: n.href || "/calidad/registros/nc"
              }))}
            />
            <AlertList
              title="Quejas fuera de plazo"
              empty="Ninguna queja vencida."
              items={(data.alerts?.complaints || []).map((c) => ({
                key: c.id,
                primary: `${c.number} · ${c.partyName}`,
                secondary: `${c.status} · plazo ${fmtDate(c.currentDueAt)}`,
                href: c.href || "/calidad/registros/quejas",
                danger: true
              }))}
            />
            <AlertList
              title="Autorizaciones por vencer"
              empty="Sin autorizaciones próximas a vencer."
              items={(data.alerts?.authorizations || []).map((a) => ({
                key: a.id,
                primary: `${a.number} · ${a.personName}`,
                secondary: `${a.methodDocumentCode} · hasta ${fmtDate(a.validUntil)}`,
                href: a.href || "/calidad/registros/personal"
              }))}
            />
            <AlertList
              title="Calibraciones"
              empty="Sin alertas de calibración."
              items={(data.alerts?.calibrations || []).map((a) => ({
                key: a.id,
                primary: `${a.code} · ${a.description || ""}`,
                secondary: `Vence ${fmtDate(a.expirationDate)}${a.overdue ? " · vencido" : ""}`,
                href: a.href || "/calidad/registros/equipos",
                danger: !!a.overdue
              }))}
            />
            <AlertList
              title="Mantenimiento vencido"
              empty="Sin mantenimientos vencidos."
              items={(data.alerts?.maintenance || []).map((m) => ({
                key: m.id,
                primary: `${m.number} · ${m.equipmentCode || ""}`,
                secondary: `${m.activity || ""} · ${fmtDate(m.nextDue)}`,
                href: m.href || "/calidad/registros/equipos",
                danger: true
              }))}
            />
          </div>

          {data.clauseMatrix && data.clauseMatrix.length > 0 && (
            <div className="card pad" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Matriz cláusulas ISO/IEC 17025</h3>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Verde: hay documento vigente/aprobado que cubre la cláusula. Rojo: solo borrador u obsoleto.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {data.clauseMatrix.map((c) => (
                  <span
                    key={c.clause}
                    title={c.documents.join(", ")}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "4px 10px",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      background: c.status === "ok" ? "#dcfce7" : "#fee2e2",
                      color: c.status === "ok" ? "#166534" : "#991b1b",
                      border: `1px solid ${c.status === "ok" ? "#86efac" : "#fecaca"}`
                    }}
                  >
                    {c.clause}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AlertList({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: Array<{ key: string; primary: string; secondary: string; href: string; danger?: boolean }>;
}) {
  return (
    <div className="card pad">
      <h3 style={{ marginTop: 0, fontSize: 15 }}>{title}</h3>
      {items.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{empty}</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {items.slice(0, 8).map((it) => (
            <li key={it.key}>
              <Link to={it.href} style={{ textDecoration: "none", color: "inherit" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: it.danger ? "#b91c1c" : undefined }}>{it.primary}</div>
                <div className="muted" style={{ fontSize: 12 }}>{it.secondary}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
