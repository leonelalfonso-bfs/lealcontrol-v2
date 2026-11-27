# Instrucciones para agentes de programación (Antigravity, Claude Code, otros)

Leé también `GEMINI.md` (reglas de pantallas y cantidades) y `docs/CONTINUIDAD.md` (estado y documentos vigentes).
Este archivo manda sobre cómo se trabaja; si algo choca, preguntale al dueño.

## Quién y cómo
- El dueño (Leonel, BFS) prueba en staging y **fusiona él** cada PR. El agente programa, prueba, abre el PR, despliega
  staging y le explica en **español rioplatense**, sin jerga, qué cambió y qué tiene que probar.
- "Casa en orden": nada de código muerto ni duplicado; si algo se mueve, se borra el original. Cada cambio en un módulo
  actualiza su **Ayuda** (página `*HelpPage.tsx`) como manual del circuito completo.
- Antes de algo grande, mostrar el diseño y las decisiones al dueño; no implementar a ciegas.
- Cada un par de PRs el dueño pide una revisión a Claude Code: dejá PRs chicos, con descripción completa (qué, por qué,
  tests, cómo probar).

## Reglas de seguridad (no se negocian)
- El repo es **público**: nunca subir claves, contraseñas, `.env`, extractos bancarios, CSV/Excel/PDF con datos de
  clientes, ni nombres reales de clientes, proveedores o empleados (tampoco en tests: usar nombres inventados y CUIT de
  prueba como 20123456786, 30712345671, 20304050609).
- No usar `git stash`. No hacer merge a `main` (lo hace el dueño). Nunca `--force` sobre ramas ajenas.
- Antes de borrar datos o hacer algo irreversible: mostrar qué y cuánto, y esperar confirmación.
- Facturación: nunca emitir factura con condición fiscal Pendiente/Desconocida. No automatizar la web de ARCA ni guardar la
  clave fiscal.
- No ingresar contraseñas del dueño: él inicia sesión en staging.
- IA dentro del producto: es **Claude** (Anthropic) por `IAiClient`; no agregar otros proveedores sin pedido explícito.

## Entorno (WSL Ubuntu)
- Copia de trabajo: `/home/leonel/Desarrollo-dotnet10-20261009` (la carpeta `/home/leonel/Desarrollo` es otro worktree que
  tiene tomada la rama `main`: no trabajar ahí).
- .NET 10: `export DOTNET_ROOT=$HOME/.dotnet10 PATH=$HOME/.dotnet10:$PATH`
- Rama nueva por tarea, siempre desde `main` actualizado:
  `git fetch -q && git checkout -q -B <tipo>/<tema> origin/main`
- Frontend: `cd frontend && npx tsc --noEmit -p .` (tiene que salir sin errores).
- Tests (Docker tiene que estar andando; usan Testcontainers con Postgres):
  - `dotnet test tests/LealControl.Modules.Crm.IntegrationTests` (la grande, 20-30 min; filtrar con `--filter "FullyQualifiedName~Nombre"` mientras se trabaja)
  - `dotnet test tests/LealControl.Modules.Communications.Tests`, `tests/LealControl.Modules.Finance.Tests`, `tests/LealControl.Modules.Accounting.Tests`
- PR: `gh pr create ...` (si `gh pr edit` falla por "projects", usar `gh api -X PATCH repos/leonelalfonso-bfs/lealcontrol-v2/pulls/N -f body=...`).
- Desplegar staging (v2.lealcontrol.com) con el commit de la rama:
  `gh workflow run deploy-staging.yml --ref main -f ref=$(git rev-parse HEAD)`
- Producción (erp.lealcontrol.com) se despliega sola cuando el CI de `main` pasa después de la fusión.

## Arquitectura y convenciones
- Monolito modular: `src/Modules/<Módulo>/{Domain,Application,Infrastructure,Contracts}`, `src/Host/LealControl.Api` (une todo,
  automatizaciones que cruzan módulos en `Automation/` e IA en `Ai/`), `src/BuildingBlocks` (tenancy, avisos, hora argentina).
