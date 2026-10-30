import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve y quién puede hacer qué" },
  { id: "antes", title: "Antes de empezar" },
  { id: "circuito", title: "El circuito de una venta, paso a paso" },
  { id: "presupuestos", title: "Presupuestos" },
  { id: "pedidos", title: "Pedidos de venta" },
  { id: "remitos", title: "Remitos y devoluciones" },
  { id: "facturas", title: "Facturas y autorización en ARCA" },
  { id: "notas", title: "Notas de crédito y débito" },
  { id: "especiales", title: "Dólares y Factura de Crédito Electrónica" },
  { id: "problemas", title: "Cuando el sistema no te deja" },
  { id: "estados", title: "Qué significa cada estado" }
];

/** Ayuda de Ventas: manual de instrucciones del circuito comercial completo, con ARCA. */
export function SalesHelpPage() {
  return (
    <HelpManual
      eyebrow="VENTAS · MANUAL"
      title="Ayuda de Ventas y facturación"
      intro="Del presupuesto a la factura autorizada en ARCA y el cobro: cada paso, qué botón tocar y qué hacer cuando el sistema frena algo."
      sections={SECTIONS}
      actions={<><Link to="/presupuestos" className="btn">Presupuestos</Link><Link to="/facturas" className="btn btn-outline">Facturas</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve y quién puede hacer qué">
        <p style={{ margin: 0 }}>
          Ventas reúne <strong>presupuestos</strong>, <strong>pedidos</strong>, <strong>remitos</strong> y <strong>facturas electrónicas</strong> (autorizadas en ARCA con CAE).
          Los cobros y las cuentas corrientes están en Finanzas.
        </p>
        <ul style={{ margin: 0 }}>
          <li><strong>Ver</strong>: consulta y exporta.</li>
          <li><strong>Cargar</strong>: crea y edita presupuestos, pedidos, remitos y borradores de factura.</li>
          <li><strong>Aprobar</strong>: además <strong>autoriza en ARCA</strong>, consulta envíos sin confirmar y anula.</li>
          <li>Sin el permiso <strong>Costos y márgenes</strong> no se ven costos ni precios de compra de los productos.</li>
        </ul>
      </ManualPart>

      <ManualPart id="antes" title="2. Antes de empezar">
        <Steps>
          <Step title="Datos de la empresa y logo: Configuración → Empresa." />
          <Step title="Facturación ARCA: Configuración → Facturación ARCA.">
            Punto de venta de este sistema y certificado digital. Está explicado paso a paso en la Ayuda de Configuración.
          </Step>
          <Step title="Cuenta para transferencias: Configuración → Cobros y bancos.">Sale en la factura y es obligatoria para la Factura de Crédito Electrónica.</Step>
          <Step title="Clientes con CUIT y condición frente al IVA: Directorio → Clientes.">
            La letra del comprobante depende de la condición: Responsable Inscripto o Monotributo → A; Consumidor Final o Exento → B.
          </Step>
          <Step title="Productos y servicios: Inventario → Catálogo de productos." />
        </Steps>
      </ManualPart>

      <ManualPart id="circuito" title="3. El circuito de una venta, paso a paso">
        <Steps>
          <Step title="Presupuesto.">En <Link to="/presupuestos">Presupuestos</Link> → “+ Nuevo Presupuesto”. Se envía por correo o se descarga en PDF.</Step>
          <Step title="El cliente acepta: “Convertir a Pedido”.">Desde el listado de presupuestos. Se crea el pedido de venta con los renglones.</Step>
          <Step title="Entrega: “🚚 Generar Remito” desde el pedido.">Podés entregar todo o una parte; el remito descuenta el stock.</Step>
          <Step title="Factura: “📄 Facturar Remito” desde Remitos oficiales.">Queda como <strong>borrador</strong> con lo entregado.</Step>
          <Step title="Autorizar en ARCA: “Autorizar ARCA” en el listado de facturas.">ARCA devuelve el CAE y la factura queda autorizada, con su QR.</Step>
          <Step title="Enviar: “🖨️ PDF / QR” o “✉️ Enviar por Email”." />
          <Step title="Cobrar: “💵 Cobrar” en la factura.">Abre el recibo de cobro en Finanzas con la factura ya elegida.</Step>
        </Steps>
        <Tip>
          También se puede facturar directo, sin presupuesto ni remito (venta de mostrador): <Link to="/facturas">Facturas</Link> → “+ Nueva Factura”.
          Si el pedido ya tiene remitos, hay que facturar desde el remito, para respetar las devoluciones.
        </Tip>
      </ManualPart>

      <ManualPart id="presupuestos" title="4. Presupuestos">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li>Elegí la <strong>moneda</strong> (pesos, dólar billete o dólar divisa). La cotización del Banco Nación se trae sola y convierte los precios del catálogo.</li>
          <li>Desde el mismo formulario podés dar de alta un cliente, una planta, un contacto o un producto nuevo (“+ Alta Rápida”, “+ Crear Producto Nuevo”).</li>
          <li>Un renglón <strong>Opcional</strong> no suma al total: sirve para ofrecer alternativas. Al pasar a pedido se usan los obligatorios.</li>
          <li>“Marcar Enviado” lleva el control de lo enviado; “Anular” lo deja en el listado como anulado; “Eliminar” lo borra.</li>
          <li>Cada vez que se guarda con un cambio que ve el cliente (renglones, precios, condiciones, notas) sube la <strong>revisión</strong> (Rev. 2, 3…). Guardar sin cambios no la sube.</li>
          <li>Un presupuesto hecho desde Ventas, sin pasar por el CRM, abre solo una <strong>oportunidad</strong> del cliente en etapa Propuesta: queda en el embudo y en la ficha del cliente. Al generar el pedido la oportunidad se gana; si el presupuesto se rechaza o se anula, se pierde.</li>
          <li>Al generar el pedido, el presupuesto pasa a <strong>Pedido de venta</strong> y deja de ofrecer “Generar pedido”.</li>
          <li>“Descargar PDF” pregunta dónde guardarlo (en Chrome y Edge): así va directo a la carpeta del cliente. En otros navegadores se descarga como siempre.</li>
        </ul>
      </ManualPart>

      <ManualPart id="pedidos" title="5. Pedidos de venta">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li>Se crean desde el presupuesto o con “+ Nuevo Pedido” en <Link to="/pedidos">Pedidos de venta</Link>.</li>
          <li>En la ficha (“Ver Ficha ➔”) está el progreso: qué se entregó y qué falta. “✏️ Editar”, “🖨️ Imprimir / PDF”, “✉ Enviar por email” y “Cancelar pedido”.</li>
          <li>Si el pedido es de servicios en el cliente, Flota lo muestra en la Agenda como “pedido sin coordinar” para crear las órdenes de servicio.</li>
        </ul>
      </ManualPart>

      <ManualPart id="remitos" title="6. Remitos y devoluciones">
        <Steps>
          <Step title="“🚚 Generar Remito” desde el pedido (o “+ Nuevo Remito” para uno suelto).">
            Para cada renglón se ve lo pedido, lo ya remitido y lo pendiente. Poné cuánto entregás ahora; podés agregar números de serie.
          </Step>
          <Step title="Al emitirlo se descuenta el stock y se abre el remito para imprimir y firmar." />
          <Step title="Si el cliente devuelve algo, antes de facturar: “↩ Devoluciones” → elegí ítems, cantidad y motivo, y confirmá la recepción.">
            Lo devuelto vuelve al stock. Después “Facturar saldo neto →” factura lo entregado menos lo devuelto.
          </Step>
        </Steps>
        <Tip>En <Link to="/remitos">Remitos oficiales</Link> filtrá “⏳ Solo Pendientes de Facturar” para ver lo que falta facturar.</Tip>
      </ManualPart>

      <ManualPart id="facturas" title="7. Facturas y autorización en ARCA">
        <Steps>
          <Step title="Guardá el borrador (“💾 Guardar borrador”).">
            Revisá cliente, tipo de comprobante, concepto (productos, servicios o ambos), condición de venta, renglones y alícuotas de IVA.
            Para facturar un anticipo usá “Facturación Parcial / Anticipo %”.
          </Step>
          <Step title="En el listado, “Autorizar ARCA”.">
            El sistema pide confirmación (emite un comprobante fiscal), <strong>reserva el número</strong> y lo envía a ARCA. Si sale bien, queda autorizada con CAE.
          </Step>
          <Step title="Si la autorización quedó “Envío sin confirmar · consultar ARCA”: tocá “Consultar ARCA”.">
            El sistema pregunta a ARCA por ese mismo número y lo concilia. <strong>Nunca</strong> generes otra factura por lo mismo: se duplicaría.
          </Step>
          <Step title="Si ARCA la rechazó: leé el motivo debajo del estado y tocá “Corregir y reintentar”.">
            Se abre una copia para corregir; al guardarla, el borrador rechazado se anula.
          </Step>
        </Steps>
        <Tip warn>
          La fecha de emisión tiene que estar dentro de los <strong>5 días</strong> anteriores o posteriores a hoy si son productos, o <strong>10 días</strong> si son servicios.
          A un borrador viejo hay que cambiarle la fecha antes de autorizarlo.
        </Tip>
      </ManualPart>

      <ManualPart id="notas" title="8. Notas de crédito y débito">
        <Steps>
          <Step title="En el listado de facturas, sobre la factura original, tocá “NC” (crédito) o “ND” (débito).">
            La nota queda asociada a esa factura, como pide ARCA.
          </Step>
          <Step title="Ajustá renglones e importes. Si es una devolución de mercadería, marcá “Es una devolución: reingresar los productos al stock”." />
          <Step title="Guardá el borrador y autorizalo en ARCA como una factura." />
        </Steps>
      </ManualPart>

      <ManualPart id="especiales" title="9. Dólares y Factura de Crédito Electrónica">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>En dólares:</strong> elegí la moneda USD. Si además el cliente paga en dólares, marcá “Se cobra en dólares”. ARCA exige su cotización oficial: si la del borrador no coincide, usá “Usar cotización ARCA”.</li>
          <li><strong>Factura de Crédito Electrónica (FCE MiPyMEs):</strong> si al cliente le corresponde por el importe, el formulario lo avisa y ofrece “Cambiar a Factura de Crédito Electrónica”. Requiere el CUIT del cliente y el CBU de la empresa (Configuración → Cobros y bancos). La FCE debe tener fecha entre 5 días atrás y mañana.</li>
          <li>Si el cliente <strong>rechazó la FCE</strong> en ARCA, la nota de crédito se marca como “Es de anulación”.</li>
        </ul>
      </ManualPart>

      <ManualPart id="problemas" title="10. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>“A un cliente Responsable Inscripto o Monotributista le corresponde un comprobante A” (o B)</>, <>Cambiá el tipo de comprobante, o corregí la condición frente al IVA del cliente.</>],
          [<>“El cliente debe tener un CUIT válido…” / “Indicá la condición frente al IVA del cliente”</>, <>Completá CUIT y condición en la ficha del cliente.</>],
          [<>“La fecha de emisión debe estar dentro de los cinco (o diez) días…”</>, <>Cambiá la fecha del borrador a hoy o a una fecha dentro de la ventana.</>],
          [<>“Envío sin confirmar · consultar ARCA” / “El borrador ya tiene una reserva fiscal”</>, <>Tocá “Consultar ARCA”. No crees otra factura por lo mismo.</>],
          [<>“Solicitud rechazada · requiere revisión”</>, <>Leé el motivo y usá “Corregir y reintentar”.</>],
          [<>“Este cliente está obligado a recibir Factura de Crédito Electrónica…”</>, <>Usá “Cambiar a Factura de Crédito Electrónica”.</>],
          [<>“Cargá el CBU de la empresa (22 dígitos)…”</>, <>Configuración → Cobros y bancos.</>],
          [<>“La cotización del borrador no coincide con la oficial de ARCA”</>, <>Usá “Usar cotización ARCA”.</>],
          [<>“Desde $10.000.000 el consumidor final debe identificarse con DNI o CUIT”</>, <>Cargá el documento del cliente.</>],
          [<>“La cantidad a remitir supera el saldo pendiente del pedido”</>, <>Bajá la cantidad: ya se remitió parte.</>],
          [<>“El pedido tiene remitos entregados. Facturá desde el remito…”</>, <>Facturá con “📄 Facturar Remito” desde Remitos oficiales.</>],
          [<>“La devolución debe confirmarse antes de facturar el remito”</>, <>Terminá la devolución en “↩ Devoluciones”.</>],
          [<>“Emisión ARCA deshabilitada”</>, <>La empresa todavía no tiene habilitada la emisión real. Consultá al administrador del sistema.</>],
          [<>“El certificado de ARCA está vencido”</>, <>Generá y cargá un certificado nuevo en Configuración → Facturación ARCA.</>]
        ]} />
      </ManualPart>

      <ManualPart id="estados" title="11. Qué significa cada estado">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>Presupuestos:</strong> Borrador, Enviado, Aceptado, Rechazado, Anulado, Pedido de Venta (ya convertido).</li>
          <li><strong>Pedidos:</strong> Borrador, Confirmado, En Preparación, Despachado, Entregado, Facturado, Cancelado.</li>
          <li><strong>Remitos:</strong> Borrador, Entregado, Anulado; y en facturación: Pendiente de facturar o Facturado.</li>
          <li><strong>Facturas (ARCA):</strong> Borrador (sin CAE), Autorizada (con CAE y QR), Rechazado ARCA; un borrador puede mostrar “Reserva sin enviar” o “Envío sin confirmar · consultar ARCA”.</li>
          <li><strong>Cobro:</strong> Pendiente, Cobro Parcial, Cobrada.</li>
        </ul>
      </ManualPart>
    </HelpManual>
  );
}
