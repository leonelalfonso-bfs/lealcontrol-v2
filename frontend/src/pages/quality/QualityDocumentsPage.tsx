import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import type { QualityDashboard, QualityDocumentTreeNode } from "../../api/types/quality";
import { operationalRecordFor } from "./qualityRecordRoutes";
import { labelOf, QUALITY_DOC_STATUS } from "./qualityLabels";

type DocWizardType = "Manual" | "Procedure" | "Instruction" | "External";

const WIZARD_TYPES: { value: DocWizardType; label: string }[] = [
  { value: "Manual", label: "MC — Manual de calidad" },
  { value: "Procedure", label: "PG — Procedimiento" },
  { value: "Instruction", label: "IT — Instrucción técnica" },
  { value: "External", label: "EXT — Documento externo" }
];

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

function firstNodeCode(nodes: QualityDocumentTreeNode[]): string | null {
  if (nodes.length === 0) return null;
  return nodes[0].code;
}

function toIsoDate(value: string): string | undefined {
  if (!value) return undefined;
  return new Date(`${value}T12:00:00`).toISOString();
}

const emptyWizard = () => ({
  type: "Manual" as DocWizardType,
  code: "",
  title: "",
  displayCode: "",
  versionNumber: 1,
  elaboratedBy: "",
  elaboratedAt: "",
  reviewedBy: "",
  reviewedAt: "",
  approvedBy: "",
  approvedAt: "",
  effectiveFrom: "",
  changeSummary: "",
  markCurrent: false,
  publishedFile: null as File | null,
  sourceFile: null as File | null
});

