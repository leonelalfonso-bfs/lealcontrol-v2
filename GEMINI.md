# 📐 Reglas y Directivas de Proyecto: Leal Control ERP

## 🔢 Manejo de Cantidades e Inputs Numéricos en la UI
* **Incrementos de 1 en 1**: Todos los campos `<input type="number">` destinados a cantidades (`quantity`, `cant`, `unidades`, `stock`, `ítems`, `renglones`) deben contar con `step="1"` y `min="1"` (o `min="0"` según corresponda).
* **Botones Steppers (+ / -)**: Cualquier botón de incremento o decremento de cantidad debe sumar o restar exactamente **1 unidad**.
* **Formato Entero Sin Decimales**: Las cantidades en tablas, modales y renglones de presupuestos, pedidos, facturas, compras y remitos deben renderizarse y parsearse como enteros (`parseInt` / sin cifras decimales), reservando los decimales (`step="0.01"`, `toFixed(2)`) exclusivamente para **precios, importes monetarios, cotizaciones, alícuotas de IVA y porcentajes de descuento**.
* **Valores Iniciales y Placeholders**: Los inputs de cantidad deben inicializarse con un valor por defecto limpio (típicamente `1`) sin forzar que el usuario tenga que borrar caracteres extra.

## 🖥️ Arquitectura de Navegación y Formularios (Sin Modales Flotantes)
* **Pantallas Completas Dedicadas (Form Pages)**: Para la creación y edición de registros y entidades con carga de datos (comprobantes, modelos contables, informes de ensayo, contratos, etc.), **NO utilizar modales flotantes (`modal-backdrop` / popups pequeños)**. Se deben utilizar páginas completas dedicadas (`*FormPage.tsx`) con rutas propias (ej. `/modulo/nuevo`, `/modulo/:id`), aprovechando el 100% del ancho y alto de la pantalla, con botones claros de "← Cancelar / Volver" y "💾 Guardar".

