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
  const {
    settings,
    updateGlobal,
    updateQuote,
    updateRemito,
    updateInvoice,
    updatePurchaseOrder,
    resetSettings
  } = useDocumentTemplate();

  const [activeTab, setActiveTab] = useState<"global" | "quote" | "remito" | "invoice" | "purchase">("quote");
  const [docTypePreview, setDocTypePreview] = useState<"quote" | "remito" | "invoice" | "purchase">("quote");
  const [savedAlert, setSavedAlert] = useState(false);

  const handleSave = () => {
    setSavedAlert(true);
    setTimeout(() => setSavedAlert(false), 3000);
  };

  const currentPrimary = settings.global.primaryColor;

  return (
    <div className="workspace-page page-wide" style={{ maxWidth: 1440, margin: "0 auto" }}>
      {/* Header */}
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow">CONFIGURACIÓN VISUAL ERP</span>
          <h1>Plantillas y Diseño de Documentos</h1>
          <p className="muted">
            Personalizá los modelos, colores y leyendas específicas de Presupuestos, Remitos, Facturas y Órdenes de Compra.
          </p>
        </div>

        <div className="toolbar">
          <Link to="/configuracion" className="btn btn-outline">
            ← Volver a Configuración
          </Link>
          <button
            type="button"
            onClick={resetSettings}
            className="btn btn-outline"
            style={{ color: "#b91c1c", borderColor: "#fca5a5" }}
          >
            ↺ Restaurar Predeterminados
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="btn btn-primary"
            style={{ background: currentPrimary }}
          >
            ✓ Guardar Preferencias
          </button>
        </div>
      </div>

      {savedAlert && (
        <div className="alert ok" style={{ marginBottom: 20, background: "rgba(16, 185, 129, 0.15)", color: "#065f46", border: "1px solid #10b981", padding: "12px 16px", borderRadius: "8px" }}>
          ✓ Configuración guardada correctamente. Se aplicará a todas las impresiones y descargas en PDF.
        </div>
      )}

      {/* Tabs Selector */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", marginBottom: "20px" }}>
        {[
          { id: "quote", label: "📑 Presupuesto Comercial", previewTarget: "quote" as const },
          { id: "remito", label: "🚚 Remito de Entrega", previewTarget: "remito" as const },
          { id: "invoice", label: "🧾 Factura Fiscal (ARCA)", previewTarget: "invoice" as const },
          { id: "purchase", label: "🛒 Orden de Compra", previewTarget: "purchase" as const },
          { id: "global", label: "🎨 Estilo & Color de Marca", previewTarget: null }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setActiveTab(tab.id as any);
              if (tab.previewTarget) setDocTypePreview(tab.previewTarget);
            }}
            style={{
              padding: "10px 18px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: activeTab === tab.id ? 800 : 500,
              color: activeTab === tab.id ? currentPrimary : "#64748b",
              borderBottom: activeTab === tab.id ? `3px solid ${currentPrimary}` : "none",
              fontSize: "0.92rem"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Split Editor */}
      <div style={{ display: "grid", gridTemplateColumns: "460px 1fr", gap: 24, alignItems: "flex-start" }}>
        {/* Left Column: Form Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* TAB 1: GLOBAL BRAND & STYLES */}
          {activeTab === "global" && (
            <div className="card pad stack">
              <h3 style={{ margin: 0, color: "#0f172a" }}>🎨 Estilo Visual & Paleta de Colores</h3>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Define la apariencia estética aplicada a todos los encabezados y tablas del ERP.
              </p>

              <div>
                <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Modelo de Diseño:</label>
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
                      name: "Técnico / Compacto",
                      badge: "Logística",
                      desc: "Aprovechamiento máximo de hoja para muchos ítems, con espacio para firmas de recepción."
                    }
                  ].map((tpl) => (
                    <div
                      key={tpl.id}
                      onClick={() => updateGlobal({ templateStyle: tpl.id })}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 10,
                        border: `2px solid ${settings.global.templateStyle === tpl.id ? currentPrimary : "#e2e8f0"}`,
                        background: settings.global.templateStyle === tpl.id ? "rgba(13, 148, 136, 0.05)" : "#ffffff",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <strong>{tpl.name}</strong>
                        <span style={{ fontSize: "0.7rem", padding: "2px 8px", borderRadius: "10px", background: "#f1f5f9", fontWeight: 700 }}>
                          {tpl.badge}
                        </span>
                      </div>
                      <p style={{ margin: "4px 0 0", fontSize: "0.78rem", color: "#64748b" }}>{tpl.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Color Primario de Acento:</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {COLOR_PRESETS.map((preset) => (
                    <button
                      key={preset.hex}
                      type="button"
                      onClick={() => updateGlobal({ primaryColor: preset.hex })}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 8,
                        border: `2px solid ${settings.global.primaryColor === preset.hex ? preset.hex : "#e2e8f0"}`,
                        background: settings.global.primaryColor === preset.hex ? `${preset.hex}15` : "#ffffff",
                        cursor: "pointer",
                        fontSize: "0.8rem",
                        fontWeight: settings.global.primaryColor === preset.hex ? 700 : 500
                      }}
                    >
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: preset.hex }} />
                      {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: QUOTE / PRESUPUESTO */}
          {activeTab === "quote" && (
            <div className="card pad stack">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>📑 Plantilla de Presupuesto</h3>
                <span style={{ fontSize: "0.72rem", background: "rgba(13, 148, 136, 0.1)", color: currentPrimary, padding: "3px 8px", borderRadius: "8px", fontWeight: 700 }}>Comercial</span>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Condiciones de cotización, garantías, validez y anexos técnicos con fotos.
              </p>

              <label>
                Título del Encabezado
                <input
                  type="text"
                  value={settings.quote.headerTitle}
                  onChange={(e) => updateQuote({ headerTitle: e.target.value })}
                />
              </label>

              <div className="grid-2">
                <label>
                  Validez Predeterminada (Días)
                  <input
                    type="number"
                    value={settings.quote.defaultValidDays}
                    onChange={(e) => updateQuote({ defaultValidDays: Number(e.target.value) || 15 })}
                  />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", paddingTop: "24px" }}>
                  <input
                    type="checkbox"
                    checked={settings.quote.showTechnicalOffer}
                    onChange={(e) => updateQuote({ showTechnicalOffer: e.target.checked })}
                  />
                  <strong>Anexo Técnico con Fotos</strong>
                </label>
              </div>

              <label>
                Condiciones de Pago
                <input
                  type="text"
                  value={settings.quote.paymentTerms}
                  onChange={(e) => updateQuote({ paymentTerms: e.target.value })}
                  placeholder="Ej: Contado contra entrega / eCheq a 30 días"
                />
              </label>

              <label>
                Plazos de Entrega
                <input
                  type="text"
                  value={settings.quote.deliveryTerms}
                  onChange={(e) => updateQuote({ deliveryTerms: e.target.value })}
                  placeholder="Ej: Inmediata / 7 a 10 días hábiles"
                />
              </label>

              <label>
                Garantía Ofrecida
                <input
                  type="text"
                  value={settings.quote.warrantyTerms}
                  onChange={(e) => updateQuote({ warrantyTerms: e.target.value })}
                  placeholder="Ej: 12 meses contra defectos de fabricación"
                />
              </label>

              <label>
                Leyenda Comercial al Pie (Footer)
                <textarea
                  rows={3}
                  value={settings.quote.customFooterText}
                  onChange={(e) => updateQuote({ customFooterText: e.target.value })}
                />
              </label>
            </div>
          )}

          {/* TAB 3: REMITO OFICIAL */}
          {activeTab === "remito" && (
            <div className="card pad stack">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>🚚 Plantilla de Remito de Entrega</h3>
                <span style={{ fontSize: "0.72rem", background: "rgba(59, 130, 246, 0.1)", color: "#1e40af", padding: "3px 8px", borderRadius: "8px", fontWeight: 700 }}>Logística</span>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Datos de transporte, destino en planta, leyendas de traslado y firma de recepción.
              </p>

              <label>
                Título del Encabezado
                <input
                  type="text"
                  value={settings.remito.headerTitle}
                  onChange={(e) => updateRemito({ headerTitle: e.target.value })}
                />
              </label>

              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.remito.showCarrierInfo}
                    onChange={(e) => updateRemito({ showCarrierInfo: e.target.checked })}
                  />
                  <span>Mostrar Transporte y Chofer</span>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={settings.remito.showSignaturesBox}
                    onChange={(e) => updateRemito({ showSignaturesBox: e.target.checked })}
                  />
                  <span>Recuadro de Firma y DNI</span>
                </label>
              </div>

              <label>
                Cláusula Legal de Transporte
                <textarea
                  rows={2}
                  value={settings.remito.carrierLegalText}
                  onChange={(e) => updateRemito({ carrierLegalText: e.target.value })}
                  placeholder="La mercadería viaja por cuenta y orden del comprador..."
                />
              </label>

              <label>
                Leyenda de Recepción Conforme
                <textarea
                  rows={2}
                  value={settings.remito.receptionClause}
                  onChange={(e) => updateRemito({ receptionClause: e.target.value })}
                  placeholder="Recibí conforme la cantidad de bultos..."
                />
              </label>

              <label>
                Texto al Pie
                <input
                  type="text"
                  value={settings.remito.customFooterText}
                  onChange={(e) => updateRemito({ customFooterText: e.target.value })}
                />
              </label>
            </div>
          )}

          {/* TAB 4: FACTURA FISCAL */}
          {activeTab === "invoice" && (
            <div className="card pad stack">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>🧾 Plantilla de Factura Fiscal (ARCA)</h3>
                <span style={{ fontSize: "0.72rem", background: "rgba(16, 185, 129, 0.1)", color: "#047857", padding: "3px 8px", borderRadius: "8px", fontWeight: 700 }}>Fiscal & Cobranzas</span>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Datos bancarios para acreditación de transferencias, instrucciones de pago y CAE.
              </p>

              <label>
                Título del Comprobante
                <input
                  type="text"
                  value={settings.invoice.headerTitle}
                  onChange={(e) => updateInvoice({ headerTitle: e.target.value })}
                />
              </label>

              <div style={{ border: "1px solid #e2e8f0", padding: "14px", borderRadius: "8px", background: "#f8fafc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <strong style={{ fontSize: "0.88rem", color: "#0f172a" }}>🏦 Datos Bancarios para Transferencias</strong>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={settings.invoice.showBankingInfo}
                      onChange={(e) => updateInvoice({ showBankingInfo: e.target.checked })}
                    />
                    <span>Mostrar en Factura</span>
                  </label>
                </div>

                <div className="grid-2">
                  <label>
                    Entidad Bancaria
                    <input
                      type="text"
                      value={settings.invoice.bankDetails.bankName}
                      onChange={(e) =>
                        updateInvoice({
                          bankDetails: { ...settings.invoice.bankDetails, bankName: e.target.value }
                        })
                      }
                      placeholder="Ej: Banco Galicia"
                    />
                  </label>
                  <label>
                    Tipo de Cuenta
                    <input
                      type="text"
                      value={settings.invoice.bankDetails.accountType}
                      onChange={(e) =>
                        updateInvoice({
                          bankDetails: { ...settings.invoice.bankDetails, accountType: e.target.value }
                        })
                      }
                      placeholder="Ej: CC Especial en Pesos"
                    />
                  </label>
                </div>

                <div className="grid-2" style={{ marginTop: "8px" }}>
                  <label>
                    CBU (22 Dígitos)
                    <input
                      type="text"
                      value={settings.invoice.bankDetails.cbu}
                      onChange={(e) =>
                        updateInvoice({
                          bankDetails: { ...settings.invoice.bankDetails, cbu: e.target.value }
                        })
                      }
                      style={{ fontFamily: "monospace" }}
                    />
                  </label>
                  <label>
                    Alias Bancario
                    <input
                      type="text"
                      value={settings.invoice.bankDetails.alias}
                      onChange={(e) =>
                        updateInvoice({
                          bankDetails: { ...settings.invoice.bankDetails, alias: e.target.value }
                        })
                      }
                      style={{ fontFamily: "monospace", fontWeight: 700 }}
                    />
                  </label>
                </div>
              </div>

              <label>
                Instrucciones de Pago / Envío de Comprobante
                <textarea
                  rows={2}
                  value={settings.invoice.paymentInstructions}
                  onChange={(e) => updateInvoice({ paymentInstructions: e.target.value })}
                  placeholder="Enviar comprobante de pago indicando N° de factura a..."
                />
              </label>

              <label>
                Cláusula de Intereses por Mora
                <input
                  type="text"
                  value={settings.invoice.interestLegalText}
                  onChange={(e) => updateInvoice({ interestLegalText: e.target.value })}
                />
              </label>
            </div>
          )}

          {/* TAB 5: ORDEN DE COMPRA */}
          {activeTab === "purchase" && (
            <div className="card pad stack">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>🛒 Plantilla de Orden de Compra</h3>
                <span style={{ fontSize: "0.72rem", background: "rgba(249, 115, 22, 0.1)", color: "#c2410c", padding: "3px 8px", borderRadius: "8px", fontWeight: 700 }}>Abastecimiento</span>
              </div>
              <p className="muted" style={{ fontSize: "0.82rem" }}>
                Horarios de descarga en planta e instrucciones de facturación a proveedores.
              </p>

              <label>
                Título del Encabezado
                <input
                  type="text"
                  value={settings.purchaseOrder.headerTitle}
                  onChange={(e) => updatePurchaseOrder({ headerTitle: e.target.value })}
                />
              </label>

              <label>
                Horarios de Recepción en Planta
                <input
                  type="text"
                  value={settings.purchaseOrder.receptionSchedule}
                  onChange={(e) => updatePurchaseOrder({ receptionSchedule: e.target.value })}
                  placeholder="Ej: Lunes a Viernes de 07:00 a 16:00 hs en Planta Central."
                />
              </label>

              <label>
                Instrucciones de Facturación a Proveedores
                <textarea
                  rows={3}
                  value={settings.purchaseOrder.billingInstructions}
                  onChange={(e) => updatePurchaseOrder({ billingInstructions: e.target.value })}
                  placeholder="Facturar a nombre de... y enviar archivo PDF y XML a..."
                />
              </label>

              <label>
                Términos y Condiciones para Proveedores
                <textarea
                  rows={2}
                  value={settings.purchaseOrder.supplierTerms}
                  onChange={(e) => updatePurchaseOrder({ supplierTerms: e.target.value })}
                  placeholder="La aceptación de esta orden implica conformidad..."
                />
              </label>
            </div>
          )}
        </div>

        {/* Right Column: Live Mockup Preview */}
        <div style={{ position: "sticky", top: 20 }}>
          <div className="card pad" style={{ background: "#f8fafc", borderColor: "#cbd5e1" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <strong style={{ fontSize: "0.95rem", color: "#334155" }}>
                👁️ Vista Previa en Vivo ({docTypePreview.toUpperCase()})
              </strong>

              <div style={{ display: "flex", gap: 6 }}>
                {[
                  { id: "quote", label: "Presupuesto" },
                  { id: "remito", label: "Remito" },
                  { id: "invoice", label: "Factura" },
                  { id: "purchase", label: "Orden Compra" }
                ].map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setDocTypePreview(btn.id as any)}
                    style={{
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: `1px solid ${docTypePreview === btn.id ? currentPrimary : "#cbd5e1"}`,
                      background: docTypePreview === btn.id ? currentPrimary : "#ffffff",
                      color: docTypePreview === btn.id ? "#ffffff" : "#475569",
                      fontSize: "0.74rem",
                      fontWeight: 700,
                      cursor: "pointer"
                    }}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Simulated Document Sheet */}
            <div
              style={{
                background: "#ffffff",
                padding: "24px",
                borderRadius: "8px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                fontSize: "0.78rem",
                color: "#1e293b",
                minHeight: "480px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                borderTop: `4px solid ${currentPrimary}`
              }}
            >
              {/* Header Mockup */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: `2px solid ${currentPrimary}33`, paddingBottom: "12px", marginBottom: "14px" }}>
                  <div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 900, color: currentPrimary }}>
                      LEAL CONTROL ERP S.A.
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      CUIT: 30-71548962-9 • IVA Responsable Inscripto
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      Luis Braile 705, San Lorenzo, Santa Fe
                    </div>
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 900, color: currentPrimary, textTransform: "uppercase" }}>
                      {docTypePreview === "quote" && settings.quote.headerTitle}
                      {docTypePreview === "remito" && settings.remito.headerTitle}
                      {docTypePreview === "invoice" && settings.invoice.headerTitle}
                      {docTypePreview === "purchase" && settings.purchaseOrder.headerTitle}
                    </div>
                    <div style={{ fontSize: "0.85rem", fontWeight: 700, fontFamily: "monospace" }}>
                      {docTypePreview === "quote" && "PRE-0001-00000421"}
                      {docTypePreview === "remito" && "R-0001-00000155"}
                      {docTypePreview === "invoice" && "FACTURA A N° 0001-00000892"}
                      {docTypePreview === "purchase" && "OC-0001-00000098"}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "#64748b" }}>
                      Fecha: {new Date().toLocaleDateString("es-AR")}
                    </div>
                  </div>
                </div>

                {/* Recipient Box */}
                <div style={{ background: "#f8fafc", padding: "10px 12px", borderRadius: "6px", marginBottom: "14px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      <strong>Cliente / Razón Social:</strong> ACINDAR S.A.
                      <div style={{ fontSize: "0.72rem", color: "#64748b" }}>CUIT: 30-50001091-2 • Villa Constitución</div>
                    </div>
                    {docTypePreview === "remito" && (
                      <div style={{ textAlign: "right" }}>
                        <strong>Destino / Planta de Entrega:</strong>
                        <div style={{ fontSize: "0.72rem", color: "#0f172a", fontWeight: 700 }}>Planta 2 - Depósito Laminación</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sample Items Table */}
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
                  <thead>
                    <tr style={{ background: `${currentPrimary}15`, color: currentPrimary, fontSize: "0.72rem" }}>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Cant.</th>
                      <th style={{ padding: "6px 8px", textAlign: "left" }}>Descripción</th>
                      {docTypePreview !== "remito" && <th style={{ padding: "6px 8px", textAlign: "right" }}>P. Unitario</th>}
                      {docTypePreview !== "remito" && <th style={{ padding: "6px 8px", textAlign: "right" }}>Total</th>}
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px 8px" }}>2 un</td>
                      <td style={{ padding: "6px 8px" }}>Sensor de Presión Digital 4-20mA WIKA</td>
                      {docTypePreview !== "remito" && <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>$ 145.000,00</td>}
                      {docTypePreview !== "remito" && <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>$ 290.000,00</td>}
                    </tr>
                    <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                      <td style={{ padding: "6px 8px" }}>1 serv</td>
                      <td style={{ padding: "6px 8px" }}>Calibración y Certificado de Patrón</td>
                      {docTypePreview !== "remito" && <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace" }}>$ 85.000,00</td>}
                      {docTypePreview !== "remito" && <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>$ 85.000,00</td>}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Document-Specific Bottom Sections */}
              <div>
                {/* 1. Quote Specifics */}
                {docTypePreview === "quote" && (
                  <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px", borderLeft: `3px solid ${currentPrimary}`, fontSize: "0.74rem", marginBottom: "10px" }}>
                    <div><strong>Condición de Pago:</strong> {settings.quote.paymentTerms}</div>
                    <div><strong>Plazo de Entrega:</strong> {settings.quote.deliveryTerms}</div>
                    <div><strong>Garantía:</strong> {settings.quote.warrantyTerms}</div>
                    <div style={{ marginTop: "4px", color: "#64748b", fontSize: "0.7rem" }}>{settings.quote.customFooterText}</div>
                  </div>
                )}

                {/* 2. Remito Specifics */}
                {docTypePreview === "remito" && (
                  <div>
                    {settings.remito.showCarrierInfo && (
                      <div style={{ background: "#f1f5f9", padding: "8px 10px", borderRadius: "6px", fontSize: "0.74rem", marginBottom: "8px" }}>
                        <strong>Transporte:</strong> Expreso San Lorenzo • <strong>Chofer:</strong> Carlos Gómez (DNI 28.491.029) • <strong>Patente:</strong> AF192ZZ
                      </div>
                    )}

                    <div style={{ fontSize: "0.7rem", color: "#475569", marginBottom: "6px" }}>
                      {settings.remito.carrierLegalText}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "#475569", fontStyle: "italic", marginBottom: "10px" }}>
                      "{settings.remito.receptionClause}"
                    </div>

                    {settings.remito.showSignaturesBox && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", borderTop: "1px dashed #cbd5e1", paddingTop: "10px", marginTop: "10px", fontSize: "0.7rem" }}>
                        <div>
                          <div style={{ borderBottom: "1px solid #94a3b8", height: "24px" }} />
                          <div style={{ textAlign: "center", color: "#64748b", marginTop: "2px" }}>Firma Receptor</div>
                        </div>
                        <div>
                          <div style={{ borderBottom: "1px solid #94a3b8", height: "24px" }} />
                          <div style={{ textAlign: "center", color: "#64748b", marginTop: "2px" }}>Aclaración & DNI</div>
                        </div>
                        <div>
                          <div style={{ borderBottom: "1px solid #94a3b8", height: "24px" }} />
                          <div style={{ textAlign: "center", color: "#64748b", marginTop: "2px" }}>Fecha / Hora</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. Invoice Specifics (Banking Data) */}
                {docTypePreview === "invoice" && (
                  <div>
                    {settings.invoice.showBankingInfo && (
                      <div style={{ background: "rgba(13, 148, 136, 0.08)", padding: "10px", borderRadius: "6px", border: `1px solid ${currentPrimary}44`, fontSize: "0.74rem", marginBottom: "8px" }}>
                        <strong style={{ color: currentPrimary, display: "block", marginBottom: "3px" }}>
                          🏦 Datos para Transferencia Bancaria (Cobranzas):
                        </strong>
                        <div><strong>Banco:</strong> {settings.invoice.bankDetails.bankName} ({settings.invoice.bankDetails.accountType})</div>
                        <div><strong>CBU:</strong> <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{settings.invoice.bankDetails.cbu}</span> • <strong>Alias:</strong> <span style={{ fontFamily: "monospace", fontWeight: 800 }}>{settings.invoice.bankDetails.alias}</span></div>
                        <div style={{ fontSize: "0.7rem", color: "#64748b", marginTop: "4px" }}>
                          {settings.invoice.paymentInstructions}
                        </div>
                      </div>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px dashed #cbd5e1", paddingTop: "8px", fontSize: "0.7rem", color: "#64748b" }}>
                      <div>CAE N°: <strong>74928192847291</strong> • Vto. CAE: <strong>29/08/2026</strong></div>
                      <div style={{ color: "#047857", fontWeight: 700 }}>[ Código QR Oficial ARCA / AFIP ]</div>
                    </div>
                  </div>
                )}

                {/* 4. Purchase Order Specifics */}
                {docTypePreview === "purchase" && (
                  <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "6px", borderLeft: `3px solid ${currentPrimary}`, fontSize: "0.74rem" }}>
                    <div><strong>Horario de Recepción:</strong> {settings.purchaseOrder.receptionSchedule}</div>
                    <div style={{ marginTop: "4px" }}><strong>Instrucciones Facturación:</strong> {settings.purchaseOrder.billingInstructions}</div>
                    <div style={{ marginTop: "4px", color: "#64748b", fontSize: "0.7rem" }}>{settings.purchaseOrder.supplierTerms}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
