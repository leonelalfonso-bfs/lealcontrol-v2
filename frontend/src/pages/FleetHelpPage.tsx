import React from "react";
import { Link } from "react-router-dom";

export function FleetHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Guía & Documentación: Gestión de Flota Vehicular</h1>
          <p className="muted">Control de parque automotor, alertas de VTV/Seguros, mantenimiento y combustible</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/flota" className="btn btn-primary" style={{ background: "#0d9488" }}>
            🚛 Ver Unidades de Flota
          </Link>
          <Link to="/flota/combustible" className="btn btn-outline">
            ⛽ Control de Combustible
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "24px", maxWidth: "900px" }}>
        {/* Card 1: Ficha del Vehiculo & Vencimientos */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>1. Parque Automotor & Alertas de Vencimiento</h2>
          <p>
            Permite administrar camionetas, camiones, furgones y autoelevadores con su correspondiente ficha técnica:
          </p>
          <ul>
            <li><strong>Identificación:</strong> Dominio/Patente, Marca, Modelo, Año, N° de Chasis (VIN), N° de Motor y Odómetro actual en KM.</li>
            <li><strong>Alertas Preventivas:</strong> El sistema analiza automáticamente las fechas de vencimiento de <strong>VTV/RTO, Pólizas de Seguro, Cédulas y Obleas de GNC</strong> y notifica con un banner destacado las unidades que vencen en los próximos 30 días.</li>
            <li><strong>Choferes Asignados:</strong> Control de categoría de licencia de conducir habilitante (B1, C, E1) y vencimiento del psicofísico LINTI/CNRT.</li>
          </ul>
        </section>

        {/* Card 2: Planes de Mantenimiento por KM */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>2. Mantenimiento Preventivo & Correctivo</h2>
          <p>
            Seguimiento de la vida útil del vehículo y control de costos de taller:
          </p>
          <ul>
            <li><strong>Services Preventivos:</strong> Cambio de aceite, filtros y pastillas de freno con registro del odómetro al momento del trabajo.</li>
            <li><strong>Cálculo de Próximo Service:</strong> Programa automáticamente el próximo mantenimiento por kilometraje (ej: a los 10.000 KM siguientes).</li>
            <li><strong>Mantenimiento Correctivo:</strong> Registro de reparaciones mecánicas y eléctricas con taller propio o externo y vinculación de costos.</li>
          </ul>
        </section>

        {/* Card 3: Control de Combustible & Rendimiento KM/L */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>3. Control de Combustible & Detección de Desvíos</h2>
          <p>
            Al ingresar cada ticket de carga (Litros, Importe, Odómetro en KM y Estación de Servicio como YPF en Ruta o Shell Flota), el sistema calcula en tiempo real:
          </p>
          <div style={{ background: "rgba(13, 148, 136, 0.08)", padding: "16px", borderRadius: "8px", border: "1px solid rgba(13, 148, 136, 0.3)" }}>
            <strong style={{ color: "#0d9488" }}>Fórmula de Rendimiento:</strong>
            <div style={{ fontFamily: "monospace", fontSize: "1.05rem", marginTop: "4px" }}>
              (KM Carga Actual - KM Carga Anterior) / Litros Cargados = <strong>KM / Litro</strong>
            </div>
            <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: "6px" }}>
              Permite detectar rápidamente fallas de inyección o posibles consumos anómalos en ruta.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
