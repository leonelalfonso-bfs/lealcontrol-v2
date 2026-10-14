import type { ReactNode } from "react";

/**
 * Piezas comunes de los manuales de Ayuda de cada módulo: índice, secciones, pasos numerados
 * y la tabla de "cuando el sistema no te deja". Así todos los manuales se leen igual.
 */

export type ManualSection = { id: string; title: string };

export function HelpManual({ eyebrow, title, intro, sections, actions, children }: {
  eyebrow: string;
  title: string;
  intro: ReactNode;
  sections: ManualSection[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="muted" style={{ maxWidth: 760 }}>{intro}</p>
        </div>
        {actions && <div className="toolbar">{actions}</div>}
      </div>

      <nav className="card pad" style={{ marginBottom: 20, maxWidth: 900 }} aria-label="Índice del manual">
        <strong>Índice</strong>
        <ol style={{ margin: "8px 0 0", paddingLeft: 20, columns: "2 260px", columnGap: 32 }}>
          {sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.title}</a></li>)}
        </ol>
      </nav>

      <div className="stack" style={{ gap: 20, maxWidth: 900 }}>{children}</div>
    </div>
  );
}

export function ManualPart({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="card pad stack" style={{ gap: 10, scrollMarginTop: 80 }}>
      <h2 style={{ margin: 0, fontSize: "1.25rem" }}>{title}</h2>
      {children}
    </section>
  );
}

/** Pasos numerados: cada uno con un título corto y el detalle de qué tocar. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 10 }}>{children}</ol>;
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <li>
      <strong>{title}</strong>
      {children && <div style={{ marginTop: 2 }}>{children}</div>}
    </li>
  );
}

/** Recuadro de consejo o advertencia dentro de una sección. */
export function Tip({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 8, fontSize: "0.9rem",
      background: warn ? "rgba(217, 119, 6, 0.08)" : "rgba(3, 105, 161, 0.07)",
      border: `1px solid ${warn ? "rgba(217, 119, 6, 0.35)" : "rgba(3, 105, 161, 0.25)"}`
    }}>
      {warn ? "⚠ " : "💡 "}{children}
    </div>
  );
}

/** Tabla "lo que dice el sistema → qué hacer". */
export function Troubleshooting({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th style={{ width: "42%" }}>Si el sistema dice…</th><th>Qué hacer</th></tr></thead>
        <tbody>{rows.map(([problem, fix], i) => <tr key={i}><td>{problem}</td><td>{fix}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
