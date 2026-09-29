import { Link } from "react-router-dom";

const steps = [
  ["1", "Capturar el prospecto", "En CRM → Prospectos registrá empresa, contacto, origen y necesidad. Todavía no es una oportunidad: primero hay que verificar interés real."],
  ["2", "Contactar y calificar", "Confirmá quién compra, qué necesita, en qué plazo y cuál será el próximo paso. Si califica, convertí el prospecto a cliente y abrí la oportunidad."],
  ["3", "Abrir la oportunidad", "En CRM → Oportunidades completá necesidad, monto, fecha esperada, responsable y una próxima actividad. Eso alimenta el Centro de Pendientes."],
  ["4", "Proponer", "Desde la oportunidad creá el presupuesto en Ventas. La propuesta debe existir, tener versión y poder enviarse por correo con el PDF adjunto."],
  ["5", "Seguir la conversación", "En Comunicaciones → Bandeja respondé el hilo. Vinculá el cliente si hace falta. En la ficha del cliente, el historial muestra notas, correos y oportunidades juntos."],
  ["6", "Cerrar", "Para ganar, registrá la evidencia de aceptación. Para perder, indicá el motivo. Ambos resultados quedan en el historial del cliente."],
];

export function CrmHelpPage() {
  return (
    <div className="crm-help page-wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">MANUAL DE USO</span>
          <h1>Cómo trabajar la relación comercial</h1>
          <p className="muted">
            Recorrido único: prospecto → cliente → oportunidad → presupuesto → bandeja.
            El detalle vivo del plan está en <code>docs/PLAN_RELACION_COMERCIAL.md</code>.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/crm">Centro de pendientes</Link>
          <Link className="btn btn-outline" to="/oportunidades">Embudo</Link>
          <Link className="btn" to="/comunicaciones">Bandeja</Link>
        </div>
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
          <h2>Dónde se trabaja cada cosa</h2>
          <ul>
            <li><strong>CRM</strong>: prospectos, oportunidades, pendientes del día.</li>
            <li><strong>Ficha del cliente</strong>: historial único (notas, correos, oportunidades, presupuestos) y próxima acción.</li>
            <li><strong>Comunicaciones</strong>: bandeja de correo, WhatsApp y redes. Solo aparece si SuperAdmin activó el piloto.</li>
            <li><strong>Ventas</strong>: presupuestos, pedidos y facturas.</li>
          </ul>
        </section>
        <section className="card pad">
          <h2>Reglas del embudo</h2>
          <ul>
            <li>Las oportunidades avanzan de a una etapa.</li>
            <li>Cada avance pide evidencia de lo ocurrido.</li>
            <li>Una propuesta es un presupuesto real, no una intención.</li>
            <li>Una oportunidad abierta debe tener próxima acción.</li>
            <li>Ganada y Perdida son cierres auditables.</li>
            <li>Una actividad del CRM no crea un hilo paralelo en la bandeja.</li>
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
