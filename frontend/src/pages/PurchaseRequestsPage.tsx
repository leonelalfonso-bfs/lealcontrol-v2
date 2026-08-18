import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseRequest } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function PurchaseRequestsPage() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.listPurchaseRequests(search, statusFilter);
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [search, statusFilter]);

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(true);
      await api.approvePurchaseRequest(id);
      await loadData();
    } catch (err: unknown) {
      alert("Error al aprobar: " + (err instanceof Error ? err.message : "Desconocido"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalId || !rejectReason.trim()) return;

    try {
      setActionLoading(true);
      await api.rejectPurchaseRequest(rejectModalId, rejectReason);
      setRejectModalId(null);
      setRejectReason("");
      await loadData();
    } catch (err: unknown) {
      alert("Error al rechazar: " + (err instanceof Error ? err.message : "Desconocido"));
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = requests.filter((r) => r.status === "Pending").length;
  const approvedCount = requests.filter((r) => r.status === "Approved").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Solicitudes de Compra (Requisiciones Internas)</h1>
          <p className="muted">
            Canal interno para que el personal solicite compras y el equipo de adquisiciones gestione cotizaciones y emita la OC
          </p>
        </div>
        <ExcelToolbar fileName="solicitudes-de-compra" rows={requests} columns={[
          { header: "Número", key: "requestNumber" }, { header: "Solicitante", key: "requestedBy" },
          { header: "Sector", key: "department" }, { header: "Prioridad", key: "priority" },
          { header: "Estado", key: "status" }, { header: "Fecha", key: "createdAtUtc" },
        ]} />
        <Link to="/compras/solicitudes/nueva" className="btn btn-primary">
          + Nueva Solicitud de Compra
        </Link>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "20px" }}>
        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#b45309", textTransform: "uppercase" }}>
            Pendientes de Aprobación
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px", color: "#b45309" }}>
            {pendingCount}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#047857", textTransform: "uppercase" }}>
            Aprobadas (Listas para Cotizar / OC)
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px", color: "#047857" }}>
            {approvedCount}
          </div>
        </div>

        <div className="card pad" style={{ background: "linear-gradient(135deg, rgba(14, 165, 233, 0.12), rgba(2, 132, 199, 0.05))" }}>
          <div style={{ fontSize: "0.82rem", fontWeight: "bold", color: "#0369a1", textTransform: "uppercase" }}>
            Total Solicitudes Históricas
          </div>
          <div style={{ fontSize: "1.6rem", fontWeight: "bold", marginTop: "4px" }}>
            {requests.length}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar por N° solicitud, solicitante o motivo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
        >
          <option value="">Todos los Estados</option>
          <option value="Pending">Pendiente de Aprobación</option>
          <option value="Approved">Aprobada</option>
          <option value="Ordered">En Orden de Compra (OC)</option>
          <option value="Rejected">Rechazada</option>
        </select>
      </div>

      {/* Requests Table */}
      <div className="card pad" style={{ marginTop: "16px" }}>
        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-soft)" }}>Cargando solicitudes de compra...</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--ink-soft)" }}>
            No se encontraron solicitudes de compra registradas.
          </div>
        ) : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                <th style={{ padding: "10px 8px" }}>N° Solicitud</th>
                <th style={{ padding: "10px 8px" }}>Fecha</th>
                <th style={{ padding: "10px 8px" }}>Solicitante</th>
                <th style={{ padding: "10px 8px" }}>Sector / Depto</th>
                <th style={{ padding: "10px 8px" }}>Prioridad</th>
                <th style={{ padding: "10px 8px" }}>Motivo / Justificación</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Presupuestos Proveedor</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Estado</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const priorityColor =
                  r.priority === "Urgent"
                    ? { bg: "#fef2f2", text: "#b91c1c" }
                    : r.priority === "High"
                    ? { bg: "#fffbeb", text: "#b45309" }
                    : { bg: "#f1f5f9", text: "#475569" };

                const statusBadge =
                  r.status === "Approved"
                    ? { bg: "#ecfdf5", text: "#047857", label: "Aprobada" }
                    : r.status === "Ordered"
                    ? { bg: "#eff6ff", text: "#1d4ed8", label: "En OC" }
                    : r.status === "Rejected"
                    ? { bg: "#fef2f2", text: "#b91c1c", label: "Rechazada" }
                    : { bg: "#fffbeb", text: "#b45309", label: "Pendiente" };

                const quoteCount = r.quotations?.length || 0;
                const selectedQuote = r.quotations?.find((q) => q.isSelected);

                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>
                      <Link to={`/compras/solicitudes/${r.id}`} style={{ color: "#2563eb", textDecoration: "none" }}>
                        {r.requestNumber}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 8px", fontSize: "0.9rem" }}>
                      {new Date(r.createdAtUtc).toLocaleDateString("es-AR")}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>
                      {r.requestedBy}
                    </td>
                    <td style={{ padding: "12px 8px", color: "var(--ink-soft)" }}>
                      {r.department}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "0.78rem", fontWeight: "bold", background: priorityColor.bg, color: priorityColor.text }}>
                        {r.priority === "Urgent" ? "🚨 Urgente" : r.priority === "High" ? "⚡ Alta" : r.priority === "Low" ? "Baja" : "Normal"}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.reason}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      <Link
                        to={`/compras/solicitudes/${r.id}`}
                        className="btn btn-outline"
                        style={{ padding: "3px 8px", fontSize: "0.8rem", textDecoration: "none", color: quoteCount > 0 ? "#047857" : "var(--ink-soft)" }}
                      >
                        ⚖️ {quoteCount} {quoteCount === 1 ? "presupuesto" : "presupuestos"}
                        {selectedQuote && " (🏆 Elegido)"}
                      </Link>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "0.78rem", fontWeight: "bold", background: statusBadge.bg, color: statusBadge.text }}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <Link
                          to={`/compras/solicitudes/${r.id}`}
                          className="btn btn-outline"
                          style={{ padding: "4px 8px", fontSize: "0.8rem", textDecoration: "none" }}
                          title="Ver detalle y comparar cotizaciones"
                        >
                          👁️ Ver
                        </Link>

                        {r.status === "Pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApprove(r.id)}
                              disabled={actionLoading}
                              className="btn"
                              style={{ padding: "4px 8px", fontSize: "0.8rem", background: "#059669", color: "white" }}
                              title="Aprobar para que compras gestione la OC"
                            >
                              ✓ Aprobar
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectModalId(r.id)}
                              disabled={actionLoading}
                              className="btn btn-outline"
                              style={{ padding: "4px 8px", fontSize: "0.8rem", color: "#b91c1c" }}
                              title="Rechazar solicitud"
                            >
                              ✕
                            </button>
                          </>
                        )}

                        {r.status === "Approved" && (
                          <Link
                            to={
                              selectedQuote
                                ? `/compras/ordenes/nueva?request_id=${r.id}&supplier_id=${selectedQuote.supplierId}&currency=${selectedQuote.currency}&quote_ref=${encodeURIComponent(selectedQuote.supplierQuoteRef || "")}`
                                : `/compras/ordenes/nueva?request_id=${r.id}`
                            }
                            className="btn"
                            style={{ padding: "4px 8px", fontSize: "0.8rem", background: "#3b82f6", color: "white", textDecoration: "none", fontWeight: "bold" }}
                            title="Generar Orden de Compra formal"
                          >
                            📝 Generar OC
                          </Link>
                        )}

                        {r.status === "Ordered" && (
                          <span style={{ fontSize: "0.82rem", color: "#0284c7", fontWeight: "bold" }}>
                            ✓ OC Generada
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModalId && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="card pad" style={{ background: "white", width: "450px", maxWidth: "90%" }}>
            <h3 style={{ marginTop: 0, color: "#b91c1c" }}>Rechazar Solicitud de Compra</h3>
            <p style={{ fontSize: "0.88rem", color: "var(--ink-soft)" }}>
              Por favor indique el motivo por el cual se rechaza esta solicitud:
            </p>
            <form onSubmit={handleReject}>
              <textarea
                required
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo (ej: stock suficiente en pañol, no presupuestado, etc.)..."
                style={{ width: "100%", padding: "8px", borderRadius: "6px", border: "1px solid var(--surface-border)", marginBottom: "16px" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" onClick={() => setRejectModalId(null)} className="btn btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={actionLoading} className="btn" style={{ background: "#b91c1c", color: "white" }}>
                  Confirmar Rechazo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
