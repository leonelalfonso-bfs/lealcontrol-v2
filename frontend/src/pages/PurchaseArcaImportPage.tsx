import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type ImportArcaCsvResult, type PurchaseArcaVoucher } from "../api/types";

export function PurchaseArcaImportPage() {
  const navigate = useNavigate();

  const [vouchers, setVouchers] = useState<PurchaseArcaVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [search, setSearch] = useState("");
  const [importResult, setImportResult] = useState<ImportArcaCsvResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.listArcaVouchers(statusFilter, search);
      setVouchers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar comprobantes ARCA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, search]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImporting(true);
      setError(null);
      setImportResult(null);

      const content = await file.text();
      const res = await api.importArcaCsv(content);
      setImportResult(res);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al importar archivo CSV de ARCA");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  const handleIgnore = async (id: string) => {
    try {
      await api.ignoreArcaVoucher(id);
      await loadData();
    } catch (err: unknown) {
      alert("Error: " + (err instanceof Error ? err.message : "No se pudo ignorar el comprobante"));
    }
  };

  const handleCreateSupplier = async (v: PurchaseArcaVoucher) => {
    try {
      await api.createSupplier({
        legalName: v.issuerName,
        tradeName: v.issuerName,
        documentType: "CUIT",
        documentNumber: v.issuerCuit,
        taxCondition: "ResponsableInscripto",
        paymentTerms: "30 días",
      });
      alert(`Proveedor "${v.issuerName}" registrado con éxito en el sistema.`);
      await loadData();
    } catch (err: unknown) {
      alert("Error al crear proveedor: " + (err instanceof Error ? err.message : "Desconocido"));
    }
  };

  const pendingCount = vouchers.filter((v) => v.status === "Pending").length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Importador Inteligente: Mis Comprobantes ARCA (AFIP)</h1>
          <p className="muted">
            Carga de archivos CSV oficiales de AFIP para conciliar facturas de compra y registrarlas con un solo clic
          </p>
        </div>
        <Link to="/compras/facturas" className="btn btn-outline">
          ← Volver a Facturas
        </Link>
      </div>

      {/* Upload Zone */}
      <div
        className="card pad"
        style={{
          border: "2px dashed #0284c7",
          background: "linear-gradient(135deg, rgba(2, 132, 199, 0.04), rgba(14, 165, 233, 0.08))",
          marginBottom: "20px",
          textAlign: "center",
          padding: "30px 20px"
        }}
      >
        <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📥</div>
        <h3 style={{ margin: "0 0 6px 0", color: "#0369a1" }}>
          Subir archivo CSV de "Mis Comprobantes Recibidos"
        </h3>
        <p style={{ margin: "0 0 16px 0", fontSize: "0.9rem", color: "var(--ink-soft)" }}>
          Descargá el reporte CSV directamente desde el portal de ARCA / AFIP y soltalo acá para importar automáticamente.
        </p>

        <label
          className="btn"
          style={{
            background: "linear-gradient(135deg, #0284c7, #0369a1)",
            color: "white",
            padding: "10px 24px",
            fontSize: "0.95rem",
            fontWeight: "bold",
            cursor: "pointer",
            display: "inline-block"
          }}
        >
          {importing ? "Procesando e Importando CSV..." : "📁 Seleccionar Archivo CSV de AFIP"}
          <input
            type="file"
            accept=".csv,.txt"
            onChange={handleFileUpload}
            disabled={importing}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {importResult && (
        <div style={{ padding: "14px 18px", background: "#ecfdf5", color: "#065f46", borderRadius: "8px", marginBottom: "20px", border: "1px solid #6ee7b7" }}>
          <strong>✓ Resultado de Importación:</strong> {importResult.message}
        </div>
      )}

      {error && (
        <div style={{ padding: "14px 18px", background: "#fef2f2", color: "#b91c1c", borderRadius: "8px", marginBottom: "20px", border: "1px solid #f87171" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <input
          type="text"
          placeholder="Buscar por emisor, CUIT o número de comprobante..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--surface-border)" }}
        />

        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            className={`btn ${statusFilter === "Pending" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setStatusFilter("Pending")}
            style={{ fontSize: "0.85rem" }}
          >
            Pendientes de Carga
          </button>
          <button
            type="button"
            className={`btn ${statusFilter === "Registered" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setStatusFilter("Registered")}
            style={{ fontSize: "0.85rem" }}
          >
            Registrados
          </button>
          <button
            type="button"
            className={`btn ${statusFilter === "Ignored" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setStatusFilter("Ignored")}
            style={{ fontSize: "0.85rem" }}
          >
            Ignorados
          </button>
          <button
            type="button"
            className={`btn ${statusFilter === "All" ? "btn-primary" : "btn-outline"}`}
            onClick={() => setStatusFilter("All")}
            style={{ fontSize: "0.85rem" }}
          >
            Todos
          </button>
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="card pad" style={{ marginTop: "16px" }}>
        {loading ? (
          <div style={{ padding: "30px", textAlign: "center", color: "var(--ink-soft)" }}>Cargando comprobantes ARCA...</div>
        ) : vouchers.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", color: "var(--ink-soft)" }}>
            No hay comprobantes en estado <strong>{statusFilter}</strong>.
          </div>
        ) : (
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid rgba(0,0,0,0.06)", textAlign: "left", fontSize: "0.82rem", color: "var(--ink-soft)" }}>
                <th style={{ padding: "10px 8px" }}>Fecha</th>
                <th style={{ padding: "10px 8px" }}>Tipo</th>
                <th style={{ padding: "10px 8px" }}>N° Comprobante</th>
                <th style={{ padding: "10px 8px" }}>Emisor / Razón Social</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Neto Grav.</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>IVA</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Total</th>
                <th style={{ padding: "10px 8px", textAlign: "center" }}>Estado</th>
                <th style={{ padding: "10px 8px", textAlign: "right" }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => {
                const badge =
                  v.status === "Registered"
                    ? { bg: "#ecfdf5", text: "#047857", label: "Registrado" }
                    : v.status === "Ignored"
                    ? { bg: "#f1f5f9", text: "#64748b", label: "Ignorado" }
                    : { bg: "#fffbeb", text: "#b45309", label: "Pendiente" };

                return (
                  <tr key={v.id} style={{ borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <td style={{ padding: "10px 8px", fontSize: "0.88rem" }}>
                      {new Date(v.issueDate).toLocaleDateString("es-AR")}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <span style={{ padding: "2px 6px", borderRadius: "4px", background: "#f1f5f9", fontWeight: "bold", fontSize: "0.8rem", color: "#0284c7" }}>
                        {v.voucherType}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px", fontFamily: "monospace", fontWeight: "bold" }}>
                      {v.formattedNumber}
                    </td>
                    <td style={{ padding: "10px 8px" }}>
                      <div style={{ fontWeight: 600 }}>{v.issuerName}</div>
                      <div style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>CUIT: {v.issuerCuit}</div>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace" }}>
                      $ {v.netAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", color: "#047857" }}>
                      $ {v.vatAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: "bold" }}>
                      $ {v.totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "center" }}>
                      <span style={{ padding: "3px 8px", borderRadius: "10px", fontSize: "0.75rem", fontWeight: "bold", background: badge.bg, color: badge.text }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "10px 8px", textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        {v.status === "Pending" && (
                          <>
                            <Link
                              to={`/compras/facturas/nueva?arca_id=${v.id}`}
                              className="btn"
                              style={{ padding: "4px 8px", fontSize: "0.8rem", background: "#059669", color: "white", textDecoration: "none" }}
                              title="Registrar factura con 1 clic"
                            >
                              ⚡ Registrar Factura
                            </Link>

                            <Link
                              to={`/clientes/nuevo?type=supplier&cuit=${v.issuerCuit}&name=${encodeURIComponent(v.issuerName)}&returnUrl=/compras/arca`}
                              className="btn btn-outline"
                              style={{ padding: "4px 8px", fontSize: "0.8rem", textDecoration: "none", color: "#334155" }}
                              title="Abrir ficha oficial para registrar proveedor"
                            >
                              👥 Registrar Proveedor
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleIgnore(v.id)}
                              className="btn btn-outline"
                              style={{ padding: "4px 8px", fontSize: "0.8rem", color: "#64748b" }}
                              title="Ignorar comprobante"
                            >
                              ✕
                            </button>
                          </>
                        )}

                        {v.status === "Registered" && (
                          <span style={{ fontSize: "0.82rem", color: "#047857", fontWeight: "bold" }}>
                            ✓ En Cuentas por Pagar
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
    </div>
  );
}
