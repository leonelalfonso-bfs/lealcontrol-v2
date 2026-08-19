import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useDocumentTemplate, type TemplateStyle } from "../context/DocumentTemplateContext";

const COLOR_PRESETS = [
  { name: "Verde Esmeralda", hex: "#0d9488" },
  { name: "Azul Corporativo", hex: "#0284c7" },
  { name: "Grafito Pizarra", hex: "#1e293b" },
  { name: "Azul Marino", hex: "#1e3a8a" },
  { name: "Bordó / Rubí", hex: "#be123c" },
  { name: "Violeta Tech", hex: "#7c3aed" },
  { name: "Ámbar / Dorado", hex: "#d97706" }
];

export const DocumentTemplatesPage: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useDocumentTemplate();
  const [docTypePreview, setDocTypePreview] = useState<"quote" | "remito" | "invoice">("quote");
  const [savedAlert, setSavedAlert] = useState(false);

  const handleSave = () => {
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 3000);
  };

  return (
    <div className="workspace-page page-wide" style={{ maxWidth: 1440, margin: "0 auto" }}>
      {/* Header */}
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow">CONFIGURACIÓN VISUAL ERP</span>
          <h1>Plantillas y Diseño de Documentos</h1>
          <p className="muted">
            Personalizá los modelos, colores de línea y textos de presupuestos, remitos y facturas.
          </p>
        </div>

        <div className="toolbar">
          <Link to="/configuracion" className="btn btn-outline">
            ← Volver a Configuración
          </Link>
          <button type="button" onClick={handleSave} className="btn">
            ✓ Guardar Preferencias
          </button>
        </div>
      </div>

      {savedAlert && (
        <div className="alert ok" style={{ marginBottom: 20 }}>
          ✓ Configuración de plantillas guardada correctamente. Se aplicará a todas las impresiones y PDFs.
        </div>
      )}

      {/* Main Split Editor */}
      <div style={{ display: "grid", gridTemplateColumns: "420px 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* Left Column: Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* 1. Model Selector */}
          <div className="card pad">
            <h3 style={{ margin: "0 0 14px", fontSize: "1.05rem", color: "var(--ink)" }}>
              1. Elegir Modelo de Plantilla
            </h3>

            <div style={{ display: "grid", gap: 10 }}>
              {[
                {
                  id: "modern" as TemplateStyle,
                  name: "Moderno Ejecutivo",
                  badge: "Recomendado",
                  desc: "Diseño asimétrico con logo superior, líneas finas elegantes y tabla espaciosa."
                },
                {
                  id: "classic" as TemplateStyle,
                  name: "Clásico Corporativo",
                  badge: "Formal",
                  desc: "Banda superior en color institucional, datos en recuadros cerrados y estilo tradicional."
                },
                {
                  id: "compact" as TemplateStyle,
                  name: "Técnico / Remito",
                  badge: "Logística",
                  desc: "Aprovechamiento máximo de hoja para muchos ítems, con espacio para firmas de recepción."
                }
              ].map((tpl) => (
                <div
                  key={tpl.id}
                  onClick={() => updateSettings({ templateStyle: tpl.id })}
                  style={{
                    padding: "14px 16px",
                    borderRadius: 14,
                    border: `2px solid ${settings.templateStyle === tpl.id ? settings.primaryColor : "var(--surface-border)"}`,
                    background: settings.templateStyle === tpl.id ? "var(--surface)" : "var(--surface-muted)",
                    cursor: "pointer",
                    transition: "all 0.18s ease",
                    boxShadow: settings.templateStyle === tpl.id ? `0 4px 14px ${settings.primaryColor}22` : "none"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <strong style={{ fontSize: "0.95rem", color: "var(--ink)" }}>{tpl.name}</strong>
                    <span className="badge ok" style={{ fontSize: "0.68rem" }}>{tpl.badge}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ink-soft)", lineHeight: 1.4 }}>
                    {tpl.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Color Palette */}
          <div className="card pad">
            <h3 style={{ margin: "0 0 14px", fontSize: "1.05rem", color: "var(--ink)" }}>
              2. Color de Líneas y Acentos
            </h3>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => updateSettings({ primaryColor: preset.hex })}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: `2px solid ${settings.primaryColor === preset.hex ? "var(--ink)" : "transparent"}`,
                    background: "var(--surface-muted)",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--ink)"
                  }}
                >
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: preset.hex }} />
                  <span>{preset.name}</span>
                </button>
              ))}
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: 6, color: "var(--ink-soft)" }}>
                Color Personalizado (Código HEX)
              </label>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                  style={{ width: 44, height: 38, padding: 2, borderRadius: 8, cursor: "pointer", border: "1px solid var(--surface-border)" }}
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => updateSettings({ primaryColor: e.target.value })}
                  style={{ fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase" }}
                />
              </div>
            </div>
          </div>

          {/* 3. Footer Texts & Bank Options */}
          <div className="card pad">
            <h3 style={{ margin: "0 0 14px", fontSize: "1.05rem", color: "var(--ink)" }}>
              3. Textos Fijos y Secciones
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "0.88rem", display: "block", color: "var(--ink)" }}>Mostrar Datos Bancarios (CBU/Alias)</strong>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Para que el cliente transfiera el pago</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showBankingInfo}
                  onChange={(e) => updateSettings({ showBankingInfo: e.target.checked })}
                  style={{ width: 20, height: 20, cursor: "pointer" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <strong style={{ fontSize: "0.88rem", display: "block", color: "var(--ink)" }}>Espacio de Firma de Conformidad</strong>
                  <span className="muted" style={{ fontSize: "0.78rem" }}>Para entrega y recepción de mercadería</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.showSignatures}
                  onChange={(e) => updateSettings({ showSignatures: e.target.checked })}
                  style={{ width: 20, height: 20, cursor: "pointer" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, marginBottom: 6, color: "var(--ink-soft)" }}>
                  Leyenda / Condiciones de Validez (Pie de página)
                </label>
                <textarea
                  rows={3}
                  value={settings.customFooterText}
                  onChange={(e) => updateSettings({ customFooterText: e.target.value })}
                  style={{ width: "100%", fontSize: "0.84rem", resize: "vertical" }}
                />
              </div>

              <button type="button" onClick={resetSettings} className="btn btn-outline" style={{ fontSize: "0.82rem" }}>
                Restablecer Valores Predeterminados
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live Sheet Preview */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Preview Controls Bar */}
          <div className="card pad" style={{ padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.2rem" }}>👁️</span>
              <strong style={{ fontSize: "0.9rem", color: "var(--ink)" }}>Previsualización en Tiempo Real (Hoja A4)</strong>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              {(
                [
                  { id: "quote", label: "Presupuesto" },
                  { id: "remito", label: "Remito" },
                  { id: "invoice", label: "Factura" }
                ] as const
              ).map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setDocTypePreview(type.id)}
                  className={`btn ${docTypePreview === type.id ? "" : "btn-outline"}`}
                  style={{ padding: "5px 12px", fontSize: "0.78rem" }}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sheet Canvas Container */}
          <div
            style={{
              background: "#525659",
              padding: "24px 16px",
              borderRadius: 18,
              display: "flex",
              justifyContent: "center",
              overflowX: "auto",
              boxShadow: "inset 0 2px 10px rgba(0,0,0,0.3)"
            }}
          >
            {/* The Simulated Sheet A4 */}
            <div
              style={{
                width: 780,
                minHeight: 960,
                background: "#ffffff",
                color: "#1e293b",
                fontFamily: "Inter, sans-serif",
                padding: "36px 42px",
                borderRadius: 4,
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                display: "flex",
                flexDirection: "column",
                position: "relative"
              }}
            >
              {/* STYLE 1: MODERN EXECUTIVE */}
              {settings.templateStyle === "modern" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 20, borderBottom: `2px solid ${settings.primaryColor}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 54, height: 54, borderRadius: 14, background: settings.primaryColor, color: "#fff", display: "grid", placeItems: "center", fontSize: "1.6rem", fontWeight: 900 }}>
                        LC
                      </div>
                      <div>
                        <h2 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 900, color: "#0f172a" }}>LEAL CONTROL ERP</h2>
                        <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Soluciones Industriales & Pesaje</div>
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>CUIT: 30-71234567-9 | IVA Responsable Inscripto</div>
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ display: "inline-block", padding: "4px 14px", borderRadius: 8, background: `${settings.primaryColor}15`, color: settings.primaryColor, fontWeight: 800, fontSize: "0.95rem", textTransform: "uppercase" }}>
                        {docTypePreview === "quote" ? "PRESUPUESTO COMERCIAL" : docTypePreview === "remito" ? "REMITO DE ENTREGA" : "FACTURA OFICIAL"}
                      </div>
                      <div style={{ fontSize: "1.2rem", fontWeight: 900, marginTop: 4, color: "#0f172a" }}>
                        N° 0001-00004829
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Fecha: 18/08/2026</div>
                    </div>
                  </div>
                </div>
              )}

              {/* STYLE 2: CLASSIC CORPORATE */}
              {settings.templateStyle === "classic" && (
                <div>
                  <div style={{ background: settings.primaryColor, color: "#ffffff", padding: "16px 20px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 900, color: "#ffffff" }}>LEAL CONTROL ERP S.A.</h2>
                      <div style={{ fontSize: "0.78rem", opacity: 0.9 }}>CUIT: 30-71234567-9 - Ingresos Brutos: 901-123456-7</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "1.1rem", fontWeight: 900 }}>
                        {docTypePreview === "quote" ? "PRESUPUESTO" : docTypePreview === "remito" ? "REMITO OFICIAL" : "FACTURA 'A'"}
                      </div>
                      <div style={{ fontSize: "0.85rem", opacity: 0.95 }}>N° 0001-00004829</div>
                    </div>
                  </div>
                </div>
              )}

              {/* STYLE 3: COMPACT TECHNICAL */}
              {settings.templateStyle === "compact" && (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 1fr", border: `1px solid ${settings.primaryColor}`, borderRadius: 6, padding: "10px 14px", marginBottom: 16 }}>
                    <div>
                      <strong style={{ fontSize: "1.1rem", color: settings.primaryColor }}>LEAL CONTROL ERP</strong>
                      <div style={{ fontSize: "0.74rem", color: "#64748b" }}>Planta Industrial - Córdoba, Argentina</div>
                    </div>
                    <div style={{ textAlign: "center", borderLeft: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", display: "grid", placeItems: "center" }}>
                      <div style={{ fontSize: "1.6rem", fontWeight: 900, color: settings.primaryColor }}>R</div>
                      <div style={{ fontSize: "0.65rem", color: "#64748b" }}>COD. 091</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "0.82rem", fontWeight: 700, color: settings.primaryColor }}>
                        {docTypePreview === "quote" ? "COTIZACIÓN TÉCNICA" : docTypePreview === "remito" ? "REMITO TÉCNICO" : "COMPROBANTE"}
                      </div>
                      <div style={{ fontSize: "1.05rem", fontWeight: 900 }}>N° 0001-00004829</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Customer Box */}
              <div
                style={{
                  margin: "16px 0",
                  padding: "14px 18px",
                  borderRadius: 8,
                  background: "#f8fafc",
                  border: `1px solid ${settings.primaryColor}33`,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  fontSize: "0.84rem"
                }}
              >
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.74rem", textTransform: "uppercase", fontWeight: 700 }}>Cliente / Razón Social:</div>
                  <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>ACINDAR GRUPO ARCELORMITTAL</strong>
                  <div style={{ color: "#475569" }}>CUIT: 30-50001091-2 (IVA Resp. Inscripto)</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: "0.74rem", textTransform: "uppercase", fontWeight: 700 }}>Entrega / Planta:</div>
                  <div>Planta Villa Constitución - Ruta 21 Km 2</div>
                  <div style={{ color: "#475569" }}>Condición de Pago: Cuenta Corriente 30 días</div>
                </div>
              </div>

              {/* Item Table */}
              <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ background: `${settings.primaryColor}14`, borderBottom: `2px solid ${settings.primaryColor}` }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: settings.primaryColor, fontWeight: 800 }}>CÓDIGO</th>
                    <th style={{ padding: "10px 12px", textAlign: "left", color: settings.primaryColor, fontWeight: 800 }}>DESCRIPCIÓN DEL ARTÍCULO</th>
                    <th style={{ padding: "10px 12px", textAlign: "center", color: settings.primaryColor, fontWeight: 800 }}>CANT.</th>
                    <th style={{ padding: "10px 12px", textAlign: "right", color: settings.primaryColor, fontWeight: 800 }}>PRECIO UNIT.</th>
                    <th style={{ padding: "10px 12px", textAlign: "right", color: settings.primaryColor, fontWeight: 800 }}>TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 700 }}>BAL-500-IND</td>
                    <td style={{ padding: "10px 12px" }}>
                      <strong>Balanza Industrial de Plataforma 500kg</strong>
                      <div style={{ fontSize: "0.76rem", color: "#64748b" }}>Cabezal en acero inoxidable con salida RS232</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>2 UN</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace" }}>$ 450.000,00</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>$ 900.000,00</td>
                  </tr>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", fontWeight: 700 }}>SERV-CAL-SAC</td>
                    <td style={{ padding: "10px 12px" }}>
                      <strong>Servicio de Calibración con Patrones Certificados INTI</strong>
                      <div style={{ fontSize: "0.76rem", color: "#64748b" }}>Emisión de certificado de trazabilidad técnica</div>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>1 GLOBAL</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace" }}>$ 120.000,00</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>$ 120.000,00</td>
                  </tr>
                </tbody>
              </table>

              {/* Totals Box */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <div style={{ width: 280, border: `1px solid ${settings.primaryColor}33`, borderRadius: 8, padding: 12, background: "#f8fafc" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 4 }}>
                    <span style={{ color: "#64748b" }}>Subtotal Neto:</span>
                    <span style={{ fontFamily: "monospace" }}>$ 1.020.000,00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", marginBottom: 6 }}>
                    <span style={{ color: "#64748b" }}>IVA (21%):</span>
                    <span style={{ fontFamily: "monospace" }}>$ 214.200,00</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontWeight: 900, paddingTop: 6, borderTop: `2px solid ${settings.primaryColor}`, color: settings.primaryColor }}>
                    <span>TOTAL:</span>
                    <span style={{ fontFamily: "monospace" }}>$ 1.234.200,00</span>
                  </div>
                </div>
              </div>

              {/* Banking Info Box */}
              {settings.showBankingInfo && (
                <div style={{ marginTop: 20, padding: "10px 14px", borderRadius: 8, background: "#f1f5f9", borderLeft: `3px solid ${settings.primaryColor}`, fontSize: "0.78rem" }}>
                  <strong style={{ color: "#0f172a" }}>Datos para Transferencias Bancarias:</strong>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4, color: "#475569" }}>
                    <div><strong>Banco:</strong> {settings.bankDetails.bankName}</div>
                    <div><strong>Tipo:</strong> {settings.bankDetails.accountType}</div>
                    <div><strong>CBU:</strong> <span style={{ fontFamily: "monospace" }}>{settings.bankDetails.cbu}</span></div>
                    <div><strong>Alias:</strong> <span style={{ fontFamily: "monospace", color: settings.primaryColor, fontWeight: 700 }}>{settings.bankDetails.alias}</span></div>
                  </div>
                </div>
              )}

              {/* Signatures Box */}
              {settings.showSignatures && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30, marginTop: 36, paddingTop: 10 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ borderTop: "1px dashed #94a3b8", width: "80%", margin: "0 auto 4px" }} />
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Firma Responsable / Comercial</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ borderTop: "1px dashed #94a3b8", width: "80%", margin: "0 auto 4px" }} />
                    <div style={{ fontSize: "0.75rem", color: "#64748b" }}>Recibí Conforme / Aclaración & DNI</div>
                  </div>
                </div>
              )}

              {/* Custom Footer Terms */}
              <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1px solid #e2e8f0", fontSize: "0.72rem", color: "#64748b", textAlign: "center", lineHeight: 1.4 }}>
                {settings.customFooterText}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
