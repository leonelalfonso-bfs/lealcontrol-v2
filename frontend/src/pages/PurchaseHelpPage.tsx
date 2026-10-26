import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve y quién puede hacer qué" },
  { id: "antes", title: "Antes de empezar" },
  { id: "circuito", title: "El circuito de una compra, paso a paso" },
  { id: "recepcion", title: "Recepción de mercadería" },
  { id: "factura", title: "Factura del proveedor" },
  { id: "arca", title: "Importar comprobantes de ARCA" },
  { id: "pago", title: "Pago y cuenta corriente" },
  { id: "reportes", title: "Evaluación de proveedores" },
  { id: "problemas", title: "Cuando el sistema no te deja" },
  { id: "estados", title: "Qué significa cada estado" }
];

/** Ayuda de Compras: manual de instrucciones del circuito de abastecimiento completo. */
export function PurchaseHelpPage() {
  return (
    <HelpManual
      eyebrow="COMPRAS · MANUAL"
      title="Ayuda de Compras"
      intro="De la necesidad interna al pago al proveedor: solicitud, presupuestos, orden de compra, recepción en stock, factura y orden de pago, sin cargar dos veces la misma mercadería."
      sections={SECTIONS}
      actions={<><Link to="/compras" className="btn">Centro de control</Link><Link to="/compras/facturas" className="btn btn-outline">Facturas</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve y quién puede hacer qué">
        <p style={{ margin: 0 }}>
          Compras ordena el abastecimiento: <strong>solicitudes</strong> internas, <strong>presupuestos</strong> de proveedores, <strong>órdenes de compra</strong>,
          <strong> recepciones</strong> (que suben el stock) y <strong>facturas de proveedor</strong> (que generan la deuda a pagar).
        </p>
        <ul style={{ margin: 0 }}>
          <li><strong>Ver</strong>: consulta. <strong>Cargar</strong>: crea solicitudes, órdenes, recepciones y facturas. <strong>Aprobar</strong>: aprueba o rechaza solicitudes y anula.</li>
          <li>Compras muestra precios de compra: hace falta el permiso <strong>Costos y márgenes</strong> para entrar.</li>
        </ul>
      </ManualPart>

      <ManualPart id="antes" title="2. Antes de empezar">
        <Steps>
          <Step title="Proveedores cargados con CUIT: Directorio (o “+ Nuevo Proveedor Completo” desde la orden)." />
          <Step title="Productos e insumos en Inventario → Catálogo de productos (o “+ Crear Insumo / Producto” desde la orden)." />
          <Step title="Depósitos en Inventario → Stock y depósitos." />
        </Steps>
      </ManualPart>

      <ManualPart id="circuito" title="3. El circuito de una compra, paso a paso">
        <Steps>
          <Step title="Solicitud: Compras → Solicitudes → “+ Nueva Solicitud de Compra”.">
            Quién la pide, para qué sector, la prioridad, el motivo y los artículos. Queda <em>Pendiente de Aprobación</em>.
          </Step>
          <Step title="Aprobación: “✓ Aprobar” (o rechazar con el motivo)." />
          <Step title="Presupuestos: en la solicitud, “+ Cargar Presupuesto de Proveedor”.">
            Cargá cada oferta (proveedor, importes, moneda, condición de pago, PDF adjunto). El cuadro comparativo las ordena; elegí la ganadora con “⭐ Elegir este Presupuesto”.
          </Step>
          <Step title="Orden de compra: “📝 Generar OC” (o “+ Nueva Orden de Compra” directa).">
            Proveedor, condición de pago, fecha y lugar de entrega, artículos y precios. Se imprime o descarga con “📄 PDF” para mandarla al proveedor.
          </Step>
          <Step title="Recepción: cuando llega la mercadería, Recepciones → “+ Registrar Recepción de Mercadería”.">Sube el stock (ver punto 4).</Step>
          <Step title="Factura: “🧾 Facturar” desde la recepción (o desde la orden).">Registra la deuda sin volver a sumar stock (ver punto 5).</Step>
          <Step title="Pago: “💳 Pagar” en la factura, o desde Finanzas → Órdenes de pago." />
        </Steps>
        <Tip>Los pasos de solicitud y presupuestos son opcionales: para una compra simple se puede arrancar directo con la orden, o incluso con la factura.</Tip>
      </ManualPart>

      <ManualPart id="recepcion" title="4. Recepción de mercadería">
        <Steps>
          <Step title="Elegí proveedor, depósito de ingreso y fecha. Cargá el N° de remito del proveedor (o desmarcalo si es una recepción directa)." />
          <Step title="Cada renglón tiene que tener un producto del catálogo: sin producto no se genera stock.">Podés cargar número de serie o lote.</Step>
          <Step title="Guardá: el stock del depósito sube y queda en el Kardex como recepción." />
        </Steps>
        <Tip>Si la orden se recibe en partes, la orden queda en <em>Recepción Parcial</em> hasta completarse.</Tip>
      </ManualPart>

      <ManualPart id="factura" title="5. Factura del proveedor">
        <Steps>
          <Step title="Desde la recepción (“🧾 Facturar”), la factura se vincula sola y no vuelve a sumar stock." />
          <Step title="Si cargás la factura por otro lado (“＋ Cargar Factura Manual”) y la mercadería ya entró, elegí la recepción en “Recepción ya ingresada (evita duplicar stock)”, o después en el listado con “Vincular recepción…”." />
          <Step title="Completá tipo, punto de venta y número (sin valores por defecto), fechas, CAE, renglones con su IVA y percepciones." />
        </Steps>
        <Tip warn>El sistema no deja cargar dos veces la misma factura: mismo proveedor, tipo, punto de venta y número.</Tip>
      </ManualPart>

      <ManualPart id="arca" title="6. Importar comprobantes de ARCA">
        <Steps>
          <Step title="Descargá de ARCA “Mis Comprobantes Recibidos” en CSV." />
          <Step title="Compras → Comprobantes ARCA → subí el archivo." />
          <Step title="Por cada comprobante: “⚡ Registrar Factura” (con un clic), “👥 Registrar Proveedor” si falta, o ignorarlo.">
            Los filtros muestran pendientes de carga, registrados e ignorados, así no se te escapa ninguna factura de compra.
          </Step>
        </Steps>
      </ManualPart>

      <ManualPart id="constatar" title="6 bis. Constatar las facturas recibidas en ARCA">
        <Steps>
          <Step title="Una vez: en ARCA, con clave fiscal → Administrador de Relaciones → Nueva relación → ARCA → WebServices → “Constatación de Comprobantes” → elegí el mismo certificado (alias) que usa el sistema para facturar.">
            Es el mismo certificado que ya está cargado en Configuración → ARCA; solo hay que habilitarle este servicio. Mientras
            no esté habilitado, la constatación avisa “ARCA no autorizó el acceso a wscdc”.
          </Step>
          <Step title="Compras → Facturas de compra → “🔎 Constatar en ARCA”.">
            Revisa, de a una, las facturas del mes pasado y de este mes que todavía no quedaron constatadas. ARCA confirma que el
            comprobante existe con ese CAE, CUIT del proveedor, tipo, punto de venta, número, fecha, total y que la empresa es la receptora.
          </Step>
          <Step title="En la columna CAE de cada factura queda el resultado; pasá el mouse para ver el detalle y la fecha de la consulta.">
            “✓ Constatada en ARCA”: está todo bien. “✗ ARCA no la reconoce”: algún dato no coincide (el detalle dice cuál, por
            ejemplo el importe o el CAE); revisá la factura contra el PDF y, si el error es del proveedor, pedile que la corrija.
            “No se puede constatar”: falta el CAE o el CUIT del proveedor. “No se pudo consultar”: debajo dice el motivo (por ejemplo, que
            el certificado todavía no tiene habilitada la constatación, o que ARCA no responde); corregilo y usá “Reintentar”.
          </Step>
          <Step title="Una factura también se puede constatar sola, con “Constatar” en su renglón." />
        </Steps>
        <p className="muted" style={{ margin: "8px 0 0" }}>
          El sistema no entra a la página de ARCA ni guarda la clave fiscal: usa el servicio oficial de constatación con el certificado de la empresa.
          Los comprobantes recibidos se siguen trayendo con el archivo de Mis Comprobantes.
        </p>
      </ManualPart>

      <ManualPart id="pago" title="7. Pago y cuenta corriente">
        <p style={{ margin: 0 }}>
          La factura queda en la cuenta corriente del proveedor como <em>Pendiente</em>. Se paga con una <strong>orden de pago</strong> en Finanzas
          (transferencia, cheque propio, cheque de cartera, efectivo y retenciones). Está explicado en la Ayuda de Finanzas.
        </p>
      </ManualPart>

      <ManualPart id="reportes" title="8. Evaluación de proveedores">
        <p style={{ margin: 0 }}>
          <Link to="/compras/reportes">Evaluación proveedores</Link> muestra el gasto, las órdenes abiertas, las entregas demoradas y el cumplimiento de cada proveedor.
        </p>
      </ManualPart>

      <ManualPart id="problemas" title="9. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>“Ya existe una factura con el mismo tipo, punto de venta y número para este proveedor”</>, <>Esa factura ya está cargada: buscala en el listado. Si era otra, revisá el número.</>],
          [<>“La solicitud debe estar aprobada antes de cargar cotizaciones”</>, <>Aprobá la solicitud primero.</>],
          [<>“Cada línea debe tener un producto del catálogo…” (recepción)</>, <>Elegí el producto en cada renglón o crealo en el catálogo.</>],
          [<>“El proveedor de la factura no coincide con el de la recepción / la orden”</>, <>Revisá que sea el mismo proveedor, o vinculá la recepción correcta.</>],
          [<>“Esa recepción ya está vinculada a otra factura” / “La factura ya tiene una recepción vinculada”</>, <>Cada recepción va con una sola factura: revisá cuál corresponde.</>],
          [<>“La orden de compra vinculada se encuentra anulada”</>, <>Usá otra orden o cargá la factura sin vincular.</>],
          [<>“Indicá el punto de venta y el número de factura…”</>, <>Copiá punto de venta y número tal cual del comprobante del proveedor.</>]
        ]} />
      </ManualPart>

      <ManualPart id="estados" title="10. Qué significa cada estado">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>Solicitudes:</strong> Pendiente de Aprobación, Aprobada, En Orden de Compra, Rechazada.</li>
          <li><strong>Órdenes de compra:</strong> Borrador, Enviada a Proveedor, Recepción Parcial, Recibida Completa, Anulada.</li>
          <li><strong>Recepciones:</strong> Sin factura, Facturada, Anulada.</li>
          <li><strong>Facturas de compra:</strong> Pendiente, Pago Parcial, Pagada, Anulada; y en stock: Stock Recibido, Recepción Pendiente o No inventariable.</li>
        </ul>
      </ManualPart>
    </HelpManual>
  );
}
