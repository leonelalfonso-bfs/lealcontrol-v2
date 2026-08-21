import React, { useState } from "react";
import { Link } from "react-router-dom";
import { LealLogo } from "../components/LealLogo";

export function LandingPage() {
  const [activeModule, setActiveModule] = useState<"contabilidad" | "ventas" | "compras" | "finanzas" | "crm" | "produccion" | "rrhh" | "granos" | "flota">("contabilidad");
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
    `¡Hola LEAL Control! Solicito una Demo personalizada para mi empresa *${companyName}* (CUIT: ${cuit}). Contacto: ${contactName} - Tel: ${phone}. Módulos de interés: ${selectedModules.join(", ")}.`
  );
  const waUrl = `https://wa.me/5493416000000?text=${waText}`;

  return (
    <div style={{ background: "#f8fafc", color: "#0f172a", minHeight: "100vh", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      {/* Top Navbar */}
      <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(255, 255, 255, 0.94)", backdropFilter: "blur(16px)", borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 24px", height: 80, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/" style={{ display: "flex", alignItems: "center" }} title="LEAL Control ERP">
            <img src="/logo.png" alt="LEAL Control ERP" style={{ height: 60, width: "auto", objectFit: "contain" }} />
          </Link>

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
            Unificá Facturación Electrónica ARCA, Contabilidad Profesional con P&L en vivo, Finanzas, eCheqs, Compras, CRM, Producción, RRHH, Cereales & Granos y Flota en una sola nube moderna.
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
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>📊 Ventas & ARCA</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>🛒 Compras & Gastos</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>💳 Finanzas & eCheqs</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>🎯 CRM Comercial</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>⚙️ Producción & BOM</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>👥 Recursos Humanos</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>🌾 Cereales & Granos</div>
              <div style={{ padding: "8px 10px", borderRadius: 8, fontSize: "0.82rem", fontWeight: 600, color: "#475569" }}>🚛 Flota & Logística</div>
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
              {[
                { id: "contabilidad", label: "🏛️ Contabilidad & P&L" },
                { id: "ventas", label: "📊 Ventas & ARCA" },
                { id: "compras", label: "🛒 Compras & Gastos" },
                { id: "finanzas", label: "💳 Finanzas & eCheqs" },
                { id: "crm", label: "🎯 CRM Comercial" },
                { id: "produccion", label: "⚙️ Producción Industrial" },
                { id: "rrhh", label: "👥 Recursos Humanos" },
                { id: "granos", label: "🌾 Cereales & Granos" },
                { id: "flota", label: "🚛 Flota & Logística" }
              ].map((t) => (
                <button
                  key={t.id}
                  className={`tab-btn ${activeModule === t.id ? "active" : ""}`}
                  onClick={() => setActiveModule(t.id as any)}
                  style={{ padding: "8px 16px", borderRadius: 999, fontSize: "0.85rem" }}
                >
                  {t.label}
                </button>
              ))}
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

              {activeModule === "compras" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Compras & Abastecimiento</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>🛒 Compras, Solicitudes & Cuentas a Pagar</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Circuito de abastecimiento impecable. Desde solicitudes de cotización comparativas y órdenes de compra con aprobación, hasta remitos de recepción, facturas de proveedor y libro IVA compras.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Solicitudes de cotización comparativas</li>
                    <li>✅ Órdenes de compra autorizadas con límites</li>
                    <li>✅ Recepción de mercaderías con remito de ingreso</li>
                    <li>✅ Cuentas a pagar con programación de vencimientos</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#ec4899", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de Compras ➔
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

              {activeModule === "crm" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>CRM & Comercial</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>🎯 CRM & Pipeline Comercial</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Convertí más oportunidades en ventas. Seguimiento de prospectos, embudo de ventas por etapas (Nuevo, Contactado, Propuesta, Negociación, Ganada) y cotizaciones vivas.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Embudo comercial visual (Kanban)</li>
                    <li>✅ Directorio unificado de empresas y contactos clave</li>
                    <li>✅ Registro de llamadas, reuniones y acuerdos</li>
                    <li>✅ Conversión a presupuesto formal en 1 clic</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#3b82f6", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de CRM ➔
                  </button>
                </>
              )}

              {activeModule === "produccion" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Planta Industrial</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>⚙️ Producción, Fórmulas BOM & Costos</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Control de fabricación en planta. Definición de recetas y listas de materiales (BOM), emisión de órdenes de producción (OP) y costeo de mano de obra y maquinaria.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Estructuras y fórmulas de producto (BOM)</li>
                    <li>✅ Órdenes de producción con control de etapas</li>
                    <li>✅ Explosión de insumos y reserva de materia prima</li>
                    <li>✅ Costo exacto estándar vs real</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#e11d48", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de Producción ➔
                  </button>
                </>
              )}

              {activeModule === "rrhh" && (
                <>
                  <span className="badge primary" style={{ marginBottom: 12 }}>Capital Humano</span>
                  <h3 style={{ fontSize: "1.8rem", fontWeight: 800, marginBottom: 12 }}>👥 Recursos Humanos & Sueldos</h3>
                  <p style={{ color: "#475569", lineHeight: 1.6, marginBottom: 20 }}>
                    Gestión moderna del personal. Legajos digitales de empleados, control de ausencias y vacaciones, liquidación de haberes mensuales y libro sueldos digital F.931.
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 10, fontSize: "0.9rem" }}>
                    <li>✅ Legajos digitales y vencimiento de licencias</li>
                    <li>✅ Parametrización de convenios (CCT)</li>
                    <li>✅ Recibos de sueldo digitales</li>
                    <li>✅ Exportación a Libro Sueldos Digital AFIP/ARCA</li>
                  </ul>
                  <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#14b8a6", color: "#fff", fontWeight: 600 }}>
                    Solicitá tu Demo de RRHH ➔
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

              {activeModule === "compras" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>🛒 Orden de Compra #OC-2026-0419</span>
                    <span className="badge ok" style={{ fontSize: "0.7rem" }}>Aprobada</span>
                  </div>
                  <div style={{ fontSize: "0.8rem" }}>
                    <div><strong>Proveedor:</strong> YPF DIRECTO AGRO S.A.</div>
                    <div style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: 4 }}>$ 4.850.000,00</div>
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
                      <span>#9948210 Banco Galicia</span>
                      <strong>$ 850.000,00</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>#4401928 Banco Macro</span>
                      <strong>$ 1.420.000,00</strong>
                    </div>
                  </div>
                </div>
              )}

              {activeModule === "crm" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>🎯 Pipeline Comercial Activo</span>
                    <span className="badge primary" style={{ fontSize: "0.7rem" }}>Negociación</span>
                  </div>
                  <div style={{ fontSize: "0.8rem" }}>
                    <div><strong>Molino Harinero Central:</strong> $ 14.800.000</div>
                    <div style={{ color: "#059669", marginTop: 4 }}>✓ Propuesta formal enviada</div>
                  </div>
                </div>
              )}

              {activeModule === "produccion" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>⚙️ Orden de Producción #OP-088</span>
                    <span className="badge ok" style={{ fontSize: "0.7rem" }}>En Proceso (80%)</span>
                  </div>
                  <div style={{ fontSize: "0.8rem" }}>
                    <div><strong>Fertilizante Premium x 1000 Lts</strong></div>
                    <div className="muted" style={{ marginTop: 4 }}>Lote: FERT-2026-A12 • Consumo OK</div>
                  </div>
                </div>
              )}

              {activeModule === "rrhh" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>👥 Liquidación de Sueldos</span>
                    <span className="badge ok" style={{ fontSize: "0.7rem" }}>32 Legajos</span>
                  </div>
                  <div style={{ fontSize: "0.8rem" }}>
                    <div><strong>Neto a Pagar:</strong> $ 23.613.500</div>
                    <div className="muted" style={{ marginTop: 4 }}>F.931 y Libro Digital generados</div>
                  </div>
                </div>
              )}

              {activeModule === "granos" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>📋 Contrato Soja Disponible</span>
                    <span className="badge primary" style={{ fontSize: "0.7rem" }}>Fijado 75%</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "center", fontSize: "0.75rem" }}>
                    <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                      <div className="muted">CONTRATO</div>
                      <strong>500 Tn</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                      <div className="muted">ENTREGA</div>
                      <strong style={{ color: "#10b981" }}>375 Tn</strong>
                    </div>
                    <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6 }}>
                      <div className="muted">PIZARRA</div>
                      <strong style={{ color: "#2563eb" }}>$ 318.500</strong>
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
                    <div style={{ color: "#059669" }}>✓ VTV Vigente • Seguro al día</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Custom Development Section */}
      <section style={{ padding: "80px 24px", background: "#f8fafc" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)", color: "#ffffff", borderRadius: 20, padding: "48px 40px", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 36, alignItems: "center" }}>
          <div>
            <span style={{ display: "inline-block", background: "rgba(37,99,235,0.3)", color: "#93c5fd", fontWeight: 700, fontSize: "0.75rem", padding: "4px 12px", borderRadius: 999, marginBottom: 12 }}>
              🛠️ INGENIERÍA & SOFTWARE A MEDIDA
            </span>
            <h2 style={{ color: "#ffffff", fontSize: "2rem", fontWeight: 900, marginBottom: 14 }}>
              ¿Necesitás Módulos Personalizados o Integraciones Especiales?
            </h2>
            <p style={{ color: "#cbd5e1", fontSize: "0.95rem", lineHeight: 1.6, marginBottom: 20 }}>
              Sabemos que cada industria tiene procesos únicos. Desarrollamos e integramos módulos a medida para tu empresa:
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px", display: "flex", flexDirection: "column", gap: 8, fontSize: "0.88rem", color: "#e2e8f0" }}>
              <li>🔹 Conexión directa con Balanzas de camiones y tolvas</li>
              <li>🔹 Integración con autómatas industriales / PLCs / SCADA</li>
              <li>🔹 Portales B2B exclusivos para clientes o distribuidores</li>
              <li>🔹 Conexión con APIs de proveedores internacionales</li>
            </ul>
            <button className="btn" onClick={() => setShowDemoModal(true)} style={{ background: "#2563eb", color: "#fff", fontWeight: 700, padding: "12px 24px", borderRadius: 10 }}>
              💬 Consultar por Desarrollo a Medida ➔
            </button>
          </div>
          <div style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 24 }}>
            <h4 style={{ color: "#ffffff", fontSize: "1.1rem", marginBottom: 10 }}>El ERP adaptado a tu empresa</h4>
            <p style={{ color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.6 }}>
              Realizamos un relevamiento técnico y funcional de tus necesidades para cotizar y desarrollar las ampliaciones exactas que tu operación requiere.
            </p>
          </div>
        </div>
      </section>

      {/* Custom Plans Section */}
      <section style={{ padding: "80px 24px", background: "#ffffff", borderTop: "1px solid #e2e8f0" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <span style={{ display: "inline-block", background: "#dbeafe", color: "#2563eb", fontWeight: 700, fontSize: "0.8rem", padding: "4px 12px", borderRadius: 999, marginBottom: 12 }}>
              PLANES A TU MEDIDA
            </span>
            <h2 style={{ fontSize: "2.4rem", fontWeight: 900 }}>Configurá el plan exacto para tu empresa</h2>
            <p className="muted">Pagás únicamente por los módulos y la cantidad de usuarios que tu operación requiere. Sin costos ocultos.</p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
            {/* PyME */}
            <div className="card pad" style={{ background: "#f8fafc" }}>
              <h3>Plan PyME Comercial</h3>
              <p className="muted" style={{ fontSize: "0.85rem" }}>Para comercios y distribuidoras en expansión</p>
              <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#2563eb", margin: "16px 0 10px" }}>A Medida de tu Estructura</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 24px", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: 8 }}>
                <li>✓ Facturación Electrónica ARCA ilimitada</li>
                <li>✓ Stock & Depósitos en vivo</li>
                <li>✓ Finanzas & Cuentas Corrientes</li>
                <li>✓ Usuarios configurables a tu medida</li>
              </ul>
              <button className="btn" onClick={() => setShowDemoModal(true)} style={{ width: "100%", background: "#ffffff", border: "1px solid #cbd5e1", color: "#0f172a" }}>
                Solicitá Demo PyME
              </button>
            </div>

            {/* Profesional */}
            <div className="card pad" style={{ background: "#ffffff", border: "2px solid #2563eb", boxShadow: "0 12px 30px rgba(37,99,235,0.12)", position: "relative" }}>
              <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#2563eb", color: "#fff", fontSize: "0.7rem", fontWeight: 800, padding: "3px 12px", borderRadius: 999 }}>
                MÁS ELEGIDO
              </div>
              <h3>Plan Gestión Integral & P&L</h3>
              <p className="muted" style={{ fontSize: "0.85rem" }}>Control financiero, contable y comercial total</p>
              <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#2563eb", margin: "16px 0 10px" }}>Personalizado a tus Módulos</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 24px", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: 8 }}>
                <li>✓ Todo lo del Plan PyME</li>
                <li>✓ <strong>Contabilidad Profesional & P&L en vivo</strong></li>
                <li>✓ <strong>Cartera de eCheqs & Conciliación</strong></li>
                <li>✓ Compras, Proveedores y CRM Comercial</li>
                <li>✓ Portal de Cierres para tu Contador</li>
              </ul>
              <button className="btn" onClick={() => setShowDemoModal(true)} style={{ width: "100%", background: "#2563eb", color: "#fff" }}>
                Solicitá Demo Profesional
              </button>
            </div>

            {/* Agro / Industria */}
            <div className="card pad" style={{ background: "#f8fafc" }}>
              <h3>Plan Agro, Industria & Flota</h3>
              <p className="muted" style={{ fontSize: "0.85rem" }}>Para acopios, plantas de fabricación y logística</p>
              <div style={{ fontWeight: 800, fontSize: "1.2rem", color: "#2563eb", margin: "16px 0 10px" }}>Solución Corporativa Completa</div>
              <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 24px", fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: 8 }}>
                <li>✓ Todo lo del Plan Gestión Integral</li>
                <li>✓ <strong>Cereales & Granos (Pizarra/CPE)</strong></li>
                <li>✓ <strong>Producción Industrial con BOM</strong></li>
                <li>✓ <strong>Flota & Camiones con Odómetros</strong></li>
                <li>✓ Recursos Humanos & Sueldos</li>
              </ul>
              <button className="btn" onClick={() => setShowDemoModal(true)} style={{ width: "100%", background: "#ffffff", border: "1px solid #cbd5e1", color: "#0f172a" }}>
                Solicitá Demo Agro / Industria
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
                      { id: "compras", label: "🛒 Compras & Gastos" },
                      { id: "finanzas", label: "💳 Finanzas & eCheqs" },
                      { id: "crm", label: "🎯 CRM Comercial" },
                      { id: "produccion", label: "⚙️ Producción & BOM" },
                      { id: "rrhh", label: "👥 Recursos Humanos" },
                      { id: "granos", label: "🌾 Cereales & Granos" },
                      { id: "flota", label: "🚛 Flota & Logística" },
                      { id: "stock", label: "📦 Stock & Depósitos" }
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
                  Comentarios o Módulos a Medida:
                  <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Contanos brevemente qué actividad realiza tu empresa o si necesitás un desarrollo particular..." />
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

      {/* Footer (Public only) */}
      <footer style={{ background: "#0f172a", color: "#94a3b8", padding: "60px 24px 30px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
          <div>
            <img src="/logo.png" alt="LEAL Control ERP" style={{ height: 50, width: "auto", objectFit: "contain", marginBottom: 8 }} />
            <p style={{ fontSize: "0.85rem", margin: 0, color: "#64748b" }}>
              Sistema de Gestión Integral Cloud ERP 2.0 • Argentina
            </p>
          </div>
          <div style={{ display: "flex", gap: 20, fontSize: "0.85rem", alignItems: "center" }}>
            <Link to="/login" style={{ color: "#94a3b8" }}>Ingreso al Sistema</Link>
            <button onClick={() => setShowDemoModal(true)} style={{ background: "transparent", border: "none", color: "#38bdf8", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem" }}>
              🚀 Solicitá tu Demo Online
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
