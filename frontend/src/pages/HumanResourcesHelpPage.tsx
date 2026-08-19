import React from "react";
import { Link } from "react-router-dom";

export function HumanResourcesHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <h1>Guía & Documentación: Recursos Humanos & Liquidación</h1>
          <p className="muted">Manual operativo conforme a LCT 20.744, convenios CCT y Libro de Sueldos Digital AFIP</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <Link to="/rrhh/empleados" className="btn btn-outline">
            👥 Nómina de Colaboradores
          </Link>
          <Link to="/rrhh/liquidaciones" className="btn btn-primary" style={{ background: "#0d9488" }}>
            💰 Liquidación de Sueldos
          </Link>
        </div>
      </div>

      <div style={{ display: "grid", gap: "24px", maxWidth: "900px" }}>
        {/* Card 1: Legajo 360 */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>1. Legajos Digitales 360° del Colaborador</h2>
          <p>
            El legajo digital unificado concentra toda la información contractual, impositiva y médica del trabajador:
          </p>
          <ul>
            <li><strong>Datos Fiscales & Personales:</strong> CUIL (con validación de dígito verificador), DNI, fecha de nacimiento, estado civil y foto.</li>
            <li><strong>Encuadre Sindical / CCT:</strong> Permite configurar el convenio correspondiente (*Comercio 130/75, UOM 260/75, UOCRA 76/75, Camioneros, etc.*) y su categoría profesional.</li>
            <li><strong>Bancarización:</strong> CBU de 22 dígitos del banco donde se depositan los sueldos para exportación masiva.</li>
            <li><strong>Resolución SRT 299/2011 (EPP):</strong> Constancia digital de entrega de calzado de seguridad, ropa de trabajo y protección con número de certificado IRAM.</li>
          </ul>
        </section>

        {/* Card 2: Motor de Liquidación Multi-Convenio */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>2. Motor de Liquidación & Fórmulas Salariales</h2>
          <p>
            El sistema calcula de forma automatizada los haberes y deducciones obligatorias de ley en Argentina:
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Tipo</th>
                  <th>Base de Cálculo / Alícuota</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>100 - Sueldo Básico</strong></td>
                  <td>Remunerativo</td>
                  <td>Básico mensual del legajo / 30 días</td>
                </tr>
                <tr>
                  <td><strong>110 - Antigüedad</strong></td>
                  <td>Remunerativo</td>
                  <td>1% por año de antigüedad reconocida (según CCT)</td>
                </tr>
                <tr>
                  <td><strong>120 - Presentismo</strong></td>
                  <td>Remunerativo</td>
                  <td>8.33% sobre (Básico + Antigüedad)</td>
                </tr>
                <tr>
                  <td><strong>300 - Jubilación (SIPA)</strong></td>
                  <td>Deducción Ley 24.241</td>
                  <td><strong>11.0%</strong> sobre Total Bruto Remunerativo</td>
                </tr>
                <tr>
                  <td><strong>301 - INSSJyP (PAMI)</strong></td>
                  <td>Deducción Ley 19.032</td>
                  <td><strong>3.0%</strong> sobre Total Bruto Remunerativo</td>
                </tr>
                <tr>
                  <td><strong>302 - Obra Social</strong></td>
                  <td>Deducción Ley 23.660</td>
                  <td><strong>3.0%</strong> sobre Total Bruto Remunerativo</td>
                </tr>
                <tr>
                  <td><strong>303 - Cuota Sindical</strong></td>
                  <td>Deducción Gremio</td>
                  <td><strong>2.0%</strong> aporte sindical paritario</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Card 3: Salidas Oficiales AFIP y Bancos */}
        <section className="card pad stack">
          <h2 style={{ margin: "0 0 10px 0", color: "#0d9488" }}>3. Salidas de Cumplimiento Legal (AFIP & Bancos)</h2>
          <ul>
            <li>
              <strong>Libro de Sueldos Digital AFIP (F.931):</strong> Botón <code>📥 TXT AFIP (LSD F.931)</code> en la pantalla de liquidaciones. Genera el archivo plano oficial con los 4 registros (Carátula, Datos Trabajador, Conceptos y Bases de Seguridad Social) para subir directo al servicio de AFIP.
            </li>
            <li>
              <strong>Acreditación Bancaria de Haberes:</strong> Botón <code>🏦 TXT Bancario (Haberes)</code> con CBU, CUIL, Nombre y Neto a pagar para procesar el pago masivo en el Homebanking corporativo.
            </li>
            <li>
              <strong>Recibo de Sueldo Oficial (Art. 140 LCT):</strong> Con firma digital patronal y Hash criptográfico SHA-256 (Ley 25.506), listo para imprimir en PDF.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
