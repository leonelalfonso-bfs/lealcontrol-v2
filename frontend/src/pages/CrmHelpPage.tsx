import { Link } from "react-router-dom";

const steps = [
  ["1", "Entra la consulta (Por cotizar)", "Puede llegar por mail (la IA abre la oportunidad y vincula el cliente o crea el prospecto) o cargarse a mano en Prospectos / Oportunidades."],
  ["2", "Vincular o dar de alta el cliente", "Desde la misma Oportunidad podés vincular un cliente existente o convertir el prospecto consultando el CUIT en ARCA en 1 clic (pasa contacto, oportunidad y mails automáticamente)."],
  ["3", "Presupuestado", "Desde la oportunidad creá el presupuesto en Ventas. También al crear un presupuesto directo en Ventas, la oportunidad se abre sola en Presupuestado."],
  ["4", "En negociación", "En Comunicaciones → Bandeja seguí el hilo y registrá llamadas o acuerdos en la oportunidad. A los 5 días hábiles sin respuesta se crea un llamado de seguimiento."],
  ["5", "Cerrar (Ganada / Perdida)", "Al pasar el presupuesto a pedido la oportunidad se marca Ganada automáticamente; también podés cerrarla a mano registrando evidencia o motivo de pérdida."],
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
            <li><strong>Comunicaciones</strong>: bandeja de correo. Solo aparece si SuperAdmin activó el piloto.</li>
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

      <section className="card pad">
        <h2>Seguimiento automático, IA y avisos</h2>
        <ul>
          <li>
            <strong>Lectura de mails con IA:</strong> identifica si quien escribe pertenece a un cliente existente (por CUIT,
            mail del cliente o de un contacto, dominio corporativo único o nombre único sin conflictos). Si hay duda, la bandeja
            sugiere candidatos para que vincules manualmente sin mezclar cuentas.
          </li>
          <li>
            <strong>Contactos con puesto libre:</strong> en cada cliente podés escribir el puesto exacto de cada persona (por
            ejemplo, <em>Jefe de Planta</em> o <em>Comprador</em>) además de su área. Cuando escribe una persona nueva de un
            cliente existente, la IA la guarda con la etiqueta <em>Cargado automáticamente</em> (nunca crea contactos para
            casillas genéricas como <code>info@</code>, <code>compras@</code> o <code>facturacion@</code>).
          </li>
          <li>
            <strong>Alta automática con ARCA y filtro «A revisar»:</strong> cuando llega un pedido comercial de una empresa nueva,
            si el mail trae CUIT (o si la IA lo encuentra en internet cuando esa opción está activa), valida los datos en el padrón
            de ARCA y da de alta el cliente con la etiqueta <em>Cargado automáticamente</em> (siempre con condición fiscal válida).
            Desde Clientes podés filtrar por <strong>A revisar</strong> para controlarlos antes de emitir la primera factura.
          </li>
          <li>
            <strong>Revisión del circuito y borradores de respuesta:</strong> en cada hilo de la Bandeja se muestra el
            estado real del circuito comercial (cliente, contacto, oportunidad, presupuestos con revisión/fecha y faltantes)
            calculado directamente por código, sin consumir tokens de IA. Al responder, podés tocar <strong>Sugerir respuesta (IA)</strong>
            para armar un borrador con ese contexto real (nunca se envía solo). En Configuración → Correo también tenés el botón
            <strong>Generar informe ahora</strong> para actualizar las prioridades del Supervisor comercial cuando quieras.
          </li>
          <li>
            <strong>Presupuesto sin respuesta:</strong> pasados 5 días hábiles desde que se envió, si sigue en estado Enviado
            y el cliente no escribió un mail después (en una conversación vinculada a él), el sistema crea un llamado de
            seguimiento para ese día, en la oportunidad del presupuesto. Se crea una sola vez por envío.
          </li>
          <li>
            <strong>Mis avisos y el resumen diario:</strong> "Actividades vencidas y de hoy", "Presupuestos sin respuesta"
            (con el importe, si tu perfil ve importes) y "Oportunidades sin movimiento" (15 días sin cambios ni actividades,
            o los días configurados en la oportunidad). Cada uno se activa o desactiva en Mis avisos.
          </li>
          <li>El presupuesto sale del aviso al aceptarlo, rechazarlo o pasarlo a pedido; la actividad, al marcarla como hecha.</li>
        </ul>
      </section>
    </div>
  );
}
