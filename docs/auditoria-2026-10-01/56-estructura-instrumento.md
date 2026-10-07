# Estructura "Instrumento": menú, barra superior y buscador ⌘K

Rama: `codex/ui-shell-20261008`, sobre `codex/buscadores-20261006` (PR 73).

## Qué cambia

- **Menú lateral:** todos los módulos habilitados, agrupados por área (General, Comercial, Operaciones, Administración), con íconos de línea en lugar de emojis. El módulo actual se despliega solo, como acordeón, y el menú se desplaza hasta el ítem activo. El "Centro de Aplicaciones" ya no hace falta.
- **Empresa:** tarjeta con logo o iniciales y CUIT. Si el usuario tiene varias empresas, al hacer clic aparece la lista para cambiar.
- **Barra superior:** ubicación completa (por ejemplo "Ventas / Presupuestos / Nuevo"), buscador, bandeja si Comunicaciones está habilitado, modo claro u oscuro y botón "Nuevo" con las altas frecuentes según los módulos habilitados.
- **Buscador universal (Ctrl K / ⌘K):** pantallas recientes, altas rápidas, módulos, todas las pantallas del menú, empresas y productos (búsqueda en el servidor con la regla común) y acciones del sistema (tema, cerrar sesión). Se maneja con ↑↓, Enter y Esc.
- **Usuario:** menú con modo claro u oscuro, personalización del tema, configuración y cierre de sesión.
- **Modo presentación:** se mantiene igual, con su botón en el pie del menú. En ese modo no se ofrecen altas ni búsquedas de clientes y productos.
- **Celular:** el menú se abre como cajón desde la barra superior.

## Puente de colores

`styles/bridge.css` se carga último y asigna los valores de "Instrumento" a las variables que usan los temas anteriores (`--primary`, `--ink`, `--surface`, `--line`…). Así, las pantallas existentes adoptan la paleta, la tipografía Geist y el modo oscuro sin reescribirse. Los colores escritos a mano dentro de las pantallas (por ejemplo, el encabezado azul del tablero de inicio) se migran en bloques siguientes.

## Archivos

- `components/shell/AppShell.tsx`, `components/shell/CommandPalette.tsx`
- `components/ui/Icon.tsx`: íconos de línea propios, sin dependencias nuevas.
- `app/quickActions.ts`: altas compartidas entre "Nuevo" y ⌘K.
- `app/moduleRegistry.ts`: ícono (`glyph`) y área de cada módulo.
- `styles/shell.css`, `styles/bridge.css`

## Validación

Recorrido con Playwright: inicio, clientes, nuevo presupuesto, ⌘K vacío, búsqueda de empresas y de acciones, menú "Nuevo", modo oscuro en facturas y calidad, y celular con el menú abierto. Sin errores de consola. Frontend compilado.
