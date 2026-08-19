import React from "react";
import { Link } from "react-router-dom";

export const InventoryHelpPage: React.FC = () => {
  return (
    <div className="workspace-page page-wide" style={{ maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div className="page-head" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow">MANUAL OPERATIVO Y GUÍA</span>
          <h1>Manual de Inventario, Depósitos y Kardex</h1>
          <p className="muted">
            Guía práctica para la administración de stock, trazabilidad y clasificación de artículos.
          </p>
        </div>
        <div className="toolbar">
          <Link to="/inventario" className="btn btn-outline">
            ← Volver a Inventario
          </Link>
          <Link to="/productos" className="btn btn-outline">
            Catálogo de Productos
          </Link>
        </div>
      </div>

      {/* 1. ¿Qué es el Kardex? Explicación Fundamental */}
      <section className="card pad" style={{ marginBottom: 28, position: "relative", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <span style={{ fontSize: "1.8rem" }}>📖</span>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.3rem", color: "var(--ink)" }}>
              ¿Qué es el Kardex y para qué sirve en la empresa?
            </h2>
            <div style={{ fontSize: "0.82rem", color: "var(--primary)", fontWeight: 700 }}>
              Registro cronológico inmutable de existencias
            </div>
          </div>
        </div>

        <p style={{ lineHeight: 1.6, fontSize: "0.95rem", color: "var(--ink)" }}>
          El <strong>Kardex</strong> es el libro contable y operativo de inventario. Funciona de manera idéntica al 
          extracto bancario de una cuenta de banco: registra de forma cronológica cada unidad que ingresa, 
          cada unidad que egresa y el <strong>saldo final resultante</strong> en cada depósito físico.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginTop: 18 }}>
          <div className="card pad" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem", color: "var(--ink)" }}>🔍 Trazabilidad y Control</h3>
            <p className="muted" style={{ fontSize: "0.86rem", margin: 0, lineHeight: 1.5 }}>
              Permite auditar en cualquier momento quién, cuándo y con qué documento oficial se retiró o ingresó un artículo. 
              Elimina los faltantes misteriosos en depósitos y móviles técnicos.
            </p>
          </div>

          <div className="card pad" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem", color: "var(--ink)" }}>📋 Respaldo con Documentos</h3>
            <p className="muted" style={{ fontSize: "0.86rem", margin: 0, lineHeight: 1.5 }}>
              Cada movimiento de Kardex exige un comprobante de respaldo: Remito oficial, Recepción de compra del proveedor, 
              Orden de Trabajo de servicio técnico o Ajuste de inventario justificado.
            </p>
          </div>

          <div className="card pad" style={{ background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: "1rem", color: "var(--ink)" }}>💰 Valorización de Stock</h3>
            <p className="muted" style={{ fontSize: "0.86rem", margin: 0, lineHeight: 1.5 }}>
              Mantiene actualizado el costo promedio ponderado de compra y el valor del patrimonio almacenado en todos los depósitos.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Clasificación Profesional de Artículos */}
      <section className="card pad" style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: 16, color: "var(--ink)" }}>
          Clasificación Operativa del Catálogo
        </h2>

        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, padding: "14px 16px", borderRadius: 14, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>🛍️</span>
              <div>
                <strong style={{ display: "block", color: "var(--ink)" }}>Venta Directa</strong>
                <span className="badge ok" style={{ fontSize: "0.7rem" }}>Mueve Stock</span>
              </div>
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--ink-soft)", lineHeight: 1.45 }}>
              Mercadería de reventa que se compra a proveedores y se comercializa tal cual sin transformación. 
              Ingresa por Recepción de Compra y egresa mediante Remito o Factura de Venta.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, padding: "14px 16px", borderRadius: 14, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>🛠️</span>
              <div>
                <strong style={{ display: "block", color: "var(--ink)" }}>Servicio Intangible</strong>
                <span className="badge off" style={{ fontSize: "0.7rem" }}>Sin Stock</span>
              </div>
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--ink-soft)", lineHeight: 1.45 }}>
              Calibraciones con patrones, reparaciones en taller o campo, horas técnicas, mano de obra y fletes. 
              Disponibilidad ilimitada. Nunca genera stock negativo ni requiere asignación de depósito.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, padding: "14px 16px", borderRadius: 14, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>🔧</span>
              <div>
                <strong style={{ display: "block", color: "var(--ink)" }}>Repuesto Técnico</strong>
                <span className="badge warn" style={{ fontSize: "0.7rem" }}>Mueve Stock</span>
              </div>
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--ink-soft)", lineHeight: 1.45 }}>
              Celdas de carga, placas electrónicas, indicadores y cables que se almacenan en depósitos centrales o móviles técnicos 
              para ser consumidos en Órdenes de Trabajo de reparación o servicio.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, padding: "14px 16px", borderRadius: 14, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>🧩</span>
              <div>
                <strong style={{ display: "block", color: "var(--ink)" }}>Producto Ensamblado</strong>
                <span className="badge ok" style={{ fontSize: "0.7rem" }}>Mueve Stock</span>
              </div>
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--ink-soft)", lineHeight: 1.45 }}>
              Equipos armados a partir de componentes o kits comerciales que descuentan sus partes asociadas al confirmarse el armado.
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, padding: "14px 16px", borderRadius: 14, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>🏭</span>
              <div>
                <strong style={{ display: "block", color: "var(--ink)" }}>Producto Fabricado</strong>
                <span className="badge ok" style={{ fontSize: "0.7rem" }}>Mueve Stock</span>
              </div>
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--ink-soft)", lineHeight: 1.45 }}>
              Bienes elaborados en planta que requieren Orden de Producción, lista de materiales estructurada y centros de trabajo con cálculo de mano de obra.
            </div>
          </div>
        </div>
      </section>

      {/* 3. Circuito de Movimientos en el Sistema */}
      <section className="card pad">
        <h2 style={{ fontSize: "1.25rem", marginBottom: 16, color: "var(--ink)" }}>
          Circuito de Movimientos de Inventario
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 }}>
          <div style={{ padding: 18, borderRadius: 16, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>📥</div>
            <h3 style={{ margin: "0 0 6px", fontSize: "1rem", color: "var(--ok)" }}>Entradas (+)</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.84rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
              <li>Recepción de orden de compra</li>
              <li>Devolución de mercadería de cliente</li>
              <li>Ingreso por finalización de fabricación</li>
              <li>Ajuste positivo por inventario físico</li>
            </ul>
          </div>

          <div style={{ padding: 18, borderRadius: 16, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>📤</div>
            <h3 style={{ margin: "0 0 6px", fontSize: "1rem", color: "var(--danger)" }}>Salidas (-)</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.84rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
              <li>Despacho con Remito oficial</li>
              <li>Consumo de repuestos en Orden de Trabajo</li>
              <li>Consumo de insumos en fabricación</li>
              <li>Baja por rotura, merma o garantía</li>
            </ul>
          </div>

          <div style={{ padding: 18, borderRadius: 16, background: "var(--surface-muted)", border: "1px solid var(--surface-border)" }}>
            <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>🔄</div>
            <h3 style={{ margin: "0 0 6px", fontSize: "1rem", color: "var(--accent)" }}>Transferencias (=)</h3>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.84rem", color: "var(--ink-soft)", lineHeight: 1.6 }}>
              <li>Envío de Depósito Central a Móvil Técnico</li>
              <li>Reubicación entre depósitos de sucursal</li>
              <li>Reingreso de repuestos no utilizados</li>
              <li>Asignación de custodia a técnico en campo</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};
