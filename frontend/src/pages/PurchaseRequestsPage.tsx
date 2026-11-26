import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseRequest } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export function PurchaseRequestsPage() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("");
  const [rejectModalId, setRejectModalId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.listPurchaseRequests(debouncedSearch, statusFilter);
      setRequests(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [debouncedSearch, statusFilter]);

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
        <div className="card pad">
          <div className="t-small t-strong t-warn t-caps">
            Pendientes de Aprobación
          </div>
          <div className="t-strong t-warn t-xl" style={{ marginTop: "4px" }}>
            {pendingCount}
          </div>
        </div>

        <div className="card pad">
          <div className="t-small t-strong t-ok t-caps">
            Aprobadas (Listas para Cotizar / OC)
          </div>
          <div className="t-strong t-ok t-xl" style={{ marginTop: "4px" }}>
            {approvedCount}
          </div>
        </div>

        <div className="card pad">
          <div className="t-small t-strong t-info t-caps">
            Total Solicitudes Históricas
          </div>
          <div className="t-strong t-xl" style={{ marginTop: "4px" }}>
            {requests.length}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por número de solicitud, solicitante o motivo"
          style={{ flex: "1 1 320px", maxWidth: 520 }}
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
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
          <div className="t-center muted" style={{ padding: "20px" }}>Cargando solicitudes de compra...</div>
        ) : requests.length === 0 ? (
          <div className="t-center muted" style={{ padding: "30px" }}>
            No se encontraron solicitudes de compra registradas.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>N° Solicitud</th>
                <th>Fecha</th>
                <th>Solicitante</th>
                <th>Sector / Depto</th>
                <th>Prioridad</th>
                <th>Motivo / Justificación</th>
                <th className="t-center">Presupuestos Proveedor</th>
                <th className="t-center">Estado</th>
                <th className="t-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => {
                const priorityTone = r.priority === "Urgent" ? "danger" : r.priority === "High" ? "warn" : "off";

                const statusBadge =
                  r.status === "Approved"
                    ? { tone: "ok", label: "Aprobada" }
                    : r.status === "Ordered"
                    ? { tone: "info", label: "En OC" }
                    : r.status === "Rejected"
                    ? { tone: "danger", label: "Rechazada" }
                    : { tone: "warn", label: "Pendiente" };

                const quoteCount = r.quotations?.length || 0;
                const selectedQuote = r.quotations?.find((q) => q.isSelected);

                return (
                  <tr key={r.id}>
                    <td className="t-strong t-mono">
                      <Link className="t-info" to={`/compras/solicitudes/${r.id}`} style={{ textDecoration: "none" }}>
                        {r.requestNumber}
                      </Link>
                    </td>
                    <td>
                      {new Date(r.createdAtUtc).toLocaleDateString("es-AR")}
                    </td>
                    <td className="t-strong">
                      {r.requestedBy}
                    </td>
                    <td className="muted">
                      {r.department}
                    </td>
                    <td>
                      <span className={`badge ${priorityTone}`}>
                        {r.priority === "Urgent" ? "🚨 Urgente" : r.priority === "High" ? "⚡ Alta" : r.priority === "Low" ? "Baja" : "Normal"}
                      </span>
                    </td>
                    <td style={{ maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.reason}
                    </td>
                    <td className="t-center">
                      <Link
                        to={`/compras/solicitudes/${r.id}`}
                        className="btn btn-outline compact"
                      >
                        ⚖️ {quoteCount} {quoteCount === 1 ? "presupuesto" : "presupuestos"}
                        {selectedQuote && " (🏆 Elegido)"}
                      </Link>
                    </td>
                    <td className="t-center">
                      <span className={`badge ${statusBadge.tone}`}>
                        {statusBadge.label}
                      </span>
                    </td>
                    <td className="t-right">
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        <Link
                          to={`/compras/solicitudes/${r.id}`}
                          className="btn btn-outline compact"
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
                              className="btn compact"
                              title="Aprobar para que compras gestione la OC"
                            >
                              ✓ Aprobar
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectModalId(r.id)}
                              disabled={actionLoading}
                              className="btn btn-outline t-danger compact"
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
                            className="btn compact"
                            title="Generar Orden de Compra formal"
                          >
                            📝 Generar OC
                          </Link>
                        )}

                        {r.status === "Ordered" && (
                          <span className="t-small t-info t-strong">
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
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ width: "min(450px, 100%)" }}>
            <h3 className="t-danger">Rechazar Solicitud de Compra</h3>
            <p className="muted">
              Por favor indique el motivo por el cual se rechaza esta solicitud:
            </p>
            <form onSubmit={handleReject}>
              <textarea
                required
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Motivo del rechazo (ej: stock suficiente en pañol, no presupuestado, etc.)..."
                style={{ width: "100%", marginBottom: "16px" }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button type="button" onClick={() => setRejectModalId(null)} className="btn btn-outline">
                  Cancelar
                </button>
                <button type="submit" disabled={actionLoading} className="btn danger">
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
