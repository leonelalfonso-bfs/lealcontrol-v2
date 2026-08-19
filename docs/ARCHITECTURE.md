# Arquitectura Técnica: Leal Control ERP 2.0 🏛️

Documento rector de arquitectura para el equipo de desarrollo, soporte y mantenimiento evolutivo de **Leal Control ERP 2.0**.

---

## 1. Visión General & Patrón de Diseño

Leal Control 2.0 está implementado como un **Monolito Modular** (Modular Monolith) sobre **.NET 8** en el backend y **React 19 + TypeScript + Vite** en el frontend.

### ¿Por qué Monolito Modular?
1. **Simplicidad de Despliegue:** Un único contenedor Docker en producción, reduciendo drásticamente la sobrecarga de DevOps, latencia de red inter-proceso y costos de infraestructura.
2. **Fronteras Estrictas de Dominio:** A diferencia de un monolito clásico acoplado ("espagueti"), cada módulo funciona como un microservicio lógico con su propio Dominio, Casos de Uso, Entidades de Persistencia y **Esquema de Base de Datos PostgreSQL independiente**.
3. **Evolución Futura:** Si un módulo en el futuro requiere escalar independientemente (por ejemplo, el motor de Producción o Facturación), puede extraerse a un microservicio sin reescribir la lógica de negocio.

---

## 2. Estructura de Capas por Módulo

Cada módulo de negocio se divide en cuatro proyectos o capas con responsabilidades no negociables:

```text
Modules/
└── [NombreModulo]/
    ├── LealControl.Modules.[NombreModulo].Domain
    │   ├── Entities/ (Entidades con lógica pura y reglas de invariancia)
    │   ├── ValueObjects/ (Objetos de valor inmutables: CUIT, Moneda, etc.)
    │   ├── Events/ (Eventos de dominio)
    │   └── Exceptions/ (Excepciones de dominio)
    │
    ├── LealControl.Modules.[NombreModulo].Contracts
    │   ├── DTOs/ (Data Transfer Objects públicos)
    │   └── I[NombreModulo]Module.cs (Interfaz pública expuesta a otros módulos)
    │
    ├── LealControl.Modules.[NombreModulo].Application
    │   ├── Commands/ (Casos de uso de escritura / mutación)
    │   ├── Queries/ (Casos de uso de consulta optimizada)
    │   └── Mappings/
    │
    └── LealControl.Modules.[NombreModulo].Infrastructure
        ├── Persistence/ ([NombreModulo]DbContext, mapeos EF Core, migraciones)
        ├── Repositories/ (Implementaciones concretas)
        ├── ExternalServices/ (APIs externas, ARCA, DolarApi, SMTP)
        └── Endpoints/ (Definición de Minimal APIs / Controllers expuestos a HTTP)
```

---

## 3. Reglas de Dependencia Inquebrantables

1. **El Dominio es Sagrado:** `*.Domain` no tiene dependencias de infraestructura, Entity Framework, librerías HTTP ni de ningún otro módulo. Solo referencia a `BuildingBlocks`.
2. **Los demás módulos solo ven Contratos:** Si el módulo de **Ventas** necesita consultar datos del cliente, **únicamente** puede referenciar `LealControl.Modules.Directory.Contracts`. Tiene terminantemente prohibido referenciar `Directory.Domain` o `Directory.Infrastructure`.
3. **Application no ejecuta SQL directo:** Orquesta entidades y repositorios abstractos.
4. **Verificación Automatizada por Tests:** El proyecto `tests/LealControl.ArchitectureTests` ejecuta reglas de arquitectura con **NetArchTest**. Si un desarrollador agrega una referencia prohibida entre módulos, el build se rompe automáticamente en CI/CD.

---

## 4. Partición de Base de Datos (PostgreSQL Schemas)

Para garantizar el desacoplamiento físico de los datos, cada módulo opera dentro de su propio **PostgreSQL Schema**:

