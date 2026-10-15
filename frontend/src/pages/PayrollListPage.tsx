import { Link } from "react-router-dom";

/**
 * Liquidación de sueldos en reconstrucción (nota 68): el cálculo anterior inventaba sueldos y su Libro de
 * Sueldos Digital no era el de ARCA. Mientras tanto, los sueldos los sigue liquidando el estudio contable.
 */
export function PayrollListPage() {
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="page-head">
        <div>
          <h1>💰 Liquidación de Sueldos</h1>
          <p className="muted">En reconstrucción para que cumpla la ley vigente y sirva para cualquier convenio.</p>
        </div>
      </div>

      <div className="card pad stack" style={{ gap: 12 }}>
        <div className="alert" style={{ margin: 0 }}>
          La liquidación anterior no era confiable: inventaba sueldos, no calculaba contribuciones ni topes y su Libro de Sueldos Digital
          no era el de ARCA. Se retiró. Mientras tanto, los sueldos se siguen liquidando como hasta ahora (estudio contable).
        </div>
        <p style={{ margin: 0 }}>Se está rehaciendo por etapas:</p>
        <ol style={{ margin: 0, display: "grid", gap: 4 }}>
          <li>Datos del empleador, parámetros legales por mes (topes de ANSES, alícuotas, Fondo de Asistencia Laboral) y legajo completo.</li>
          <li>Convenios colectivos configurables (categorías, escalas, adicionales y aportes sindicales), empezando por UECARA.</li>
          <li>Liquidación mensual con novedades, aportes, contribuciones, recibo legal con firma digital y asiento contable.</li>
          <li>Aguinaldo y vacaciones.</li>
          <li>Libro de Sueldos Digital y F.931 de ARCA.</li>
          <li>Liquidación final (renuncias y despidos con la Ley 27.802).</li>
          <li>Retención de Ganancias de cuarta categoría.</li>
        </ol>
        <p className="muted" style={{ margin: 0 }}>
          El legajo de cada colaborador se completa en <Link to="/rrhh/empleados">Colaboradores & Legajos</Link>. El asiento de sueldos del mes
          se registra a mano en Contabilidad → Cierres y períodos.
        </p>
      </div>
    </div>
  );
}
