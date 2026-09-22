import { Link } from "react-router-dom";

const steps = [
  ["1", "Capturar el prospecto", "Registrá empresa, contacto, origen y necesidad. Todavía no es una oportunidad: primero hay que verificar que exista interés real."],
  ["2", "Contactar y calificar", "Confirmá quién compra, qué necesita, en qué plazo y cuál será el próximo paso. Si califica, convertí el prospecto y abrí la oportunidad."],
  ["3", "Relevar", "Completá cliente, necesidad, monto aproximado, fecha esperada, responsable y una próxima actividad."],
  ["4", "Proponer", "Creá el presupuesto desde la oportunidad. La propuesta debe existir, tener versión y ser enviada al contacto correcto."],
  ["5", "Negociar", "Registrá llamadas, reuniones, respuestas, objeciones y cambios de condiciones. Mantené siempre una próxima acción."],
  ["6", "Cerrar", "Para ganar, registrá la evidencia de aceptación. Para perder, indicá el motivo. Ambos resultados quedan en el historial del cliente."],
];

export function CrmHelpPage() {
  return (
    <div className="crm-help page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">MANUAL DE USO</span>
          <h1>Cómo trabajar con el CRM</h1>
          <p className="muted">Una guía práctica para que todo el equipo siga el mismo proceso comercial.</p>
        </div>
        <Link className="btn btn-outline" to="/oportunidades">Volver al embudo</Link>
      </div>

      <div className="help-flow card pad">
        {steps.map(([number, title, text]) => (
          <article className="help-step" key={number}>
            <span className="help-number">{number}</span>
            <div><h3>{title}</h3><p>{text}</p></div>
          </article>
        ))}
      </div>

      <div className="grid-2 help-grid">
        <section className="card pad">
          <h2>Qué significa “calificado”</h2>
          <p>Un prospecto está calificado cuando cumple estas cuatro condiciones:</p>
          <ul>
            <li>Existe una empresa o persona identificable.</li>
            <li>Hay una necesidad concreta que podemos resolver.</li>
            <li>Existe intención o plazo razonable de compra.</li>
            <li>Quedó acordado un próximo paso comercial.</li>
          </ul>
          <p className="hint">Si no cumple estas condiciones, se descarta o se mantiene como prospecto; no debe inflar el embudo.</p>
        </section>
        <section className="card pad">
          <h2>Reglas del embudo</h2>
          <ul>
            <li>Las oportunidades avanzan de a una etapa.</li>
            <li>Cada avance solicita evidencia de lo ocurrido.</li>
            <li>Una propuesta es un presupuesto real, no una intención.</li>
            <li>Una oportunidad abierta debe tener próxima acción.</li>
            <li>Ganada y Perdida son cierres auditables.</li>
            <li>Reabrir o retroceder debe registrar el motivo.</li>
          </ul>
        </section>
      </div>

      <section className="card pad">
        <h2>Información que conviene registrar</h2>
        <div className="grid-3">
          <div><h3>En cada contacto</h3><p>Canal, interlocutor, resumen, respuesta y próximo compromiso.</p></div>
          <div><h3>En una propuesta</h3><p>Número y versión del presupuesto, destinatario, fecha y canal de envío.</p></div>
          <div><h3>En el cierre</h3><p>Importe final y evidencia si se gana; motivo y competidor si se pierde.</p></div>
        </div>
      </section>
    </div>
  );
}
