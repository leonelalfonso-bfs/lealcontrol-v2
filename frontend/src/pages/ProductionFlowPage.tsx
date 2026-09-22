import { Link } from "react-router-dom";
import "../production-flow.css";

const steps = [
  ["1", "Catálogo", "Definí productos terminados, materias primas y semielaborados.", "/productos", "Abrir catálogo"],
  ["2", "Estructura", "Armá la BOM con cantidades, variantes, mermas y sustitutos.", "/produccion", "Configurar BOM"],
  ["3", "Ruta", "Definí operaciones, tiempos, centros de trabajo y controles.", "/produccion", "Configurar ruta"],
  ["4", "Orden", "Planificá la cantidad y liberá el trabajo para fabricación.", "/produccion", "Crear orden"],
  ["5", "Cierre", "Registrá consumos, producción terminada, lotes, series y mermas.", "/produccion", "Ver cierre"]
] as const;

export function ProductionFlowPage() {
  return <div className="production-page page-wide"><div className="page-head"><div><span className="eyebrow">PRODUCCIÓN</span><h1>Flujo de fabricación</h1><p className="muted">Un circuito simple para transformar materiales en productos terminados.</p></div><div className="toolbar"><Link className="btn btn-outline" to="/produccion/ayuda">? Manual de ayuda</Link></div></div>
    <div className="card pad production-flow-intro"><span className="production-flow-icon">⚒</span><div><h2>Trabajá en este orden</h2><p className="muted">Cada paso prepara la información del siguiente. No hace falta conocer conceptos industriales para empezar.</p></div></div>
    <div className="production-flow-grid">{steps.map(([number, title, text, href, label]) => <section className="card pad production-flow-step" key={number}><span className="help-number">{number}</span><div><h2>{title}</h2><p className="muted">{text}</p><Link className="btn btn-outline compact" to={href}>{label} →</Link></div></section>)}</div>
    <div className="card pad production-flow-note"><strong>Regla principal:</strong><span>primero se define qué fabricar, después cómo fabricarlo y finalmente se ejecuta la orden.</span></div>
  </div>;
}
