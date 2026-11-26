import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseReception } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export function PurchaseReceptionsPage() {
  const [receptions, setReceptions] = useState<PurchaseReception[]>([]);
  const [linkedReceptionIds, setLinkedReceptionIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, invs] = await Promise.all([
        api.listPurchaseReceptions(debouncedSearch),
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
  }, [debouncedSearch]);

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
        <div className="alert t-danger" style={{ marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div className="card filters">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por número de recepción, proveedor o remito del proveedor"
          style={{ flex: "1 1 320px", maxWidth: 520 }}
        />
      </div>

      <div className="card pad" style={{ marginTop: "16px" }}>
        {loading ? (
          <div className="t-center muted" style={{ padding: "20px" }}>Cargando recepciones...</div>
        ) : receptions.length === 0 ? (
          <div className="t-center muted" style={{ padding: "30px" }}>
            No se encontraron recepciones de mercadería registradas.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>N° Recepción</th>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th>Origen / Remito</th>
                <th>Depósito Destino</th>
                <th>Recibido Por</th>
                <th className="t-center">Cant. Ítems</th>
                <th className="t-center">Estado</th>
                <th className="t-center">Acciones</th>
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
                   style={{ opacity: cancelled ? 0.65 : 1 }}>
                    <td className="t-strong t-mono">
                      📦 {r.receptionNumber}
                    </td>
                    <td>
                      {new Date(r.receptionDate).toLocaleDateString("es-AR")}
                    </td>
                    <td className="t-strong">
                      {r.supplierName}
                    </td>
                    <td>
                      {hasRemito ? (
                        <strong className="t-mono t-accent">
                          🚚 {r.supplierRemitoNumber}
                        </strong>
                      ) : (
                        <span className="badge t-info t-small" style={{ background: "rgba(59, 130, 246, 0.1)" }}>
                          ⚡ Recepción Directa
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="t-small muted" style={{ padding: "2px 8px", borderRadius: "6px", background: "var(--lc-surface-2)" }}>
                        📍 {r.warehouseLocation}
                      </span>
                    </td>
                    <td className="muted">
                      {r.receivedBy || "—"}
                    </td>
                    <td className="t-center t-strong">
                      {r.items.length}
                    </td>
                    <td className="t-center">
                      {cancelled ? (
                        <span className="badge off t-danger" style={{ background: "rgba(239,68,68,0.12)" }}>Anulada</span>
                      ) : alreadyInvoiced ? (
                        <span className="badge ok t-ok" style={{ background: "rgba(16,185,129,0.12)" }}>Facturada</span>
                      ) : (
                        <span className="badge warn t-warn" style={{ background: "rgba(245,158,11,0.15)" }}>Sin factura</span>
                      )}
                    </td>
                    <td className="t-center">
                      <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                        {!cancelled && !alreadyInvoiced && (
                          <Link
                            to={`/compras/facturas/nueva?reception_id=${r.id}`}
                            className="btn compact"
                            title="Cargar la factura vinculada a esta recepción (sin volver a ingresar stock)"
                          >
                            🧾 Facturar
                          </Link>
                        )}
                        {!cancelled && (
                          <button
                            type="button"
                            className="btn btn-outline compact t-danger"
                            disabled={busyId === r.id}
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