export function QualityDocumentsPage() {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<QualityDashboard | null>(null);
  const [tree, setTree] = useState<QualityDocumentTreeNode[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [wizard, setWizard] = useState(emptyWizard);
  const [wizardError, setWizardError] = useState<string | null>(null);
  const [wizardBusy, setWizardBusy] = useState(false);

  const loadData = useCallback(async (preferCode?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const [dash, nodes] = await Promise.all([api.getQualityDashboard(), api.getQualityDocumentTree()]);
      setDashboard(dash);
      setTree(nodes);
      setSelectedCode((prev) => {
        if (preferCode && findNode(nodes, preferCode)) return preferCode;
        if (prev && findNode(nodes, prev)) return prev;
        if (nodes.length === 0) return null;
        return firstNodeCode(nodes);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const selected = useMemo(
    () => (selectedCode ? findNode(tree, selectedCode) : null),
    [tree, selectedCode]
  );

  const openWizard = () => {
    setWizard(emptyWizard());
    setWizardError(null);
    setShowWizard(true);
  };

  const closeWizard = () => {
    if (wizardBusy) return;
    setShowWizard(false);
    setWizardError(null);
  };

  const onWizardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWizardError(null);

    const code = wizard.code.trim().toUpperCase();
    const title = wizard.title.trim();
    if (!code || !title) {
      setWizardError("Código y título son obligatorios.");
      return;
    }

    setWizardBusy(true);
    try {
      let publishedFileId: string | undefined;
      let sourceFileId: string | undefined;

      if (wizard.publishedFile) {
        const uploaded = await api.uploadQualityFile(wizard.publishedFile, "Published");
        publishedFileId = uploaded.id;
      }
      if (wizard.sourceFile) {
        const uploaded = await api.uploadQualityFile(wizard.sourceFile, "Source");
        sourceFileId = uploaded.id;
      }

      const created = await api.createQualityDocument({
        code,
        title,
        displayCode: wizard.displayCode.trim() || undefined,
        type: wizard.type,
        versionNumber: wizard.versionNumber || 1,
        changeSummary: wizard.changeSummary.trim() || undefined,
        elaboratedBy: wizard.elaboratedBy.trim() || undefined,
        elaboratedAt: toIsoDate(wizard.elaboratedAt),
        reviewedBy: wizard.reviewedBy.trim() || undefined,
        reviewedAt: toIsoDate(wizard.reviewedAt),
        approvedBy: wizard.approvedBy.trim() || undefined,
        approvedAt: toIsoDate(wizard.approvedAt),
        effectiveFrom: toIsoDate(wizard.effectiveFrom),
        publishedFileId,
        sourceFileId,
        markCurrent: wizard.markCurrent
      });

      setShowWizard(false);
      setWizard(emptyWizard());
      await loadData(created.code);
    } catch (err) {
      setWizardError(err instanceof Error ? err.message : String(err));
    } finally {
      setWizardBusy(false);
    }
  };

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
      <div className="page-head" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <span className="eyebrow" style={{ color: "#0f766e", fontWeight: 800, letterSpacing: "0.08em" }}>
            ISO/IEC 17025 · SGC
          </span>
          <h1 style={{ margin: "4px 0 0" }}>Documentación del sistema de calidad</h1>
          <p style={{ margin: "6px 0 0", color: "#64748b", maxWidth: 720 }}>
            Árbol documental con la nomenclatura oficial (MC / PG / IT / R). Los registros generados
            PG01-R01 y PG01-R02 se calculan desde este catálogo.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openWizard}>
          Nuevo documento
        </button>
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
          {tree.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.5 }}>
              <p style={{ marginTop: 0 }}>
                El SGC arranca vacío. Usá <strong>Nuevo documento</strong> para cargar tu Manual (MC),
                Procedimientos (PG) e Instrucciones (IT) desde sus archivos Word/PDF.
              </p>
              <p style={{ marginBottom: 0 }}>
                Podés completar el encabezado manualmente; más adelante se podrá parsear desde el documento fuente.
              </p>
            </div>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                depth={0}
                selectedCode={selectedCode}
                onSelect={setSelectedCode}
              />
            ))
          )}
        </div>

        <div className="card pad">
          {!selected ? (
            <p style={{ color: "#64748b" }}>
              {tree.length === 0
                ? "Todavía no hay documentos. Creá el primero con «Nuevo documento»."
                : "Seleccioná un documento del árbol."}
            </p>
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

      {showWizard && (
        <div
          role="presentation"
          onClick={closeWizard}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000
          }}
        >
          <form
            className="card pad"
            onClick={(ev) => ev.stopPropagation()}
            onSubmit={(ev) => void onWizardSubmit(ev)}
            style={{ width: "min(720px, 100%)", maxHeight: "90vh", overflow: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 style={{ margin: 0 }}>Nuevo documento</h2>
              <button type="button" className="btn btn-outline" disabled={wizardBusy} onClick={closeWizard}>
                Cerrar
              </button>
            </div>

            {wizardError && (
              <div className="card pad" style={{ marginTop: 12, background: "#fef2f2", color: "#991b1b" }}>
                {wizardError}
              </div>
            )}

            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Tipo *
                <select
                  value={wizard.type}
                  onChange={(e) => setWizard((w) => ({ ...w, type: e.target.value as DocWizardType }))}
                >
                  {WIZARD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Código *
                <input
                  required
                  value={wizard.code}
                  onChange={(e) => setWizard((w) => ({ ...w, code: e.target.value.toUpperCase() }))}
                  placeholder="MC01, PG01, IT01…"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Título *
                <input
                  required
                  value={wizard.title}
                  onChange={(e) => setWizard((w) => ({ ...w, title: e.target.value }))}
                  placeholder="Nombre del documento"
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Display code
                <input
                  value={wizard.displayCode}
                  onChange={(e) => setWizard((w) => ({ ...w, displayCode: e.target.value }))}
                  placeholder="Opcional (ej. MC 01)"
                />
              </label>
            </div>

            <h3 style={{ marginTop: 20, marginBottom: 8 }}>Encabezado</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Versión
                <input
                  type="number"
                  min={1}
                  value={wizard.versionNumber}
                  onChange={(e) => setWizard((w) => ({ ...w, versionNumber: Number(e.target.value) || 1 }))}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Elaboró
                <input value={wizard.elaboratedBy} onChange={(e) => setWizard((w) => ({ ...w, elaboratedBy: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Fecha elaboración
                <input type="date" value={wizard.elaboratedAt} onChange={(e) => setWizard((w) => ({ ...w, elaboratedAt: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Revisó
                <input value={wizard.reviewedBy} onChange={(e) => setWizard((w) => ({ ...w, reviewedBy: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Fecha revisión
                <input type="date" value={wizard.reviewedAt} onChange={(e) => setWizard((w) => ({ ...w, reviewedAt: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Aprobó
                <input value={wizard.approvedBy} onChange={(e) => setWizard((w) => ({ ...w, approvedBy: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Fecha aprobación
                <input type="date" value={wizard.approvedAt} onChange={(e) => setWizard((w) => ({ ...w, approvedAt: e.target.value }))} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Fecha vigencia
                <input type="date" value={wizard.effectiveFrom} onChange={(e) => setWizard((w) => ({ ...w, effectiveFrom: e.target.value }))} />
              </label>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 12 }}>
              Resumen del cambio
              <input
                value={wizard.changeSummary}
                onChange={(e) => setWizard((w) => ({ ...w, changeSummary: e.target.value }))}
                placeholder="Alta inicial / descripción de la versión"
              />
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
              <input
                type="checkbox"
                checked={wizard.markCurrent}
                onChange={(e) => setWizard((w) => ({ ...w, markCurrent: e.target.checked }))}
              />
              Marcar como vigente
            </label>

            <h3 style={{ marginTop: 20, marginBottom: 8 }}>Archivos</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                PDF publicado (opcional)
                <input
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(e) => setWizard((w) => ({ ...w, publishedFile: e.target.files?.[0] ?? null }))}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                Fuente Word/Excel (opcional)
                <input
                  type="file"
                  accept=".doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setWizard((w) => ({ ...w, sourceFile: e.target.files?.[0] ?? null }))}
                />
              </label>
            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-outline" disabled={wizardBusy} onClick={closeWizard}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={wizardBusy}>
                {wizardBusy ? "Creando…" : "Crear documento"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
