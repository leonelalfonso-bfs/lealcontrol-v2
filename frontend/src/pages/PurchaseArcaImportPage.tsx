import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { type ImportArcaCsvResult, type PurchaseArcaVoucher } from "../api/types";
import { SearchField } from "../components/ui/SearchField";
import { useDebouncedValue } from "../lib/useDebouncedValue";

export function PurchaseArcaImportPage() {
  const navigate = useNavigate();

  const [vouchers, setVouchers] = useState<PurchaseArcaVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Pending");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [importResult, setImportResult] = useState<ImportArcaCsvResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.listArcaVouchers(statusFilter, debouncedSearch);
      setVouchers(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al cargar comprobantes ARCA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, debouncedSearch]);

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
        className="card pad t-center"
       style={{ marginBottom: "20px", padding: "30px 20px" }}>
        <div className="t-xl" style={{ marginBottom: "8px" }}>📥</div>
        <h3 className="t-info" style={{ margin: "0 0 6px 0" }}>
          Subir archivo CSV de "Mis Comprobantes Recibidos"
        </h3>
        <p className="muted" style={{ margin: "0 0 16px 0" }}>
          Descargá el reporte CSV directamente desde el portal de ARCA / AFIP y soltalo acá para importar automáticamente.
        </p>

        <label
          className="btn"
         style={{ cursor: "pointer" }}>
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
        <div className="t-ok" style={{ padding: "14px 18px", background: "var(--lc-ok-bg)", borderRadius: "8px", marginBottom: "20px", border: "1px solid #6ee7b7" }}>
          <strong>✓ Resultado de Importación:</strong> {importResult.message}
        </div>
      )}

      {error && (
        <div className="t-danger alert" style={{ marginBottom: "20px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card filters" style={{ display: "flex", gap: "12px", alignItems: "center" }}>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Buscar por emisor, CUIT o número de comprobante"
          style={{ flex: "1 1 320px", maxWidth: 520 }}
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
          <div className="t-center muted" style={{ padding: "30px" }}>Cargando comprobantes ARCA...</div>
        ) : vouchers.length === 0 ? (
          <div className="t-center muted" style={{ padding: "40px" }}>
            No hay comprobantes en estado <strong>{statusFilter}</strong>.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>N° Comprobante</th>
                <th>Emisor / Razón Social</th>
                <th className="t-right">Neto Grav.</th>
                <th className="t-right">IVA</th>
                <th className="t-right">Total</th>
                <th className="t-center">Estado</th>
                <th className="t-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => {
                const badge =
                  v.status === "Registered"
                    ? { bg: "var(--lc-ok-bg)", text: "var(--lc-ok)", label: "Registrado" }
                    : v.status === "Ignored"
                    ? { bg: "var(--lc-surface-2)", text: "var(--lc-ink-3)", label: "Ignorado" }
                    : { bg: "var(--lc-warn-bg)", text: "var(--lc-warn)", label: "Pendiente" };

                return (
                  <tr key={v.id}>
                    <td>
                      {new Date(v.issueDate).toLocaleDateString("es-AR")}
                    </td>
                    <td>
                      <span className="t-strong t-small t-info" style={{ padding: "2px 6px", borderRadius: "4px", background: "var(--lc-surface-2)" }}>
                        {v.voucherType}
                      </span>
                    </td>
                    <td className="t-mono t-strong">
                      {v.formattedNumber}
                    </td>
                    <td>
                      <div className="t-strong">{v.issuerName}</div>
                      <div className="t-small muted">CUIT: {v.issuerCuit}</div>
                    </td>
                    <td className="t-right t-mono">
                      $ {v.netAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="t-right t-mono t-ok">
                      $ {v.vatAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="t-right t-mono t-strong">
                      $ {v.totalAmount.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="t-center">
                      <span className="t-small t-strong" style={{ padding: "3px 8px", borderRadius: "10px", background: badge.bg, color: badge.text }}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="t-right">
                      <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                        {v.status === "Pending" && (
                          <>
                            <Link
                              to={`/compras/facturas/nueva?arca_id=${v.id}`}
                              className="btn compact"
                              title="Registrar factura con 1 clic"
                            >
                              ⚡ Registrar Factura
                            </Link>

                            <Link
                              to={`/clientes/nuevo?type=supplier&cuit=${v.issuerCuit}&name=${encodeURIComponent(v.issuerName)}&returnUrl=/compras/arca`}
                              className="btn btn-outline compact"
                              title="Abrir ficha oficial para registrar proveedor"
                            >
                              👥 Registrar Proveedor
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleIgnore(v.id)}
                              className="btn btn-outline muted compact"
                              title="Ignorar comprobante"
                            >
                              ✕
                            </button>
                          </>
                        )}

                        {v.status === "Registered" && (
                          <span className="t-small t-ok t-strong">
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
