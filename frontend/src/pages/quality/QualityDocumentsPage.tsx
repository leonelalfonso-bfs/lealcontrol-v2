import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityDashboard, QualityDocumentTreeNode } from "../../api/types/quality";
import { operationalRecordFor } from "./qualityRecordRoutes";
import { labelOf, QUALITY_DOC_STATUS } from "./qualityLabels";

function typeLabel(type: string): string {
  switch (type) {
    case "Manual":
      return "MC";
    case "Procedure":
      return "PG";
    case "Instruction":
      return "IT";
    case "RecordTemplate":
      return "R";
    case "External":
      return "EXT";
    default:
      return type;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case "Current":
      return "#0f766e";
    case "Draft":
      return "#a16207";
    case "Obsolete":
      return "#64748b";
    default:
      return "#334155";
  }
}

function TreeNode({
  node,
  depth,
  selectedCode,
  onSelect
}: {
  node: QualityDocumentTreeNode;
  depth: number;
  selectedCode: string | null;
  onSelect: (code: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1 || node.type === "Manual" || node.type === "Procedure");
  const selected = selectedCode === node.code;
  const hasChildren = node.children?.length > 0;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          onSelect(node.code);
          if (hasChildren) setOpen((v) => !v);
        }}
        style={{
          display: "flex",
          width: "100%",
          alignItems: "center",
          gap: 8,
          textAlign: "left",
          padding: "6px 8px",
          paddingLeft: 8 + depth * 14,
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
          background: selected ? "rgba(15, 118, 110, 0.12)" : "transparent",
          color: "#0f172a",
          fontWeight: selected ? 700 : 500
        }}
      >
        <span style={{ width: 14, color: "#64748b", fontSize: 12 }}>{hasChildren ? (open ? "▾" : "▸") : "·"}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: "0.04em",
            color: "#0f766e",
            minWidth: 28
          }}
        >
          {typeLabel(node.type)}
        </span>
        <span style={{ flex: 1, fontSize: 13 }}>
          <strong>{node.displayCode}</strong> · {node.title}
        </span>
        <span style={{ fontSize: 11, color: statusColor(node.status) }}>{labelOf(QUALITY_DOC_STATUS, node.status)}</span>
      </button>
      {open &&
        hasChildren &&
        node.children.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedCode={selectedCode}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function findNode(nodes: QualityDocumentTreeNode[], code: string): QualityDocumentTreeNode | null {
  for (const n of nodes) {
    if (n.code === code) return n;
    const found = findNode(n.children ?? [], code);
    if (found) return found;
  }
  return null;
}

export function QualityDocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null);
  const [tree, setTree] = useState<QualityDocumentTreeNode[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>("MC01");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.getQualityDashboard(), api.getQualityDocumentTree()])
      .then(([dash, nodes]) => {
        setDashboard(dash);
        setTree(nodes);
        if (!selectedCode && nodes[0]) setSelectedCode(nodes[0].code);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => (selectedCode ? findNode(tree, selectedCode) : null),
    [tree, selectedCode]
  );

  if (loading) {
    return <div className="workspace-page pad">Cargando Sistema de Gestión de Calidad…</div>;
  }

  if (error) {
    return (
      <div className="workspace-page pad">
        <p style={{ color: "#b91c1c" }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="workspace-page pad">
      <div className="page-head" style={{ marginBottom: 16 }}>
        <span className="eyebrow" style={{ color: "#0f766e", fontWeight: 800, letterSpacing: "0.08em" }}>
          ISO/IEC 17025 · SGC
        </span>
        <h1 style={{ margin: "4px 0 0" }}>Documentación del sistema de calidad</h1>
        <p style={{ margin: "6px 0 0", color: "#64748b", maxWidth: 720 }}>
          Árbol documental con la nomenclatura oficial (MC / PG / IT / R). Los registros generados
          PG01-R01 y PG01-R02 se calculan desde este catálogo.
        </p>
      </div>

      {dashboard && (
        <div className="grid-4" style={{ marginBottom: 16, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Documentos</div><div style={{ fontSize: 28, fontWeight: 800 }}>{dashboard.totalDocuments}</div></div>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Vigentes</div><div style={{ fontSize: 28, fontWeight: 800, color: "#0f766e" }}>{dashboard.current}</div></div>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Borradores</div><div style={{ fontSize: 28, fontWeight: 800, color: "#a16207" }}>{dashboard.draft}</div></div>
          <div className="card pad"><div style={{ fontSize: 12, color: "#64748b" }}>Revisión vencida</div><div style={{ fontSize: 28, fontWeight: 800, color: dashboard.overdueReview ? "#b91c1c" : "#0f766e" }}>{dashboard.overdueReview}</div></div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 16, alignItems: "start" }}>
        <div className="card pad" style={{ maxHeight: "70vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>Árbol documental</strong>
            <Link to="/calidad/registros" style={{ fontSize: 12 }}>Registros</Link>
          </div>
          {tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedCode={selectedCode}
              onSelect={setSelectedCode}
            />
          ))}
        </div>

        <div className="card pad">
          {!selected ? (
            <p style={{ color: "#64748b" }}>Seleccioná un documento del árbol.</p>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#0f766e", fontWeight: 800 }}>{selected.displayCode}</div>
                  <h2 style={{ margin: "4px 0 0" }}>{selected.title}</h2>
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                    <span className="pill">{selected.type}</span>
                    <span className="pill" style={{ color: statusColor(selected.status) }}>{labelOf(QUALITY_DOC_STATUS, selected.status)}</span>
                    {selected.recordKind && <span className="pill">Registro: {selected.recordKind}</span>}
                    {selected.linkedModule && <span className="pill">→ {selected.linkedModule}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {(() => {
                    const op = operationalRecordFor(selected.code);
                    if (!op?.ready) return null;
                    return (
                      <Link className="btn btn-primary" to={op.path}>
                        Abrir registro
                      </Link>
                    );
                  })()}
                  <Link className="btn btn-outline" to={`/calidad/documentos/${encodeURIComponent(selected.code)}`}>
                    Ver detalle
                  </Link>
                </div>
              </div>

              <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Versión vigente</div>
                  <div style={{ fontWeight: 700 }}>
                    {selected.currentVersion ? `v${selected.currentVersion.version}` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Próxima revisión</div>
                  <div style={{ fontWeight: 700 }}>
                    {selected.nextReviewDate ? new Date(selected.nextReviewDate).toLocaleDateString("es-AR") : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Elaboró / Revisó / Aprobó</div>
                  <div style={{ fontSize: 13 }}>
                    {selected.currentVersion?.elaboratedBy || "—"} / {selected.currentVersion?.reviewedBy || "—"} /{" "}
                    {selected.currentVersion?.approvedBy || "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Cláusulas ISO 17025</div>
                  <div style={{ fontWeight: 600 }}>{selected.iso17025Clauses || "—"}</div>
                </div>
              </div>

              {selected.children?.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <h3 style={{ marginBottom: 8 }}>Registros / hijos asociados</h3>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {selected.children.map((c) => (
                      <li key={c.id} style={{ marginBottom: 4 }}>
                        <button
                          type="button"
                          className="btn-link"
                          style={{ background: "none", border: "none", color: "#0f766e", cursor: "pointer", padding: 0 }}
                          onClick={() => setSelectedCode(c.code)}
                        >
                          {c.displayCode} — {c.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
