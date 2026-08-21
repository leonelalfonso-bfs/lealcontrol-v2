import React, { useState } from "react";
import { Link } from "react-router-dom";
import { LealLogo } from "../components/LealLogo";

export function LandingPage() {
  const [activeModule, setActiveModule] = useState<"contabilidad" | "granos" | "flota" | "finanzas" | "ventas">("contabilidad");
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [companyName, setCompanyName] = useState("");
  const [cuit, setCuit] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [users, setUsers] = useState("1-5");
  const [notes, setNotes] = useState("");
  const [selectedModules, setSelectedModules] = useState<string[]>(["ventas", "contabilidad", "finanzas"]);

  const toggleModuleSelection = (mod: string) => {
    if (selectedModules.includes(mod)) {
      setSelectedModules(selectedModules.filter(m => m !== mod));
    } else {
      setSelectedModules([...selectedModules, mod]);
    }
  };

  const handleDemoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      await fetch("/api/v1/public/demo-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName,
          cuit,
          contactFullName: contactName,
          email,
          phone,
          estimatedUsers: users,
          interestedModulesJson: JSON.stringify(selectedModules),
          message: notes
        })
      });
    } catch (err) {
      console.warn("Offline/CORS fallback:", err);
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  const waText = encodeURIComponent(
    `¡Hola LEAL Control! Solicito una Demo para mi empresa *${companyName}* (CUIT: ${cuit}). Contacto: ${contactName} - Tel: ${phone}. Módulos de interés: ${selectedModules.join(", ")}.`
  );
  const waUrl = `https://wa.me/5493416000000?text=${waText}`;

  return (
    <div style={{ background: "#f8fafc", color: "#0f172a", minHeight: "100vh", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Top Navbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(255, 255, 255, 0.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", height: 72, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <LealLogo size={36} showText animated />
            <span style={{ fontSize: "0.75rem", fontWeight: 800, background: "#dbeafe", color: "#2563eb", padding: "2px 8px", borderRadius: 999 }}>
              v2.0 CLOUD
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link to="/login" className="btn ghost" style={{ fontSize: "0.88rem", fontWeight: 600 }}>
              🔐 Ingresar al Sistema
            </Link>
            <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#2563eb", color: "#fff", fontWeight: 600, boxShadow: "0 4px 12px rgba(37,99,235,0.25)" }}>
              🚀 Solicitá tu Demo
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ padding: "70px 24px 50px", textAlign: "center", background: "radial-gradient(circle at 50% -10%, rgba(37, 99, 235, 0.08) 0%, transparent 65%)" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <span style={{ display: "inline-block", background: "#dbeafe", color: "#2563eb", fontWeight: 700, fontSize: "0.8rem", padding: "6px 16px", borderRadius: 999, marginBottom: 20, border: "1px solid rgba(37,99,235,0.2)" }}>
            🚀 LEAL CONTROL ERP 2.0 • LA PLATAFORMA DE GESTIÓN MÁS COMPLETA DE ARGENTINA
          </span>

          <h1 style={{ fontSize: "3.2rem", fontWeight: 900, lineHeight: 1.15, marginBottom: 20, letterSpacing: "-0.03em" }}>
            El ERP Integral que Transforma la Gestión de tu <span style={{ color: "#2563eb" }}>Empresa</span>
          </h1>

          <p style={{ fontSize: "1.2rem", color: "#475569", lineHeight: 1.6, marginBottom: 36 }}>
            Unificá Facturación Electrónica ARCA, Contabilidad Profesional con P&L en tiempo real, Finanzas, eCheqs, Cereales & Granos, Flota y Stock en una sola nube moderna.
          </p>

          <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 40 }}>
            <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#2563eb", color: "#fff", padding: "14px 28px", fontSize: "1rem", fontWeight: 700, borderRadius: 14, boxShadow: "0 6px 20px rgba(37,99,235,0.3)" }}>
              ✨ Solicitá tu Demo Personalizada
            </button>
            <Link to="/login" className="btn ghost" style={{ background: "#ffffff", border: "1px solid #cbd5e1", padding: "14px 24px", fontSize: "1rem", fontWeight: 600, borderRadius: 14 }}>
              Acceso Clientes ➔
            </Link>
          </div>
        </div>

        {/* Real Live UI Mockup Window */}
        <div style={{ maxWidth: 1100, margin: "0 auto", background: "#ffffff", borderRadius: 20, border: "1px solid #cbd5e1", boxShadow: "0 20px 40px -10px rgba(15,23,42,0.12)", overflow: "hidden", textAlign: "left" }}>
          {/* Header Bar */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 18px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f59e0b" }} />
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#10b981" }} />
            </div>
            <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", padding: "3px 20px", borderRadius: 6, fontSize: "0.75rem", fontFamily: "monospace", color: "#64748b" }}>
              https://erp.lealcontrol.com/contabilidad
            </div>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>
              🏢 LEAL CONTROL S.A. (CUIT 30-71548962-9)
            </div>
          </div>

          {/* Body */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 440 }}>
            {/* Sidebar */}
            <div style={{ background: "#f8fafc", borderRight: "1px solid #e2e8f0", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#94a3b8", padding: "0 8px", marginBottom: 4 }}>MÓDULOS ACTIVOS</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>📊 Hoy & Métricas</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 700, background: "#dbeafe", color: "#2563eb" }}>🏛️ Contabilidad & P&L</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>🌾 Cereales & Granos</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>💳 Finanzas & eCheqs</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>🚛 Flota & Logística</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>📦 Stock & Depósitos</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>🛒 Compras & Gastos</div>
            </div>

            {/* Content Area */}
            <div style={{ padding: "24px 28px", background: "#ffffff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
                <div>
                  <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0 }}>📊 Tablero Ejecutivo P&L (Estado de Resultados)</h3>
                  <span style={{ fontSize: "0.8rem", color: "#64748b" }}>Agosto 2026 • Asientos contables automáticos</span>
                </div>
                <span className="badge ok" style={{ fontSize: "0.75rem", height: "fit-content" }}>🟢 Partida Doble OK</span>
              </div>

              {/* 4 KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", padding: 12, borderRadius: 10 }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#1e40af", textTransform: "uppercase" }}>INGRESOS VENTAS</span>
                  <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#1e3a8a", marginTop: 2 }}>$ 28.450.000</div>
                  <span style={{ fontSize: "0.68rem", color: "#059669", fontWeight: 600 }}>↑ +18.4%</span>
                </div>
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", padding: 12, borderRadius: 10 }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#991b1b", textTransform: "uppercase" }}>COSTO MERCADERÍAS</span>
                  <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#7f1d1d", marginTop: 2 }}>$ 16.820.000</div>
                  <span style={{ fontSize: "0.68rem", color: "#64748b" }}>CMV 59.1%</span>
                </div>
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: 12, borderRadius: 10 }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#166534", textTransform: "uppercase" }}>MARGEN BRUTO</span>
                  <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#14532d", marginTop: 2 }}>$ 11.630.000</div>
                  <span style={{ fontSize: "0.68rem", color: "#16a34a", fontWeight: 700 }}>40.9% Margen</span>
                </div>
                <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", padding: 12, borderRadius: 10 }}>
                  <span style={{ fontSize: "0.68rem", fontWeight: 700, color: "#6b21a8", textTransform: "uppercase" }}>EBITDA</span>
                  <div style={{ fontWeight: 900, fontSize: "1.1rem", color: "#581c87", marginTop: 2 }}>$ 8.940.000</div>
                  <span style={{ fontSize: "0.68rem", color: "#7c3aed", fontWeight: 700 }}>31.4% Neto</span>
                </div>
              </div>

              {/* Table preview */}
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", background: "#ffffff" }}>
                <span style={{ fontWeight: 700, fontSize: "0.8rem", display: "block", marginBottom: 8 }}>Últimos Asientos del Libro Diario</span>
                <table className="table" style={{ width: "100%", fontSize: "0.75rem", margin: 0 }}>
                  <thead>
                    <tr>
                      <th>Asiento</th>
                      <th>Concepto / Comprobante</th>
                      <th style={{ textAlign: "right" }}>Debe ($)</th>
                      <th style={{ textAlign: "right" }}>Haber ($)</th>
                      <th style={{ textAlign: "center" }}>Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code>#1043</code></td>
                      <td>Cobranza Recibo #RC-00912 • Transferencia Galicia</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>$ 850.000,00</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>$ 850.000,00</td>
                      <td style={{ textAlign: "center" }}><span className="badge ok">Automático</span></td>
                    </tr>
                    <tr>
                      <td><code>#1042</code></td>
                      <td>Factura de Venta A 0004-00018942 • San Lorenzo S.A.</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>$ 1.815.000,00</td>
                      <td style={{ textAlign: "right", fontWeight: 600 }}>$ 1.815.000,00</td>
                      <td style={{ textAlign: "center" }}><span className="badge ok">Automático</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Modules Showcase */}
      <section style={{ padding: "80px 24px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ display: "inline-block", background: "#dbeafe", color: "#2563eb", fontWeight: 700, fontSize: "0.8rem", padding: "4px 12px", borderRadius: 999, marginBottom: 12 }}>
              VISTAS REALES DE MÓDULOS 2.0
            </span>
            <h2 style={{ fontSize: "2.4rem", fontWeight: 900, marginBottom: 10 }}>Todo lo que tu empresa necesita en una sola suite</h2>
            <p className="muted">Hacé clic en cada pestaña para conocer la experiencia y funcionalidad de cada área de LEAL Control.</p>

            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", marginTop: 24 }}>
              <button
                className={`tab-btn ${activeModule === "contabilidad" ? "active" : ""}`}
                onClick={() => setActiveModule("contabilidad")}
                style={{ padding: "10px 18px", borderRadius: 999 }}
              >
                🏛️ Contabilidad & P&L
              </button>
              <button
                className={`tab-btn ${activeModule === "granos" ? "active" : ""}`}
                onClick={() => setActiveModule("granos")}
                style={{ padding: "10px 18px", borderRadius: 999 }}
              >
                🌾 Cereales & Granos
              </button>
              <button
                className={`tab-btn ${activeModule === "flota" ? "active" : ""}`}
                onClick={() => setActiveModule("flota")}
                style={{ padding: "10px 18px", borderRadius: 999 }}
              >
                🚛 Flota & Logística
              </button>
              <button
                className={`tab-btn ${activeModule === "finanzas" ? "active" : ""}`}
                onClick={() => setActiveModule("finanzas")}
                style={{ padding: "10px 18px", borderRadius: 999 }}
              >
                💳 Finanzas & eCheqs
              </button>
              <button
                className={`tab-btn ${activeModule === "ventas" ? "active" : ""}`}
                onClick={() => setActiveModule("ventas")}
                style={{ padding: "10px 18px", borderRadius: 999 }}
              >
                📊 Ventas & ARCA
              </button>
            </div>
          </div>

          {/* Module Detail Card */}
          <div style={{ background: "#f8fafc", borderRadius: 20, border: "1px solid #e2e8f0", padding: 36, display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 36, alignItems: "center" }}>
            <div>
              {activeModule === "contabilidad" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Módulo Destacado</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>🏛️ Contabilidad Profesional & P&L en Vivo</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Motor de asientos automáticos por venta, compra y cobranza. Libro Diario, Libro Mayor, Sumas y Saldos a 8 Columnas y Portal para Estudios Contables con exportación de Libro IVA Digital para ARCA.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Plan de 77 cuentas estándar argentinas</li>
                    <li>✅ Asientos automáticos inmediatos (Debe == Haber)</li>
                    <li>✅ Balance de 8 columnas oficial exportable a Excel y PDF</li>
                    <li>✅ Conciliación bancaria con Smart Match e imputación en 1 clic</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#2563eb", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de Contabilidad ➔
                  </button>
                </>
              )}

              {activeModule === "granos" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Agro & Granos</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>🌾 Cereales & Granos: Acopio y Corretaje</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Gestión integral de contratos granarios (compraventa, consignación, canje), fijaciones a pizarra Rosario / MATba, cartas de porte electrónicas (CPE) y control de mermas de humedad.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Contratos disponibles y a fijar por cereal</li>
                    <li>✅ Fijaciones parciales automáticas con cotización de pizarra</li>
                    <li>✅ Descarga de CPE de ARCA y control de balanza</li>
                    <li>✅ Liquidaciones de mermas de humedad y zaranda</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#10b981", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de Granos ➔
                  </button>
                </>
              )}

              {activeModule === "flota" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Transporte & Flota</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>🚛 Flota, Vehículos & Logística</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Control total de camiones, utilitarios y maquinaria. Odómetro, consumo de combustible $/km, historial de servicios mecánicos y alertas automáticas de vencimiento de VTV, RTO y seguros.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Odómetros y consumo promedio L/100km</li>
                    <li>✅ Mantenimiento preventivo programado</li>
                    <li>✅ Alertas legales: VTV, RTO, Seguros, Senasa</li>
                    <li>✅ Costo total por kilómetro recorrido</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#f59e0b", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de Flota ➔
                  </button>
                </>
              )}

              {activeModule === "finanzas" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Finanzas & Tesorería</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>💳 Finanzas, Cajas & Cartera de eCheqs</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Gestión ágil de fondos. Cuentas corrientes vivas, cartera digital de eCheqs y cheques físicos con endoso/depósito, cobranzas con MercadoPago PSP y proyección de Cash Flow.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Cartera unificada de eCheqs y cheques de terceros</li>
                    <li>✅ Cuentas corrientes de clientes y proveedores</li>
                    <li>✅ Cobranzas integradas con QR y links de pago</li>
                    <li>✅ Flujo de fondos (Cash Flow) proyectado</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#6366f1", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de Finanzas ➔
                  </button>
                </>
              )}

              {activeModule === "ventas" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Ventas & Facturación</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>📊 Facturación Electrónica ARCA (AFIP)</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Emisión instantánea de Facturas A, B, C, MiPyME con CAE directo por web service. Presupuestos con envío automático a WhatsApp y remitos electrónicos.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Facturación directa con CAE de ARCA (AFIP)</li>
                    <li>✅ Envío de presupuestos y facturas por WhatsApp</li>
                    <li>✅ Remitos de entrega vinculados con stock</li>
                    <li>✅ Libro IVA Ventas digital (RG 4597)</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#06b6d4", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de Facturación ➔
                  </button>
                </>
              )}
            </div>

            {/* Preview Box */}
            <div style={{ background: "#ffffff", borderRadius: 16, border: "1px solid #cbd5e1", padding: 24, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
              {activeModule === "contabilidad" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>📖 Asiento Contable #1042</span>
                    <span className="badge ok" style={{ fontSize: "0.7rem" }}>Balanceado</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", lineHeight: 1.8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span><code>1.1.02.001</code> Deudores por Ventas</span>
                      <strong style={{ color: "#2563eb" }}>$ 1.815.000,00 (Debe)</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span><code>4.1.01</code> Venta de Mercaderías</span>
                      <strong style={{ color: "#059669" }}>$ 1.500.000,00 (Haber)</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span><code>2.1.02.001</code> IVA Débito Fiscal 21%</span>
                      <strong style={{ color: "#059669" }}>$ 315.000,00 (Haber)</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeModule === "granos" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>📋 Contrato Soja Disponible #2026-CTR-884</span>
                    <span className="badge primary" style={{ fontSize: "0.7rem" }}>Fijado 75%</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "center", fontSize: "0.75rem" }}>
                    <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                      <div className="muted">CONTRATADO</div>
                      <strong>500,00 Tn</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                      <div className="muted">ENTREGADO</div>
                      <strong style={{ color: "#10b981" }}>375,40 Tn</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                      <div className="muted">PIZARRA</div>
                      <strong style={{ color: "#2563eb" }}>$ 318.500/Tn</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeModule === "flota" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>🚛 Scania R450 • AF-892-LC</span>
                    <span className="badge ok" style={{ fontSize: "0.7rem" }}>Operativo</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div><strong>Odómetro:</strong> 142.850 Km</div>
                    <div><strong>Rendimiento:</strong> 32,4 L / 100 Km</div>
                    <div style={{ color: "#059669" }}>✓ VTV Vigente hasta Nov 2026 • Seguro al día</div>
                  </div>
                </div>
              )}

              {activeModule === "finanzas" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>🎫 Cartera de eCheqs</span>
                    <span className="badge primary" style={{ fontSize: "0.7rem" }}>12 Valores</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>#9948210 Banco Galicia (28/08)</span>
                      <strong>$ 850.000,00</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>#4401928 Banco Macro (05/09)</span>
                      <strong>$ 1.420.000,00</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeModule === "ventas" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>📄 Factura Electrónica A #0004-00018942</span>
                    <span className="badge ok" style={{ fontSize: "0.7rem" }}>CAE Oficial</span>
                  </div>
                  <div style={{ fontSize: "0.8rem" }}>
                    <div><strong>Cliente:</strong> SAN LORENZO CEREALES S.A.</div>
                    <div style={{ fontSize: "1.2rem", fontWeight: 900, color: "#2563eb", marginTop: 8 }}>$ 1.815.000,00</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing / Demo Plans */}
      <section style={{ padding: "80px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ display: "inline-block", background: "#dbeafe", color: "#2563eb", fontWeight: 700, fontSize: "0.8rem", padding: "4px 12px", borderRadius: 999, marginBottom: 12 }}>
              PLANES TRANSPARENTES
            </span>
            <h2 style={{ fontSize: "2.4rem", fontWeight: 900 }}>Elegí el plan a tu medida</h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            {/* PyME */}
            <div className="card pad" style={{ background: "#ffffff" }}>
              <h3>Plan PyME Comercial</h3>
              <p className="muted" style={{ fontSize: "0.85rem" }}>Facturación y control comercial básico</p>
              <div style={{ fontSize: "2.4rem", fontWeight: 900, margin: "16px 0 8px" }}>$ 45.000 <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: 500 }}>/ mes</span></div>
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 24px", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: 8 }}>
                <li>✓ Facturación Electrónica ARCA ilimitada</li>
                <li>✓ Stock & Depósitos en vivo</li>
                <li>✓ Finanzas & Cuentas Corrientes</li>
                <li>✓ Hasta 5 usuarios</li>
              </ul>
              <button className="btn" onClick={() => setShowDemoModal(true)} style={{ width: "100%", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#0f172a" }}>
                Solicitá Demo PyME
              </button>
            </div>

            {/* Profesional */}
            <div className="card pad" style={{ background: "#ffffff", border: "2px solid #2563eb", boxShadow: "0 12px 30px rgba(37,99,235,0.15)", position: "relative" }}>
              <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#2563eb", color: "#fff", fontSize: "0.7rem", fontWeight: 800, padding: "3px 12px", borderRadius: 999 }}>
                MÁS ELEGIDO
              </div>
              <h3>Plan Profesional & P&L</h3>
              <p className="muted" style={{ fontSize: "0.85rem" }}>Control financiero y contable integral</p>
              <div style={{ fontSize: "2.4rem", fontWeight: 900, margin: "16px 0 8px" }}>$ 75.000 <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: 500 }}>/ mes</span></div>
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 24px", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: 8 }}>
                <li>✓ Todo lo del Plan PyME</li>
                <li>✓ <strong>Contabilidad Profesional & P&L en vivo</strong></li>
                <li>✓ <strong>Cartera de eCheqs & Conciliación</strong></li>
                <li>✓ Portal de Cierres para tu Contador</li>
                <li>✓ Hasta 15 usuarios</li>
              </ul>
              <button className="btn" onClick={() => setShowDemoModal(true)} style={{ width: "100%", background: "#2563eb", color: "#fff" }}>
                Solicitá Demo Profesional
              </button>
            </div>

            {/* Agro */}
            <div className="card pad" style={{ background: "#ffffff" }}>
              <h3>Plan Agro & Logística</h3>
              <p className="muted" style={{ fontSize: "0.85rem" }}>Para acopios, corretaje y transporte</p>
              <div style={{ fontSize: "2.4rem", fontWeight: 900, margin: "16px 0 8px" }}>$ 110.000 <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: 500 }}>/ mes</span></div>
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 24px", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: 8 }}>
                <li>✓ Todo lo del Plan Profesional</li>
                <li>✓ <strong>Módulo Cereales & Granos (Pizarra/CPE)</strong></li>
                <li>✓ <strong>Módulo Flota & Camiones</strong></li>
                <li>✓ Recursos Humanos & Sueldos</li>
                <li>✓ Usuarios ilimitados</li>
              </ul>
              <button className="btn" onClick={() => setShowDemoModal(true)} style={{ width: "100%", background: "#f1f5f9", border: "1px solid #cbd5e1", color: "#0f172a" }}>
                Solicitá Demo Agro
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Demo Modal */}
      {showDemoModal && (
        <div className="modal-backdrop" onClick={() => setShowDemoModal(false)}>
          <div className="modal-card" style={{ maxWidth: 640, background: "#ffffff", color: "#0f172a" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <span className="badge primary" style={{ fontSize: "0.7rem", marginBottom: 6 }}>LEAL CONTROL ERP 2.0</span>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0 }}>🚀 Solicitá tu Demo Personalizada</h3>
                <p className="muted" style={{ fontSize: "0.85rem", marginTop: 4 }}>
                  Completá los datos y te habilitaremos un usuario con los módulos exactos que tu empresa necesita.
                </p>
              </div>
              <button className="btn ghost" onClick={() => setShowDemoModal(false)}>✕</button>
            </div>

            {submitted ? (
              <div style={{ textAlign: "center", padding: "30px 10px" }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
                <h3 style={{ color: "#059669", fontSize: "1.4rem", marginBottom: 8 }}>¡Solicitud Recibida con Éxito!</h3>
                <p className="muted" style={{ maxWidth: 450, margin: "0 auto 20px", fontSize: "0.9rem" }}>
                  Hemos registrado a <strong>{companyName}</strong>. Nuestro equipo comercial está preparando tu entorno de prueba y te contactará a la brevedad.
                </p>
                <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                  <a href={waUrl} target="_blank" rel="noreferrer" className="btn" style={{ background: "#25d366", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
                    📲 Chatear por WhatsApp Ahora
                  </a>
                  <button className="btn ghost" onClick={() => { setShowDemoModal(false); setSubmitted(false); }}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleDemoSubmit} className="stack" style={{ gap: 14 }}>
                <div className="grid-2" style={{ gap: 12 }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Empresa / Razón Social *
                    <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required placeholder="Ej. Agropecuaria San José S.A." />
                  </label>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    CUIT de la Empresa *
                    <input value={cuit} onChange={(e) => setCuit(e.target.value)} required placeholder="30-71548962-9" />
                  </label>
                </div>

                <div className="grid-2" style={{ gap: 12 }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Nombre del Responsable *
                    <input value={contactName} onChange={(e) => setContactName(e.target.value)} required placeholder="Juan Manuel Rossi" />
                  </label>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Email de Contacto *
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="juan@tuempresa.com.ar" />
                  </label>
                </div>

                <div className="grid-2" style={{ gap: 12 }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Teléfono / WhatsApp *
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="341 6123456" />
                  </label>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                    Cantidad de Usuarios Estimada
                    <select value={users} onChange={(e) => setUsers(e.target.value)}>
                      <option value="1-5">1 a 5 usuarios</option>
                      <option value="6-15">6 a 15 usuarios</option>
                      <option value="16-50">16 a 50 usuarios</option>
                      <option value="50+">Más de 50 usuarios (Enterprise)</option>
                    </select>
                  </label>
                </div>

                <div>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: 6 }}>
                    Módulos de Mayor Interés:
                  </label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                    {[
                      { id: "ventas", label: "📊 Ventas & ARCA" },
                      { id: "contabilidad", label: "🏛️ Contabilidad & P&L" },
                      { id: "finanzas", label: "💳 Finanzas & eCheqs" },
                      { id: "granos", label: "🌾 Cereales & Granos" },
                      { id: "flota", label: "🚛 Flota & Logística" },
                      { id: "stock", label: "📦 Stock & Depósitos" },
                      { id: "compras", label: "🛒 Compras & Gastos" },
                      { id: "rrhh", label: "👥 Recursos Humanos" }
                    ].map((m) => (
                      <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", background: "#f8fafc", padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={selectedModules.includes(m.id)}
                          onChange={() => toggleModuleSelection(m.id)}
                        />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </div>

                <label style={{ fontSize: "0.85rem", fontWeight: 600 }}>
                  Comentarios o Requerimientos:
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contanos brevemente qué actividad realiza tu empresa..." />
                </label>

                <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                  <button type="button" className="btn ghost" onClick={() => setShowDemoModal(false)}>
                    Cancelar
                  </button>
                  <button className="btn" type="submit" disabled={submitting} style={{ background: "#2563eb", color: "#fff", fontWeight: 600 }}>
                    {submitting ? "Enviando..." : "🚀 Enviar Solicitud de Demo"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{ background: "#0f172a", color: "#94a3b8", padding: "60px 24px 30px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
          <div>
            <LealLogo size={32} showText />
            <p style={{ fontSize: "0.85rem", marginTop: 8, color: "#64748b" }}>
              Sistema de Gestión Integral Cloud ERP 2.0 • Argentina
            </p>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: "0.85rem" }}>
            <Link to="/login" style={{ color: "#94a3b8" }}>Ingreso al Sistema</Link>
            <Link to="/superadmin" style={{ color: "#94a3b8" }}>SuperAdmin</Link>
            <a href="mailto:contacto@lealcontrol.com" style={{ color: "#94a3b8" }}>Contacto</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
