import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseReception } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function PurchaseReceptionsPage() {
  const [receptions, setReceptions] = useState<PurchaseReception[]>([]);
  const [linkedReceptionIds, setLinkedReceptionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, invs] = await Promise.all([
        api.listPurchaseReceptions(search),
        api.listPurchaseInvoices().catch(() => [])
      ]);
      setReceptions(data);
      setLinkedReceptionIds(
        new Set(
          (invs || [])
            .filter((i) => i.status !== "Cancelled" && i.purchaseReceptionId)
            .map((i) => i.purchaseReceptionId as string)
        )
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message || "No se pudieron cargar las recepciones.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [search]);

  const cancelReception = async (r: PurchaseReception) => {
    const reason = window.prompt(
      `¿Anular recepción ${r.receptionNumber}? Esto revierte el stock ingresado. Motivo (opcional):`,
      ""
    );
    if (reason === null) return;
    try {
      setBusyId(r.id);
      await api.cancelPurchaseReception(r.id, reason || undefined);
      await loadData();
    } catch (err: any) {
      setError(err.message || "No se pudo anular la recepción.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>📦 Recepciones de Mercadería</h1>
          <p className="muted">Control de ingresos físicos de insumos, repuestos y mercaderías a los depósitos</p>
        </div>
        <div className="toolbar">
          <ExcelToolbar
            fileName="recepciones-compras"
            rows={receptions}
            columns={[
              { key: "receptionNumber", header: "N° Recepción" },
              { key: "supplierName", header: "Proveedor" },
              { key: "supplierRemitoNumber", header: "Remito Proveedor" },
              { key: "receptionDate", header: "Fecha" },
              { key: "warehouseLocation", header: "Depósito" },
              { key: "status", header: "Estado" }
            ]}
          />
          <Link to="/compras/recepciones/nueva" className="btn btn-primary">
            + Registrar Recepción de Mercadería
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert" style={{ background: "#fee2e2", color: "#991b1b", marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card filters">
        <input
          type="text"
          placeholder="Buscar por N° de recepción, proveedor o remito del proveedor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
        />
      </div>

      <div className="card pad" style={{ marginTop: "16px" }}>
        {loading ? (
          <div style={{ padding: "20px", textAlign: "center", color: "var(--ink-soft)" }}>Cargando recepciones...</div>
        ) : receptions.length === 0 ? (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--ink-soft)" }}>
            No se encontraron recepciones de mercadería registradas.
          </div>
        ) : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
                <th style={{ padding: "10px 8px" }}>N° Recepción</th>
                <th style={{ padding: "10px 8px" }}>Fecha</th>
                <th style={{ padding: "10px 8px" }}>Proveedor</th>
                <th style={{ padding: "10px 8px" }}>Origen / Remito</th>
                <th style={{ padding: "10px 8px" }}>Depósito Destino</th>
                <th style={{ padding: "10px 8px" }}>Recibido Por</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Cant. Ítems</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Estado</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {receptions.map((r) => {
                const hasRemito = r.supplierRemitoNumber && r.supplierRemitoNumber.trim() !== "" && r.supplierRemitoNumber !== "S/R" && r.supplierRemitoNumber !== "null";
                const cancelled = r.status === "Cancelled";
                const alreadyInvoiced = linkedReceptionIds.has(r.id);

                return (
                  <tr
                    key={r.id}
                    style={{
                      borderBottom: "1px solid rgba(0,0,0,0.04)",
                      opacity: cancelled ? 0.65 : 1
                    }}
                  >
                    <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>
                      📦 {r.receptionNumber}
                    </td>
                    <td style={{ padding: "12px 8px", fontSize: "0.9rem" }}>
                      {new Date(r.receptionDate).toLocaleDateString("es-AR")}
                    </td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>
                      {r.supplierName}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      {hasRemito ? (
                        <strong style={{ fontFamily: "monospace", color: "#0f766e" }}>
                          🚚 {r.supplierRemitoNumber}
                        </strong>
                      ) : (
                        <span className="badge" style={{ background: "rgba(59, 130, 246, 0.1)", color: "#1d4ed8", fontSize: "0.78rem" }}>
                          ⚡ Recepción Directa
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px" }}>
                      <span style={{ padding: "2px 8px", borderRadius: "6px", background: "#f1f5f9", fontSize: "0.82rem", color: "#334155" }}>
                        📍 {r.warehouseLocation}
                      </span>
                    </td>
                    <td style={{ padding: "12px 8px", color: "var(--ink-soft)", fontSize: "0.88rem" }}>
                      {r.receivedBy || "—"}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center", fontWeight: "bold" }}>
                      {r.items.length}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      {cancelled ? (
                        <span className="badge off" style={{ color: "#991b1b", background: "rgba(239,68,68,0.12)" }}>Anulada</span>
                      ) : alreadyInvoiced ? (
                        <span className="badge ok" style={{ color: "#065f46", background: "rgba(16,185,129,0.12)" }}>Facturada</span>
                      ) : (
                        <span className="badge warn" style={{ color: "#92400e", background: "rgba(245,158,11,0.15)" }}>Sin factura</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 8px", textAlign: "center" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                        {!cancelled && !alreadyInvoiced && (
                          <Link
                            to={`/compras/facturas/nueva?reception_id=${r.id}`}
                            className="btn compact"
                            style={{
                              fontSize: "0.78rem",
                              padding: "4px 10px",
                              background: "#0284c7",
                              color: "#fff",
                              fontWeight: 700,
                              textDecoration: "none",
                              borderRadius: 6
                            }}
                            title="Cargar la factura vinculada a esta recepción (sin volver a ingresar stock)"
                          >
                            🧾 Facturar
                          </Link>
                        )}
                        {!cancelled && (
                          <button
                            type="button"
                            className="btn btn-outline compact"
                            disabled={busyId === r.id}
                            style={{ fontSize: "0.78rem", color: "#991b1b", borderColor: "#fecaca" }}
                            onClick={() => void cancelReception(r)}
                          >
                            Anular
                          </button>
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
    </div>
  );
}