| Schema | Módulo | Entidades Principales |
|---|---|---|
| `directory` | Directorio de Empresas | `Customers`, `CustomerPlants`, `CustomerContacts`, `TaxProfiles` |
| `crm` | CRM Comercial | `Leads`, `Opportunities`, `Activities`, `Pipelines` |
| `sales` | Ventas | `Quotes`, `QuoteLines`, `Orders`, `Remitos`, `Invoices`, `InvoiceLines` |
| `purchases` | Compras | `PurchaseRequests`, `PurchaseOrders`, `PurchaseReceptions`, `PurchaseInvoices` |
| `inventory` | Inventario & Stock | `Products`, `Warehouses`, `StockMovements`, `PriceLists`, `ProductVariants` |
| `production` | Fabricación Industrial | `ProductionOrders`, `BillsOfMaterial (BOM)`, `WorkCenters`, `Operations`, `Downtimes` |
| `finance` | Tesorería & Finanzas | `FinancialAccounts`, `Cheques/eCheqs`, `CurrentAccounts`, `Receipts`, `CashFlow` |
| `hr` | Recursos Humanos | `Employees`, `PayrollPeriods`, `PayrollSlips`, `EppDeliveries`, `TimeTrackings` |
| `fleet` | Flota Vehicular | `Vehicles`, `VehicleDocuments`, `VehicleDrivers`, `VehicleMaintenances`, `VehicleFuelLogs` |
| `communications` | Comunicaciones | `MailAccounts`, `EmailMessages`, `EmailThreads`, `Channels` |
| `settings` | Configuración Global | `CompanySettings`, `PrintTemplates`, `TaxCertificates` |

---

## 5. Multi-Tenancy (Aislamiento de Empresas)

- Toda entidad de base de datos incluye la columna `tenant_id (UUID)`.
- El middleware de tenancy (`TenantMiddleware`) inspecciona la cabecera HTTP `X-Tenant-Id`.
- El servicio inyectable `ITenantContext` provee el ID del tenant activo para filtrar automáticamente las consultas de Entity Framework mediante **Global Query Filters**.
- En desarrollo local, se utiliza por defecto el tenant `11111111-1111-1111-1111-111111111111`.

---

## 6. Arquitectura Frontend (React 19 + TypeScript + Vite)

### Principios de UI/UX:
1. **Tokens de Diseño CSS:** Centralizados en `frontend/src/styles/tokens.css` y `brand-layout.css`. Prohibido hardcodear paletas incoherentes; se utilizan las variables `--primary`, `--primary-glow`, `--bg-card`, `--text-main`, `--text-muted`, `--border-color`.
2. **Module Registry (`moduleRegistry.ts`):**
   - Todos los módulos, iconos, rutas, permisos y planes mínimos (*Base, Comercial, Operaciones, Empresarial*) se registran en una única fuente de verdad.
   - La barra lateral (Sidebar) y el selector de aplicaciones (App Launcher) se renderizan dinámicamente según este registro.
3. **Modales de Alta Rápida [ + ] In-Place:**
   - Formularios como Presupuestos y Órdenes de Compra cuentan con modales (`QuickCustomerModal`, `QuickProductModal`) que permiten dar de alta clientes con CUIT ARCA o productos con fotos sin perder los datos ya cargados en el comprobante.
4. **Impresión Limpia en PDF:**
   - Hojas de presupuesto, órdenes de compra y recibos de sueldo cuentan con estilos optimizados `@media print` para generar documentos vectoriales limpios sin artefactos de interfaz web.

---

## 7. Integraciones Externas

- **ARCA / AFIP (WSFE & Padrón):** Integración con Web Services SOAP/REST para autorización de facturas electrónicas con CAE y consulta de constancias de inscripción por CUIT en tiempo real.
- **DolarApi (Banco Nación):** Cotizaciones en vivo de Dólar Oficial Billete y Dólar Divisa para conversión automática en presupuestos multimoneda.
- **Libro de Sueldos Digital (LSD AFIP):** Exportador TXT de 4 registros para liquidación F.931.
- **Transferencias Bancarias:** Exportador estándar para Homebanking corporativo.
