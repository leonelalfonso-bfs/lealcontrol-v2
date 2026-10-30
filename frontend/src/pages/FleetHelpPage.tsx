import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve y quién puede hacer qué" },
  { id: "puesta-en-marcha", title: "Puesta en marcha (una sola vez)" },
  { id: "circuito", title: "El circuito de un trabajo, paso a paso" },
  { id: "taller", title: "Taller y plan de mantenimiento" },
  { id: "uso", title: "Kilómetros y horas de uso" },
  { id: "combustible", title: "Combustible" },
  { id: "costos", title: "Costos por unidad" },
  { id: "avisos", title: "Avisos" },
  { id: "legajo", title: "Documentos escaneados y legajo para ingreso a planta" },
  { id: "problemas", title: "Cuando el sistema no te deja" },
  { id: "estados", title: "Qué significa cada estado" }
];

/** Ayuda de Flota: manual de instrucciones del circuito completo. */
export function FleetHelpPage() {
  return (
    <HelpManual
      eyebrow="FLOTA · MANUAL"
      title="Ayuda de Flota"
      intro="Cómo cargar las unidades y las personas, y cómo llevar cada trabajo desde el pedido hasta el remito y el informe firmado, sin mandar nunca a nadie con algo vencido."
      sections={SECTIONS}
      actions={<><Link to="/flota/agenda" className="btn">Agenda</Link><Link to="/flota" className="btn btn-outline">Unidades</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve y quién puede hacer qué">
        <p style={{ margin: 0 }}>
          Flota controla las <strong>unidades</strong> (camionetas, camiones, semis, autoelevadores) y las <strong>personas</strong> que las usan,
          con sus vencimientos, el taller, el combustible y los costos. Sobre eso se organizan los <strong>trabajos en el cliente</strong> (órdenes de servicio):
          quién va, con qué unidad, cuándo, qué repuestos se usaron, el remito y el informe.
        </p>
        <ul style={{ margin: 0 }}>
          <li><strong>Ver</strong> Flota: consulta todo, sin cambiar nada.</li>
          <li><strong>Cargar</strong> en Flota: carga unidades, personas, órdenes, cargas de combustible y trabajos de taller.</li>
          <li>Los <strong>importes</strong> (costos de taller, combustible y vencimientos) y la pantalla <em>Costos por unidad</em> los ve solo quien tiene el permiso <strong>Costos y márgenes</strong>.</li>
          <li>Para <strong>generar el remito</strong> de una orden hace falta además poder cargar en <strong>Ventas</strong>.</li>
        </ul>
        <Tip>Los permisos se asignan en Configuración → Usuarios y permisos.</Tip>
      </ManualPart>

      <ManualPart id="puesta-en-marcha" title="2. Puesta en marcha (una sola vez)">
        <h3 style={{ margin: 0, fontSize: "1.05rem" }}>2.1 Cargar las unidades</h3>
        <Steps>
          <Step title="Entrá a Flota → Unidades y vencimientos y tocá “+ Nueva unidad”." />
          <Step title="Completá los datos.">
            Tipo, <strong>patente</strong> (o un <strong>código interno</strong> si no tiene, como un autoelevador: “AE-01”), marca, modelo y año.
            En <em>Se mide por</em> elegí si se controla por kilómetros, por horas o por los dos (los semirremolques no miden nada) y cargá la lectura actual.
          </Step>
          <Step title="Tocá “Crear unidad”." />
        </Steps>

        <h3 style={{ margin: "8px 0 0", fontSize: "1.05rem" }}>2.2 Cargar los vencimientos de cada unidad</h3>
        <Steps>
          <Step title="En la ficha de la unidad, sección Vencimientos, tocá “+ Cargar vencimiento”." />
          <Step title="Elegí el tipo y cargá la fecha en que vence.">
            Podés sumar número, emisor, fecha de emisión, costo y con cuántos días de anticipación querés el aviso (30 por defecto).
          </Step>
          <Step title="Guardá. Cuando renueves, usá “Renovar”: el anterior pasa al historial." />
        </Steps>
        <Tip>
          Documentación <strong>obligatoria</strong>: camionetas, utilitarios, autos, semis y acoplados → VTV y seguro; camiones y tractores → VTV, seguro y RUTA;
          autoelevadores → habilitación. Si falta, la unidad figura “Sin cargar” y <strong>no se puede asignar a trabajos</strong>.
        </Tip>

        <h3 style={{ margin: "8px 0 0", fontSize: "1.05rem" }}>2.3 Sumar a las personas</h3>
        <Steps>
          <Step title="Primero tienen que existir en RRHH → Colaboradores, como empleados activos." />
          <Step title="En Flota → Personas y licencias tocá “+ Agregar persona”, elegí el empleado y marcá sus roles.">
            Chofer, chofer de cargas, autoelevadorista y/o técnico.
          </Step>
          <Step title="En su ficha, “+ Cargar credencial”: licencia (con categoría), LINTI, carnet, apto médico…" />
        </Steps>
        <Tip>
          Según el rol se piden credenciales: chofer → licencia; chofer de cargas → licencia y LINTI; autoelevadorista → carnet.
          Sin ellas, o vencidas, la persona <strong>no se puede asignar</strong>.
        </Tip>

        <h3 style={{ margin: "8px 0 0", fontSize: "1.05rem" }}>2.4 Armar el plan de mantenimiento</h3>
        <Steps>
          <Step title="En la ficha de cada unidad, sección Plan de mantenimiento, tocá “+ Agregar ítem”." />
          <Step title="Indicá qué se hace (por ejemplo “Aceite y filtros”) y cada cuántos km, horas o días.">
            Vence por lo que llegue primero. En <em>Último hecho</em> poné cuándo se hizo por última vez (fecha y lectura): desde ahí se cuenta.
          </Step>
          <Step title="Ajustá el margen de aviso (por ejemplo, avisar 1.000 km antes) y guardá." />
        </Steps>
      </ManualPart>

      <ManualPart id="circuito" title="3. El circuito de un trabajo, paso a paso">
        <Steps>
          <Step title="(Opcional) El pedido de venta.">
            Si el trabajo se vendió, confirmá el pedido en Ventas → <Link to="/pedidos">Pedidos de venta</Link>. Va a aparecer en la Agenda como “pedido sin coordinar”.
          </Step>
          <Step title="Crear la orden de servicio.">
            Desde <Link to="/flota/agenda">Agenda</Link> → “Pedidos de venta sin coordinar” → <em>Crear orden</em>; o desde{" "}
            <Link to="/flota/ordenes">Órdenes de servicio</Link> → “+ Nueva orden”; o con el “+” de un día de la Agenda.
            Elegí <strong>Cliente</strong> (buscalo en la base) o <strong>Desde un pedido de venta</strong>, y escribí qué hay que hacer y dónde.
          </Step>
          <Step title="Programar: inicio, fin, técnicos y unidades.">
            Al poner inicio y fin aparecen las personas y unidades. Las que <strong>no se pueden asignar</strong> aparecen en rojo con el motivo
            (vencida, vence antes de terminar el trabajo, sin documentación, en taller, ocupada en otra orden). Marcá a quién y qué mandás y guardá.
            Si todavía no hay fecha, guardala sin fecha: queda “para coordinar”.
          </Step>
          <Step title="Seguirla en la Agenda.">
            La semana muestra las órdenes, los vencimientos y el taller. Si después de programar algo vence o la unidad entra al taller,
            la orden se marca en rojo y llega un aviso: cambiá la asignación o el horario.
          </Step>
          <Step title="El día del trabajo: “Iniciar”." />
          <Step title="Cargar los repuestos y materiales.">
            En la orden, sección <em>Repuestos y materiales</em>: buscá el producto por código o nombre, poné la cantidad y, si corresponde, el número de serie.
            Lo que no tiene código va como “+ Material sin código”. Tocá “Guardar repuestos”.
          </Step>
          <Step title="“Terminar…”: contá qué se hizo y tocá “Terminar orden”." />
          <Step title="“Generar remito…”.">
            Elegí cuánto de cada línea del pedido entregás (por defecto, una unidad: un servicio por remito). El sistema muestra a dónde va cada repuesto:
            <ul style={{ margin: "4px 0 0" }}>
              <li><strong>va en el remito</strong>: está en el pedido; sale del stock con el remito;</li>
              <li><strong>se descuenta como consumo</strong>: es un producto que no está en el pedido; sale del stock como “consumo en servicio”;</li>
              <li><strong>solo queda anotado</strong>: material sin código; no mueve stock.</li>
            </ul>
            Tocá “Generar remito y descontar stock”. El remito queda en Ventas → <Link to="/remitos">Remitos oficiales</Link>, listo para imprimir y firmar.
          </Step>
          <Step title="El informe de servicio: “📄 Informe”.">
            Imprimilo o descargalo en PDF: tiene el trabajo, los repuestos, el remito y lugar para la firma del técnico y del cliente.
          </Step>
          <Step title="Facturar.">
            En <Link to="/remitos">Remitos oficiales</Link>, el remito queda “pendiente de facturar”: emití la factura vinculada desde ahí, como cualquier remito.
          </Step>
        </Steps>
        <Tip warn>El stock se descuenta <strong>una sola vez</strong>, al generar el remito. Después los repuestos de la orden ya no se pueden cambiar.</Tip>
      </ManualPart>

      <ManualPart id="taller" title="4. Taller y plan de mantenimiento">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>Entra al taller</strong> (en la ficha de la unidad, sección Taller): la unidad queda <em>en taller</em> y no se puede asignar. Cuando sale, tocá <strong>Terminar</strong> y cargá km u horas, taller, comprobante y costo.</li>
          <li><strong>+ Registrar trabajo</strong>: para cargar algo ya hecho, o <em>programado</em> para otra fecha (los días programados la unidad tampoco se asigna).</li>
          <li>Si el trabajo cumple un ítem del plan, marcalo (o usá <strong>Registrar hecho</strong> desde el plan): la cuenta del próximo service vuelve a empezar desde ese día y esa lectura.</li>
          <li><Link to="/flota/mantenimiento">Mantenimiento</Link> muestra los services vencidos o próximos de toda la flota, lo que está en taller, lo programado y los últimos trabajos.</li>
        </ul>
        <Tip>Un service vencido avisa pero no bloquea la asignación. Lo que bloquea es estar en taller o tener taller programado esos días.</Tip>
      </ManualPart>

      <ManualPart id="uso" title="5. Kilómetros y horas de uso">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li>En la ficha de la unidad, sección <em>Uso</em>, cargá la lectura y tocá <strong>Registrar lectura</strong>.</li>
          <li>Las cargas de combustible y los trabajos de taller también actualizan la lectura.</li>
          <li>Los valores <strong>no pueden bajar</strong>. Si se cargó mal, marcá “Corrección de un error” y explicá el motivo: queda registrado.</li>
        </ul>
      </ManualPart>

      <ManualPart id="combustible" title="6. Combustible">
        <Steps>
          <Step title="Flota → Combustible → “+ Registrar carga”." />
          <Step title="Elegí la unidad, la fecha y quién cargó; poné los km (u horas) del tablero y los litros.">
            Cargá el precio por litro o el total del ticket (el otro se calcula), y si querés la estación y el medio de pago.
          </Step>
          <Step title="Guardá: el sistema muestra el consumo desde la carga anterior (km/l, o l/h en autoelevadores)." />
        </Steps>
        <Tip>Para que el consumo sea real, cargá siempre los km del tablero. Una carga equivocada se borra con “Borrar” y el consumo se recalcula.</Tip>
      </ManualPart>

      <ManualPart id="costos" title="7. Costos por unidad">
        <p style={{ margin: 0 }}>
          <Link to="/flota/costos">Costos por unidad</Link> suma, para el período elegido, el combustible, el taller y los vencimientos (por fecha de emisión) de cada unidad,
          y lo divide por los km u horas de uso. Sirve para comparar unidades y decidir cuándo conviene cambiarlas.
        </p>
      </ManualPart>

      <ManualPart id="avisos" title="8. Avisos">
        <p style={{ margin: 0 }}>
          En <Link to="/mi-perfil/avisos">Mi perfil → Mis avisos</Link> cada persona elige qué avisos de Flota quiere ver (y recibir por correo):
          vencimientos de unidades, licencias y credenciales, services, y órdenes de servicio con problemas. También aparecen en la campanita del menú.
        </p>
      </ManualPart>

      <ManualPart id="legajo" title="8 bis. Documentos escaneados y legajo para ingreso a planta">
        <Steps>
          <Step title="En cada vencimiento de la unidad (VTV, seguro, cédula…) y en cada credencial de la persona (licencia, LINTI, apto…): “📎 Subir” el PDF o la foto.">
            Se aceptan PDF, JPG o PNG de hasta 15 MB. “📎 Ver” lo abre; “Cambiar” lo reemplaza. Al renovar, el nuevo vencimiento lleva su propio archivo
            y el anterior queda en el historial.
          </Step>
          <Step title="Los documentos de la persona que están en su legajo de RRHH (DNI, alta temprana, preocupacional…) se suman solos: no hace falta cargarlos de nuevo en Flota." />
          <Step title="Flota → Legajo para ingreso a planta → tildá las personas y las unidades. Desde una orden de servicio, “📦 Legajo para el cliente” ya trae las asignadas.">
            Aparece cada documento con su vencimiento y estado. Van tildados los que tienen archivo y no están vencidos; los vencidos y los que no
            tienen archivo se avisan arriba.
          </Step>
          <Step title="“⬇️ Descargar ZIP”: una carpeta por persona (con su DNI) y por unidad (con su patente), y un Indice.txt con todo lo enviado y lo que falta." />
        </Steps>
      </ManualPart>

      <ManualPart id="problemas" title="9. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>“No se puede asignar: … <strong>vence el</strong> …” o “… vencida”</>, <>Renová el vencimiento o la credencial (botón “Renovar” en la ficha) o elegí otra persona o unidad. Una credencial que vence antes del <strong>fin</strong> del trabajo también bloquea.</>],
          [<>“… sin VTV / RTO cargada” (o seguro, RUTA, habilitación, licencia, LINTI, carnet)</>, <>Cargá ese vencimiento en la ficha de la unidad o la credencial en la ficha de la persona.</>],
          [<>“… <strong>ocupada</strong> en OS-…”</>, <>Esa persona o unidad ya está en otra orden en ese horario: cambiá el horario o elegí otra.</>],
          [<>“… en taller” o “taller programado el …”</>, <>Terminá el trabajo de taller (si ya salió) o elegí otra unidad.</>],
          [<>“no está en Flota → Personas” o la persona no aparece</>, <>Agregala en Personas y licencias. Tiene que estar activa en RRHH.</>],
          [<>“La orden tiene que tener un cliente de la base o un pedido de venta” (al generar el remito)</>, <>Editá la orden y elegí el cliente buscándolo en la base (no como texto suelto), o vinculala a un pedido.</>],
          [<>“Para generar el remito necesitás permiso para cargar en Ventas”</>, <>Pedile al administrador ese permiso, o que genere el remito alguien que lo tenga.</>],
          [<>“… quedan X por entregar”</>, <>Estás remitiendo más de lo que falta entregar del pedido: bajá la cantidad.</>],
          [<>“Ya se generó el remito … los repuestos no se cambian”</>, <>El stock ya se descontó. Si hubo un error, registrá una devolución del remito en Ventas o corregí el stock con un ajuste en Inventario.</>],
          [<>“Los kilómetros no pueden bajar”</>, <>Si fue un error de carga, marcá “Corrección de un error” y explicá el motivo.</>],
          [<>No veo importes ni Costos por unidad</>, <>Te falta el permiso Costos y márgenes.</>]
        ]} />
      </ManualPart>

      <ManualPart id="estados" title="10. Qué significa cada estado">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>Órdenes:</strong> <em>Sin fecha</em> (para coordinar) → <em>Programada</em> → <em>En curso</em> → <em>Terminada</em>; o <em>Cancelada</em> (libera a las personas y unidades).</li>
          <li><strong>Vencimientos y credenciales:</strong> <em>Al día</em>, <em>Por vencer</em> (dentro de los días de aviso), <em>Vencido</em>, <em>Sin cargar</em> (obligatorio y falta).</li>
          <li><strong>Services del plan:</strong> <em>Al día</em>, <em>Próximo</em> (dentro del margen de aviso), <em>Vencido</em>.</li>
          <li><strong>Taller:</strong> <em>Programado</em>, <em>En taller ahora</em>, <em>Hecho</em>, <em>Cancelado</em>.</li>
          <li><strong>Unidades:</strong> <em>Disponible</em>, <em>En taller</em>, <em>Fuera de servicio</em>, <em>Dada de baja</em>.</li>
        </ul>
      </ManualPart>
    </HelpManual>
  );
}
