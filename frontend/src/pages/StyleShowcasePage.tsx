import React, { useState } from "react";
import { useTheme, LIGHT_THEME, DARK_THEME } from "../context/ThemeContext";

export const StyleShowcasePage: React.FC = () => {
  const { mode, setMode, isDark, currentConfig } = useTheme();

  // Interactive mock state
  const [toggleState, setToggleState] = useState(true);
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [amountInput, setAmountInput] = useState("12450.00");
  const [activeTab, setActiveTab] = useState("kpis");

  const mockRows = [
    { id: "FAC-A-0001-00004921", cliente: "Tech Solutions S.A.", cuit: "30-71234567-9", fecha: "18/08/2026", monto: 1450200.0, estado: "Cobrada", estadoTipo: "ok" },
    { id: "FAC-A-0001-00004922", cliente: "Agroindustrial del Sur", cuit: "33-68912344-9", fecha: "17/08/2026", monto: 3820450.0, estado: "Pendiente", estadoTipo: "warn" },
    { id: "FAC-B-0001-00001205", cliente: "Laboratorios Cuyo SRL", cuit: "30-55412890-4", fecha: "16/08/2026", monto: 890100.0, estado: "Cobrada", estadoTipo: "ok" },
    { id: "FAC-A-0001-00004923", cliente: "Distribuidora San Juan", cuit: "30-70984123-2", fecha: "15/08/2026", monto: 540000.0, estado: "Vencida", estadoTipo: "danger" },
  ];

  return (
    <div className="workspace-page page-wide" style={{ width: "100%" }}>
      {/* Header */}
      <div className="page-head" style={{ marginBottom: 28 }}>
        <div>
          <span className="eyebrow">DISEÑO Y EXPERIENCIA VISUAL</span>
          <h1>Identidad Visual: Modo Claro y Modo Oscuro</h1>
          <p className="muted">
            Leal Control ERP 2.0 unificado con <strong>Liquid Glass</strong> (Modo Claro) y <strong>Nordic Slate & Emerald</strong> (Modo Oscuro).
          </p>
        </div>
        <div className="toolbar">
          <div style={{ display: "flex", gap: 8, background: "var(--surface-muted)", padding: 4, borderRadius: 14, border: "1px solid var(--surface-border)" }}>
            <button
              type="button"
              className={`btn ${!isDark ? "" : "ghost"}`}
              style={{ padding: "6px 14px", fontSize: "0.84rem", borderRadius: 10 }}
              onClick={() => setMode("light")}
            >
              ☀️ Modo Claro
            </button>
            <button
              type="button"
              className={`btn ${isDark ? "" : "ghost"}`}
              style={{ padding: "6px 14px", fontSize: "0.84rem", borderRadius: 10 }}
              onClick={() => setMode("dark")}
            >
              🌙 Modo Oscuro
            </button>
          </div>
        </div>
      </div>

      {/* Dual Theme Selector Cards */}
      <section style={{ marginBottom: 36 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Card Modo Claro */}
          <div
            onClick={() => setMode("light")}
            className="card pad"
            style={{
              cursor: "pointer",
              border: !isDark ? "2px solid var(--primary)" : "1px solid var(--surface-border)",
              transform: !isDark ? "translateY(-3px)" : "none",
              boxShadow: !isDark ? "0 14px 32px var(--primary-glow)" : "var(--shadow-card)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {!isDark && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "var(--primary)",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: "0.72rem",
                  fontWeight: 800
                }}
              >
                ACTIVO AHORA
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: "1.8rem" }}>☀️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--ink)" }}>Modo Claro: {LIGHT_THEME.name}</h3>
                <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--accent)" }}>{LIGHT_THEME.inspiration}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: LIGHT_THEME.previewColors.bg, border: "1px solid rgba(0,0,0,0.1)" }} title="Fondo" />
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: LIGHT_THEME.previewColors.surface, border: "1px solid rgba(0,0,0,0.1)" }} title="Panel" />
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: LIGHT_THEME.previewColors.primary }} title="Primario (Teal)" />
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: LIGHT_THEME.previewColors.accent }} title="Acento (Azul)" />
            </div>

            <p className="muted" style={{ fontSize: "0.86rem", margin: "0 0 16px", lineHeight: 1.45 }}>
              {LIGHT_THEME.tagline}
            </p>

            <button type="button" className={`btn ${!isDark ? "" : "btn-outline"}`} style={{ width: "100%" }}>
              {!isDark ? "✓ Modo Claro en uso" : "Activar Modo Claro"}
            </button>
          </div>

          {/* Card Modo Oscuro */}
          <div
            onClick={() => setMode("dark")}
            className="card pad"
            style={{
              cursor: "pointer",
              border: isDark ? "2px solid var(--primary)" : "1px solid var(--surface-border)",
              transform: isDark ? "translateY(-3px)" : "none",
              boxShadow: isDark ? "0 14px 32px var(--primary-glow)" : "var(--shadow-card)",
              position: "relative",
              overflow: "hidden"
            }}
          >
            {isDark && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  background: "var(--primary)",
                  color: "#fff",
                  borderRadius: 999,
                  padding: "3px 10px",
                  fontSize: "0.72rem",
                  fontWeight: 800
                }}
              >
                ACTIVO AHORA
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ fontSize: "1.8rem" }}>🌙</span>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--ink)" }}>Modo Oscuro: {DARK_THEME.name}</h3>
                <div style={{ fontSize: "0.76rem", fontWeight: 700, color: "var(--accent)" }}>{DARK_THEME.inspiration}</div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DARK_THEME.previewColors.bg, border: "1px solid rgba(255,255,255,0.15)" }} title="Fondo" />
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DARK_THEME.previewColors.surface, border: "1px solid rgba(255,255,255,0.15)" }} title="Panel" />
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DARK_THEME.previewColors.primary }} title="Primario (Esmeralda)" />
              <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: DARK_THEME.previewColors.accent }} title="Acento (Oro)" />
            </div>

            <p className="muted" style={{ fontSize: "0.86rem", margin: "0 0 16px", lineHeight: 1.45 }}>
              {DARK_THEME.tagline}
            </p>

            <button type="button" className={`btn ${isDark ? "" : "btn-outline"}`} style={{ width: "100%" }}>
              {isDark ? "✓ Modo Oscuro en uso" : "Activar Modo Oscuro"}
            </button>
          </div>
        </div>
      </section>

      {/* Tabs for Showcase categories */}
      <div style={{ display: "flex", gap: 10, borderBottom: "1px solid var(--line)", marginBottom: 24 }}>
        {[
          { id: "kpis", label: "📊 KPIs y Métricas" },
          { id: "tables", label: "📑 Tablas y Grillas" },
          { id: "forms", label: "✍️ Formularios y Controles" },
          { id: "buttons", label: "🔘 Botones y Badges" }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ padding: "10px 18px", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
          >
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Showcase Content */}

      {/* 1. KPIs */}
      {activeTab === "kpis" && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-head">
            <div>
              <h2>Tarjetas de Rendimiento y KPIs Ejecutivos</h2>
              <p className="muted">Micro-bordes reflectivos, degradados de estado y jerarquía tipográfica.</p>
            </div>
          </div>

          <div className="kpi kpi-4">
            <div className="card">
              <span className="muted">Facturación del Mes</span>
              <strong>$ 18.450.200</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="badge ok">+ 14.8% vs mes ant.</span>
                <small className="muted">142 comprobantes</small>
              </div>
            </div>

            <div className="card">
              <span className="muted">Disponibilidad en Bancos</span>
              <strong>$ 6.890.120</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="badge ok">3 cuentas activas</span>
                <small className="muted">Conciliadas</small>
              </div>
            </div>

            <div className="card">
              <span className="muted">Cartera Cheques / eCheqs</span>
              <strong>$ 4.120.000</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="badge warn">8 por vencer en 7d</span>
              </div>
            </div>

            <div className="card">
              <span className="muted">Eficiencia Producción</span>
              <strong>98.4 %</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                <span className="badge ok">0.4% Merma</span>
                <small className="muted">18 OTs activas</small>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. Tables */}
      {activeTab === "tables" && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-head">
            <div>
              <h2>Tablas de Datos y Grillas Operativas</h2>
              <p className="muted">Contraste de líneas, espaciado de celdas y hover interactivo.</p>
            </div>
            <div className="toolbar">
              <input type="text" placeholder="Buscar cliente o comprobante..." style={{ width: 260 }} />
              <button className="btn">+ Nueva Factura</button>
            </div>
          </div>

          <div className="card pad" style={{ padding: 0 }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Comprobante</th>
                    <th>Cliente / Razón Social</th>
                    <th>CUIT</th>
                    <th>Fecha</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                    <th>Estado</th>
                    <th style={{ textAlign: "center" }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {mockRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 800, color: "var(--primary)" }}>{r.id}</td>
                      <td>
                        <strong>{r.cliente}</strong>
                      </td>
                      <td className="muted">{r.cuit}</td>
                      <td>{r.fecha}</td>
                      <td style={{ textAlign: "right", fontWeight: 800 }}>
                        {new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(r.monto)}
                      </td>
                      <td>
                        <span className={`badge ${r.estadoTipo}`}>{r.estado}</span>
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                          <button className="btn btn-outline" style={{ padding: "4px 8px", fontSize: "0.76rem" }}>
                            Ver
                          </button>
                          <button className="btn ghost" style={{ padding: "4px 8px", fontSize: "0.76rem" }}>
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 3. Forms */}
      {activeTab === "forms" && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-head">
            <div>
              <h2>Formularios, Entradas y Controles</h2>
              <p className="muted">Anillos de foco suaves, inputs monetarios y selectores de alta legibilidad.</p>
            </div>
          </div>

          <div className="card pad">
            <div className="grid-3" style={{ marginBottom: 18 }}>
              <label>
                Razón Social / Nombre Comercial
                <input type="text" defaultValue="Leal Control Tecnología S.A." placeholder="Ingresá la razón social" />
              </label>

              <label>
                Moneda de Operación
                <select value={selectedCurrency} onChange={(e) => setSelectedCurrency(e.target.value)}>
                  <option value="ARS">Pesos Argentinos (ARS)</option>
                  <option value="USD">Dólar Estadounidense (USD)</option>
                  <option value="EUR">Euros (EUR)</option>
                </select>
              </label>

              <label>
                Importe Base ({selectedCurrency})
                <input
                  type="number"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                />
              </label>
            </div>

            <div className="grid-2" style={{ marginBottom: 18 }}>
              <label>
                Alícuota IVA
                <select defaultValue="21">
                  <option value="21">21.0 % (General)</option>
                  <option value="10.5">10.5 % (Reducida)</option>
                  <option value="27">27.0 % (Telecom / Energía)</option>
                  <option value="0">0.0 % (Exento)</option>
                </select>
              </label>

              <label>
                Fecha de Emisión
                <input type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </label>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
              <label style={{ flexDirection: "row", alignItems: "center", cursor: "pointer", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={toggleState}
                  onChange={(e) => setToggleState(e.target.checked)}
                  style={{ width: 18, height: 18 }}
                />
                <span>Habilitar control de stock automático y Kardex</span>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* 4. Buttons and Badges */}
      {activeTab === "buttons" && (
        <section style={{ marginBottom: 32 }}>
          <div className="section-head">
            <div>
              <h2>Botonera y Elementos de Estado</h2>
              <p className="muted">Microinteracciones y jerarquía visual de acciones.</p>
            </div>
          </div>

          <div className="card pad" style={{ display: "grid", gap: 20 }}>
            <div>
              <h4 style={{ margin: "0 0 10px", color: "var(--ink)" }}>Variantes de Botones</h4>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn">Botón Primario</button>
                <button className="btn btn-outline">Botón Outline</button>
                <button className="btn ghost">Botón Ghost</button>
                <button className="btn btn-danger">Botón Peligro</button>
                <button className="btn" style={{ background: "var(--ok)", borderColor: "var(--ok)" }}>
                  Botón Éxito
                </button>
                <button className="btn" disabled style={{ opacity: 0.5, cursor: "not-allowed" }}>
                  Deshabilitado
                </button>
              </div>
            </div>

            <div>
              <h4 style={{ margin: "0 0 10px", color: "var(--ink)" }}>Badges de Estado</h4>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <span className="badge ok">✓ Aprobado / Confirmado</span>
                <span className="badge warn">⏳ Pendiente de Aprobación</span>
                <span className="badge danger">✕ Rechazado / Vencido</span>
                <span className="badge off">◌ Inactivo / Borrador</span>
              </div>
            </div>

            <div>
              <h4 style={{ margin: "0 0 10px", color: "var(--ink)" }}>Banners y Alertas</h4>
              <div className="alert ok" style={{ margin: 0, marginBottom: 10 }}>
                ✓ Comprobante ARCA emitido exitosamente. CAE asignado: <strong>74391209381920</strong>
              </div>
              <div className="alert" style={{ margin: 0 }}>
                ⚠️ Atención: La cuenta corriente del cliente supera el límite de crédito acordado.
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