- Base por empresa (tenant) en PostgreSQL, un schema por módulo. Migraciones de Ventas/Compras: **SQL escrito a mano** en
  `Persistence/Migrations/<fecha>_<Nombre>.cs` (`ADD COLUMN IF NOT EXISTS`; el snapshot no se mantiene). Comunicaciones e IA
  crean sus tablas con `EnsureTablesCreatedAsync` (SQL idempotente).
- Fechas de negocio: hora argentina con `ArgentinaTime` (`Today`, `TodayAsUtcDate`, `BusinessCutoff` para horas hábiles).
- Permisos: `Host/Security/Permissions.cs` mapea ruta → módulo; GET = Ver, escritura = Cargar, segmentos `settings` =
  Administrar, `approve/cancel/...` = Aprobar. Datos sensibles (importes, costos, sueldos) se filtran en el servidor.
- Avisos ("Mis avisos" + resumen diario por mail): implementar `INoticeProvider` (BuildingBlocks/Notices) y registrarlo como
  singleton. `NoticeContext.SeesAmounts` dice si quien lo recibe ve importes. Agregar el código nuevo a la lista de
  `tests/.../PersonalNoticesApiTests.cs`.
- IA: `Host/Ai` — `IAiClient` (Claude con salida JSON por esquema), `AiMailReader` (Haiku, lee mails cada 5 min y abre
  oportunidades), `AiSupervisor` (Sonnet, prioridades del día desde las 6), configuración y gasto en schema `ai`. Los tests
  usan un `IAiClient` falso: nunca llamar a la API real en tests.
- Frontend (React + TS): sistema de diseño "Relieve y vidrio" en `frontend/src/styles/` (tokens `--lc-*` en
  `ds/tokens.css`). **Regla estricta de orden visual (no se negocia)**: nunca romper el estilo general ni escribir
  estilos sueltos por página (nada de colores fijos como `white`, `#fff`, `rgba(255,255,255,...)`, ni fondos o tamaños
  sueltos en `style={{...}}`). Usar siempre las clases del sistema (`btn`, `card pad`, `badge ok|warn|danger|info|off`,
  `alert`, `grid-2`, `t-small`, `muted`, `t-strong`) y tokens semánticos (`--lc-surface`, `--lc-surface-2`, `--lc-ink`,
  `--lc-line`, `--lc-accent-soft`, `--lc-warn-bg`, etc.) para que **modo claro y modo oscuro** funcionen prolijos en
  todas las pantallas. Si hace falta una clase nueva, se agrega en `frontend/src/styles/modules/<módulo>.css` usando solo
  tokens `--lc-*`; `style={{...}}` queda reservado únicamente a layout mínimo (márgenes/anchos puntuales).
- Tests de API: `CrmWebApplicationFactory` (reloj de pruebas fijo en 2/10/2026: usar `TimeProvider` del factory para "ahora").

## Estado al 26/11/2026 (último PR fusionado: #201)
- Hecho reciente: libro IVA Compras (#176-178), extractos y reinicios de finanzas (#179-184), rediseño visual (#185-194),
  bandeja (#195), mails sin atender por horas hábiles (#196), agrupación de mails (#198), seguimiento automático de
  presupuestos y avisos del CRM (#199), IA lectura de mails (#200), supervisor comercial (#201).

## Próximos pasos (en orden; mostrar diseño antes de programar)
1. **Parte administrativa de avisos**: sumar al resumen diario cobranzas vencidas (ya existe `sales.overdue-invoices`;
   revisar si alcanza), cheques por depositar (existe `finance.cheques-to-deposit`) y **cheques por pagar** (nuevo, módulo
   finance, sensibilidad Amounts). Después, recordatorios de cobranza (Fase 2 del plan de IA: borrador de mail al cliente,
   nunca envío automático).
2. Botón "Generar ahora" del informe del supervisor en la tarjeta de IA (Configuración → Comunicaciones → Correo).
3. Etapa D de IA: borradores de respuesta para mails comerciales (el usuario revisa y envía; nunca se envía solo).
4. En espera de datos del dueño: configurador de presupuestos de básculas BFS (formato igual al S00177 de PESAR, costeo por
   módulos y distancia). No empezar hasta que el dueño pase la planilla de costos.
