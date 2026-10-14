import { Link } from "react-router-dom";
import { HelpManual, ManualPart, Step, Steps, Tip, Troubleshooting } from "../components/help/HelpManual";

const SECTIONS = [
  { id: "para-que", title: "Para qué sirve y quién puede hacer qué" },
  { id: "productos", title: "Catálogo de productos y servicios" },
  { id: "depositos", title: "Depósitos" },
  { id: "movimientos", title: "De dónde salen los movimientos de stock" },
  { id: "recuento", title: "Recuento y ajuste" },
  { id: "transferencias", title: "Transferencias entre depósitos" },
  { id: "kardex", title: "Kardex y trazabilidad" },
  { id: "reposicion", title: "Stock mínimo y reabastecimiento" },
  { id: "problemas", title: "Cuando el sistema no te deja" }
];

/** Ayuda de Inventario: manual de productos, depósitos y movimientos de stock. */
export function InventoryHelpPage() {
  return (
    <HelpManual
      eyebrow="INVENTARIO · MANUAL"
      title="Ayuda de Inventario"
      intro="Cómo cargar los productos, organizar los depósitos y entender de dónde sale cada movimiento de stock, para que lo que dice el sistema coincida con lo que hay en el estante."
      sections={SECTIONS}
      actions={<><Link to="/inventario" className="btn">Stock y depósitos</Link><Link to="/productos" className="btn btn-outline">Catálogo</Link></>}
    >
      <ManualPart id="para-que" title="1. Para qué sirve y quién puede hacer qué">
        <p style={{ margin: 0 }}>
          Inventario lleva el <strong>catálogo</strong> de productos y servicios, los <strong>depósitos</strong> (incluidos los móviles técnicos) y cada <strong>movimiento de stock</strong>.
          Casi todos los movimientos se generan solos desde Compras, Ventas y Flota; acá se hacen los recuentos y las transferencias.
        </p>
        <ul style={{ margin: 0 }}>
          <li><strong>Cargar</strong>: crea productos, depósitos, recuentos y transferencias.</li>
          <li>Los costos y precios de compra de los productos los ve solo quien tiene el permiso <strong>Costos y márgenes</strong>.</li>
        </ul>
      </ManualPart>

      <ManualPart id="productos" title="2. Catálogo de productos y servicios">
        <Steps>
          <Step title="Inventario → Catálogo de productos → “+ Nuevo Producto / Servicio”." />
          <Step title="General & Precios: código (SKU), nombre, tipo (producto o servicio), categoría, unidad, precio de venta y su moneda, costo y su moneda, y la descripción para presupuestos y facturas." />
          <Step title="Stock & Trazabilidad: “Control de Stock Físico” (si se cuenta en el depósito), stock mínimo de alerta, número de serie obligatorio o lote.">
            Los servicios y los productos sin control de stock no generan movimientos.
          </Step>
          <Step title="Contabilidad & Impuestos ARCA: alícuota de IVA y cuentas contables." />
        </Steps>
      </ManualPart>

      <ManualPart id="depositos" title="3. Depósitos">
        <p style={{ margin: 0 }}>
          En <Link to="/inventario">Stock y depósitos</Link> → “➕ Nuevo Depósito / Móvil”: almacén principal, taller o laboratorio, móvil técnico (vehículo) o cuarentena.
          El stock se ve por depósito en “🏢 Matriz Multi-Depósito”.
        </p>
      </ManualPart>

      <ManualPart id="movimientos" title="4. De dónde salen los movimientos de stock">
        <ul style={{ margin: 0, display: "grid", gap: 6 }}>
          <li><strong>📥 Recepción Proveedor</strong>: Compras → Recepciones. Suma stock.</li>
          <li><strong>📦 Remito de Venta</strong>: Ventas → Remitos. Resta stock.</li>
          <li><strong>↩ Devolución de Remito</strong>: devoluciones del cliente. Suma stock.</li>
          <li><strong>🔧 Consumo en servicio</strong>: repuestos usados en una orden de servicio de Flota que no van en el remito. Resta stock.</li>
          <li><strong>📤 / 📥 Transferencias</strong>: entre depósitos (ver punto 6).</li>
          <li><strong>⚖️ Ajuste Conteo Físico</strong>: recuentos (ver punto 5).</li>
        </ul>
        <Tip>Cada movimiento queda en el Kardex con su comprobante de origen: así siempre se puede explicar por qué cambió el stock.</Tip>
      </ManualPart>

      <ManualPart id="recuento" title="5. Recuento y ajuste">
        <Steps>
          <Step title="En el artículo, tocá “⚖️ Recuento”." />
          <Step title="Cargá la cantidad física contada y el motivo. Si el producto lo pide, número de serie o lote." />
          <Step title="Guardá: el stock pasa a ser el contado y la diferencia queda en el Kardex como ajuste." />
        </Steps>
      </ManualPart>

      <ManualPart id="transferencias" title="6. Transferencias entre depósitos">
        <Steps>
          <Step title="“➕ Nueva Transferencia Interna”: origen, destino y artículos.">Al despacharla queda “En Tránsito”.</Step>
          <Step title="Cuando llega, en el depósito de destino: “📥 Recibir en Destino”." />
        </Steps>
      </ManualPart>

      <ManualPart id="kardex" title="7. Kardex y trazabilidad">
        <p style={{ margin: 0 }}>
          “📜 Kardex & Trazabilidad” muestra todos los movimientos, con filtros por depósito, artículo y tipo de operación: cantidad, stock anterior y nuevo,
          comprobante de origen, números de serie y lote, y quién lo hizo.
        </p>
      </ManualPart>

      <ManualPart id="reposicion" title="8. Stock mínimo y reabastecimiento">
        <p style={{ margin: 0 }}>
          Los artículos por debajo de su stock mínimo aparecen como <em>Reposición Mínima</em> o <em>Quiebre / Sin Stock</em>.
          “⚡ Reabastecimiento Automático” genera una solicitud de compra con todos ellos, que sigue su circuito en Compras.
        </p>
      </ManualPart>

      <ManualPart id="problemas" title="9. Cuando el sistema no te deja">
        <Troubleshooting rows={[
          [<>“Se requieren al menos 2 depósitos para realizar una transferencia interna”</>, <>Creá el segundo depósito con “➕ Nuevo Depósito / Móvil”.</>],
          [<>“El depósito de origen y el depósito de destino no pueden ser el mismo”</>, <>Elegí otro destino.</>],
          [<>“El código SKU y el nombre del producto son obligatorios”</>, <>Completá ambos campos en la pestaña General.</>],
          [<>El stock no coincide con el estante</>, <>Mirá el Kardex del artículo para ver qué movimiento lo cambió; si hace falta, hacé un recuento.</>]
        ]} />
      </ManualPart>
    </HelpManual>
  );
}
