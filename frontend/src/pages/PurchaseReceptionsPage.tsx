import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { type PurchaseReception } from "../api/types";
import { ExcelToolbar } from "../components/ExcelTools";

export function PurchaseReceptionsPage() {
  const [receptions, setReceptions] = useState<PurchaseReception[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const data = await api.listPurchaseReceptions(search);
        setReceptions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [search]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Recepciones de Mercadería (Remitos Proveedor)</h1>
          <p className="muted">Control de ingresos físicos de insumos y repuestos a los depósitos</p>
        </div>
        <div className="toolbar"><ExcelToolbar fileName="recepciones-compras" rows={receptions} columns={[{ key: "receptionNumber", header: "Número" }, { key: "supplierName", header: "Proveedor" }, { key: "supplierRemitoNumber", header: "Remito" }, { key: "receptionDate", header: "Fecha" }, { key: "warehouseLocation", header: "Depósito" }]} /><Link to="/compras/recepciones/nueva" className="btn btn-primary">
          + Registrar Recepción de Stock
        </Link></div>
      </div>

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
                <th style={{ padding: "10px 8px" }}>Remito Proveedor</th>
                <th style={{ padding: "10px 8px" }}>Depósito Destino</th>
                <th style={{ padding: "10px 8px" }}>Recibido Por</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Cant. Ítems</th>
              </tr>
            </thead>
            <tbody>
              {receptions.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                  <td style={{ padding: "12px 8px", fontWeight: "bold", fontFamily: "monospace" }}>
                    {r.receptionNumber}
                  </td>
                  <td style={{ padding: "12px 8px", fontSize: "0.9rem" }}>
                    {new Date(r.receptionDate).toLocaleDateString("es-AR")}
                  </td>
                  <td style={{ padding: "12px 8px", fontWeight: 600 }}>
                    {r.supplierName}
                  </td>
                  <td style={{ padding: "12px 8px", fontFamily: "monospace" }}>
                    {r.supplierRemitoNumber}
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
