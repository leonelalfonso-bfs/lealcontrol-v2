import { Link } from "react-router-dom";

/** Ayuda de Flota: cómo se usa cada pantalla. */
export function FleetHelpPage() {
  return (
    <div className="workspace-page">
      <div className="page-head">
        <div>
          <span className="eyebrow">FLOTA</span>
          <h1>Ayuda de Flota</h1>
          <p className="muted">Unidades, personas, mantenimiento, combustible y costos.</p>
        </div>
        <div className="toolbar">
          <Link to="/flota" className="btn">Unidades</Link>
          <Link to="/flota/mantenimiento" className="btn btn-outline">Mantenimiento</Link>
        </div>
      </div>

      <div className="stack" style={{ gap: 20, maxWidth: 900 }}>
        <section className="card pad stack">
          <h3 style={{ margin: 0 }}>1. Unidades y vencimientos</h3>
          <ul>
            <li>Cada unidad se identifica por patente o, si no tiene (autoelevadores), por un código interno. Se mide por km, por horas, por ambos o por nada (semirremolques).</li>
            <li>Los km y las horas no bajan: si se cargó mal, se registra una <strong>corrección</strong> con el motivo.</li>
            <li>VTV, seguro, RUTA, habilitaciones y demás tienen fecha de vencimiento y días de aviso. Cargar uno nuevo del mismo tipo <strong>renueva</strong> el anterior.</li>
          </ul>
        </section>

        <section className="card pad stack">
          <h3 style={{ margin: 0 }}>2. Personas y licencias</h3>
          <ul>
            <li>Los choferes, autoelevadoristas y técnicos son los empleados de RRHH: se suman desde <Link to="/flota/personas">Personas y licencias</Link>.</li>
            <li>Según el rol, el sistema pide las credenciales: licencia (chofer), licencia y LINTI (chofer de cargas) o carnet (autoelevadorista).</li>
          </ul>
        </section>

        <section className="card pad stack">
          <h3 style={{ margin: 0 }}>3. Mantenimiento</h3>
          <ul>
            <li>En la ficha de cada unidad se arma el <strong>plan de mantenimiento</strong>: qué se hace y cada cuántos km, horas o días (vence por lo que llegue primero). El "último hecho" es el punto de partida.</li>
            <li>Al registrar un trabajo en <strong>Taller</strong>, marcá los ítems del plan que cumple: la cuenta vuelve a empezar desde ese día y esa lectura.</li>
            <li>"Entra al taller" deja la unidad <strong>en taller</strong> (no disponible) hasta que tocás "Terminar".</li>
            <li>Los services vencidos o próximos aparecen en <Link to="/flota/mantenimiento">Mantenimiento</Link> y en Mis avisos.</li>
          </ul>
        </section>

        <section className="card pad stack">
          <h3 style={{ margin: 0 }}>4. Órdenes de servicio y agenda</h3>
          <ul>
            <li>Una <Link to="/flota/ordenes">orden de servicio</Link> es un trabajo en el cliente: suelta o desde un pedido de venta, con inicio y fin, técnicos y unidades.</li>
            <li>Al elegir el horario, el sistema muestra quién y qué está disponible. <strong>No deja asignar</strong> a una persona o unidad vencida (o que vence antes de que termine el trabajo), sin la documentación obligatoria, en taller, con taller programado o ya ocupada en ese horario.</li>
            <li>Sin fecha, la orden queda "para coordinar". Si después de programar algo vence o la unidad entra al taller, la orden lo marca y llega un aviso.</li>
            <li>La <Link to="/flota/agenda">Agenda</Link> muestra la semana con las órdenes, los vencimientos y el taller, más las órdenes sin fecha y los pedidos de venta sin coordinar.</li>
            <li>En cada orden se cargan los <strong>repuestos y materiales</strong> usados. "Generar remito" crea el remito de Ventas con el servicio y los repuestos del pedido, y descuenta su stock; los demás productos se descuentan como <strong>consumo en servicio</strong>. Se hace una sola vez y después los repuestos quedan fijos.</li>
            <li>El <strong>informe de servicio</strong> (botón "📄 Informe") se imprime o descarga en PDF, con lugar para la firma del técnico y del cliente.</li>
          </ul>
        </section>

        <section className="card pad stack">
          <h3 style={{ margin: 0 }}>5. Combustible y costos</h3>
          <ul>
            <li>Cada carga lleva los km (u horas) del tablero, los litros y el precio o el total del ticket. La carga también actualiza el uso de la unidad.</li>
            <li>Consumo = (km de esta carga − km de la carga anterior) / litros de esta carga. En las que miden horas: litros / horas.</li>
            <li><Link to="/flota/costos">Costos por unidad</Link> suma combustible, taller y vencimientos del período y los divide por los km u horas de uso. Solo lo ven quienes tienen el permiso de costos.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
