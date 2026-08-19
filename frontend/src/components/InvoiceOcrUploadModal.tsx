import React, { useState } from "react";
import { automationApi, type InvoiceOcrResult } from "../api/automationApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onApplyInvoice?: (result: InvoiceOcrResult) => void;
}

export function InvoiceOcrUploadModal({ isOpen, onClose, onApplyInvoice }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InvoiceOcrResult | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setError(null);
      if (selected.type.startsWith("image/")) {
        setPreviewUrl(URL.createObjectURL(selected));
      } else {
        setPreviewUrl(null);
      }
    }
  };

  const handleScan = async () => {
    if (!file) {
      setError("Por favor seleccione un archivo (PDF o Imagen de la factura).");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const res = await automationApi.extractInvoiceOcr(file);
      setResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Error al procesar la factura con Gemini OCR.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (result && onApplyInvoice) {
      onApplyInvoice(result);
      onClose();
    }
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(15, 23, 42, 0.65)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 9999,
      padding: "20px"
    }}>
      <div style={{
        background: "#ffffff",
        borderRadius: "12px",
        width: "100%",
        maxWidth: "850px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
        overflow: "hidden"
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
          color: "#ffffff",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "1.2rem" }}>📷</span>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>
                Carga Inteligente de Facturas con IA (Gemini OCR)
              </h2>
            </div>
            <div style={{ fontSize: "0.78rem", opacity: 0.9, marginTop: "2px" }}>
              Sube la foto o PDF de la factura del proveedor y extrae automáticamente los datos fiscales
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)",
              border: "none",
              color: "#ffffff",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              cursor: "pointer",
              fontSize: "1.1rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
          {error && (
            <div style={{ background: "#fef2f2", border: "1px solid #f87171", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px", fontSize: "0.85rem" }}>
              ⚠️ {error}
            </div>
          )}

          {/* Upload Area */}
          <div style={{ border: "2px dashed #94a3b8", borderRadius: "8px", padding: "20px", textAlign: "center", background: "#f8fafc", marginBottom: "16px" }}>
            <input
              type="file"
              id="invoice-file-input"
              accept=".pdf,image/png,image/jpeg,image/jpg"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            <label htmlFor="invoice-file-input" style={{ cursor: "pointer", display: "inline-block" }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📄</div>
              <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.95rem" }}>
                {file ? file.name : "Haz clic para seleccionar o arrastra aquí tu Factura (PDF o Imagen)"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "4px" }}>
                Formatos soportados: PDF, JPG, PNG (Comprobantes A, B, C, M de AFIP/ARCA)
              </div>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "16px" }}>
            <button
              onClick={handleScan}
              disabled={loading || !file}
              style={{
                background: loading || !file ? "#94a3b8" : "#2563eb",
                color: "#ffffff",
                border: "none",
                padding: "9px 22px",
                borderRadius: "6px",
                fontWeight: 700,
                fontSize: "0.88rem",
                cursor: loading || !file ? "not-allowed" : "pointer",
                boxShadow: "0 4px 12px rgba(37, 99, 235, 0.25)",
                display: "flex",
                alignItems: "center",
                gap: "8px"
              }}
            >
              {loading ? "⚡ Leyendo comprobante con Gemini..." : "✨ Extraer Datos con IA"}
            </button>
          </div>

          {/* Extracted Data Card */}
          {result && (
            <div style={{ border: "1.5px solid #2563eb", borderRadius: "8px", overflow: "hidden", background: "#ffffff" }}>
              <div style={{ background: "#eff6ff", padding: "12px 16px", borderBottom: "1px solid #bfdbfe", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h3 style={{ margin: 0, color: "#1e3a8a", fontSize: "1.05rem", fontWeight: 800 }}>
                    {result.supplierName} • CUIT {result.supplierCuit}
                  </h3>
                  <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "2px" }}>
                    Factura <strong>{result.invoiceType}</strong> N° {String(result.pointOfSale).padStart(5, "0")}-{String(result.invoiceNumber).padStart(8, "0")} | Emisión: <strong>{result.issueDate}</strong>
                  </div>
                </div>
                <span style={{ background: "#2563eb", color: "white", padding: "3px 10px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 700 }}>
                  {result.currency} {result.total?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                </span>
              </div>

              {/* Fiscal Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", padding: "12px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: "0.78rem" }}>
                <div><strong>CAE N°:</strong> <span style={{ fontFamily: "monospace" }}>{result.cae || "—"}</span></div>
                <div><strong>Vto. CAE:</strong> {result.caeDueDate || "—"}</div>
                <div><strong>Condición IVA:</strong> {result.supplierTaxCondition || "Resp. Inscripto"}</div>
                <div><strong>Subtotal Neto:</strong> $ {result.subtotal?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
                <div><strong>IVA 21%:</strong> $ {result.vat21?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
                <div><strong>Total Comprobante:</strong> <strong style={{ color: "#1e3a8a" }}>$ {result.total?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</strong></div>
              </div>

              {/* Items Detail */}
              {result.items?.length > 0 && (
                <div style={{ padding: "12px 16px" }}>
                  <h4 style={{ margin: "0 0 6px 0", fontSize: "0.82rem", color: "#0f172a" }}>
                    Ítems Detectados ({result.items.length}):
                  </h4>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                    <thead>
                      <tr style={{ background: "#f1f5f9", textAlign: "left", color: "#475569" }}>
                        <th style={{ padding: "5px 6px" }}>Descripción</th>
                        <th style={{ padding: "5px 6px", textAlign: "center" }}>Cant.</th>
                        <th style={{ padding: "5px 6px", textAlign: "right" }}>Precio Unit.</th>
                        <th style={{ padding: "5px 6px", textAlign: "center" }}>% IVA</th>
                        <th style={{ padding: "5px 6px", textAlign: "right" }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.items.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid #e2e8f0" }}>
                          <td style={{ padding: "5px 6px", fontWeight: 600 }}>{item.description}</td>
                          <td style={{ padding: "5px 6px", textAlign: "center" }}>{item.quantity}</td>
                          <td style={{ padding: "5px 6px", textAlign: "right", fontFamily: "monospace" }}>
                            $ {item.unitPrice?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "5px 6px", textAlign: "center" }}>{item.vatRate}%</td>
                          <td style={{ padding: "5px 6px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                            $ {item.subtotal?.toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={onClose}
            style={{ background: "#ffffff", border: "1px solid #cbd5e1", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", fontWeight: 600, fontSize: "0.85rem" }}
          >
            Cerrar
          </button>

          {result && (
            <button
              onClick={handleApply}
              style={{ background: "#2563eb", color: "#ffffff", border: "none", padding: "8px 20px", borderRadius: "6px", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem", boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)" }}
            >
              ✅ Cargar a Formulario de Compras
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
