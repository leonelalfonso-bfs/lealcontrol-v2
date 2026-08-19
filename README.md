# Leal Control ERP 2.0 🚀

**Leal Control ERP 2.0** es una solución integral de gestión empresarial e industrial de nueva generación, diseñada con arquitectura de **Monolito Modular** en .NET 8 (C#) y **React 19 + TypeScript + Vite** en el frontend.

El sistema fue concebido como un reemplazo y evolución arquitectónica de *Leal Control 1.0*, incorporando estándares empresariales de Domain-Driven Design (DDD), separación estricta por esquemas de base de datos PostgreSQL, soporte multi-tenant por encabezado o resolución dinámica, e integraciones nativas con servicios fiscales de Argentina (ARCA / AFIP WSFE, Padrón CUIT en vivo, Libro de Sueldos Digital F.931) y cotizaciones de moneda en tiempo real (DolarApi BNA).

---

## 🏛️ Arquitectura del Sistema

El backend está organizado siguiendo los principios de **Clean Architecture** y **Domain-Driven Design (DDD)** bajo un patrón de **Modular Monolith**:

```text
src/
├── BuildingBlocks/
│   └── LealControl.BuildingBlocks/                # Primitivos transversales (Result<T>, TenantId, AggregateRoot, DomainEvents)
├── Modules/
│   ├── Directory/                                 # Directorio fiscal de empresas, padrón CUIT, plantas y contactos
│   ├── Crm/                                       # CRM comercial: Prospectos, Oportunidades de negocio y Actividades
│   ├── Sales/                                     # Ventas: Presupuestos multimoneda, Pedidos, Remitos y Facturación ARCA
│   ├── Purchasing/                                # Compras: Solicitudes, Órdenes de compra, Recepciones y Mis Comprobantes
│   ├── Inventory/                                 # Inventario: Control de stock por depósitos y catálogo de productos
│   ├── Production/                                # Fabricación: BOM/Estructuras, Rutas, Centros de trabajo, Órdenes y OEE
│   ├── Finance/                                   # Tesorería: Bancos, Cajas, eCheqs, Cuentas Corrientes y Cashflow
│   ├── HumanResources/                            # RRHH: Legajos 360°, EPP Res. SRT 299/11, Liquidación Multi-Convenio y AFIP LSD
│   ├── Fleet/                                     # Flota: Unidades, Pólizas, VTV, Mantenimientos preventivos y Consumo KM/L
│   └── Communications/                            # Bandeja de correo unificada (IMAP/SMTP) y canales
└── Host/
    └── LealControl.Api/                           # Entry point web, inyección de dependencias y middlewares
```

Cada módulo posee su propio **Schema aislado en PostgreSQL**:
- `directory` • `crm` • `sales` • `purchases` • `inventory` • `production` • `finance` • `hr` • `fleet` • `communications` • `settings`

---

## ⚡ Requisitos Previos

- **.NET 8 SDK**
- **Node.js 20+** y **npm**
- **Docker** y **Docker Compose**
- **PostgreSQL 16+** (levantado vía Docker)

---

## 🚀 Puesta en Marcha en Desarrollo

### 1. Clonar el repositorio
```bash
git clone https://github.com/leonelalfonso-bfs/lealcontrol-v2.git
cd lealcontrol-v2
```

### 2. Levantar la Base de Datos con Docker
```bash
docker compose up -d
```
> Esto inicia una instancia de PostgreSQL en `localhost:5432` con usuario `postgres` y base de datos `lealcontrol_dev`.

### 3. Ejecutar el Backend (.NET 8)
```bash
dotnet run --project src/Host/LealControl.Api
```
- **API Base**: `http://localhost:5208`
- **Swagger / OpenAPI**: `http://localhost:5208/swagger`

### 4. Ejecutar el Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
- **App Web**: `http://localhost:5173`

---

## 🔑 Multi-Tenancy & Autenticación

Todas las peticiones a la API utilizan el encabezado `X-Tenant-Id` para aislar los datos entre empresas. En entorno de desarrollo local, si no se envía el header, se asume por defecto el tenant de prueba:
`X-Tenant-Id: 11111111-1111-1111-1111-111111111111`

---

## 📦 Módulos Principales del Sistema

1. **🏢 Directorio (`/directorio`)**: Maestro de empresas con búsqueda en vivo al Padrón ARCA por CUIT, múltiples plantas y personas de contacto.
2. **🎯 CRM (`/crm`)**: Centro de pendientes, embudo de prospectos (leads), oportunidades comerciales y timeline de interacción.
3. **💼 Ventas (`/ventas`)**: Presupuestos multimoneda con cotización DolarApi BNA, fotos de producto, pedidos, remitos oficiales con código de barras y facturación electrónica ARCA.
4. **🛒 Compras (`/compras`)**: Circuito de compras: Solicitudes internas, Órdenes de compra, Recepciones de mercadería y Mis Comprobantes ARCA.
5. **📦 Inventario (`/inventario`)**: Control de stock multidepósito, catálogo de artículos con matriz de precios en 3 monedas y trazabilidad.
6. **🏭 Producción (`/produccion`)**: Órdenes de fabricación, listas de materiales (BOM), tiempos de parada, centros de mecanizado y costeo real.
7. **💳 Finanzas (`/finanzas`)**: Cajas y Bancos en ARS/USD, cartera integral de eCheqs/cheques, resúmenes de cuenta corriente, cobranzas y cashflow proyectado.
8. **👥 Recursos Humanos (`/rrhh`)**: Legajos 360°, control de EPP (Res. SRT 299/11), liquidación multi-convenio (Comercio, UOM, UOCRA), recibos con firma digital SHA-256 (Ley 25.506) y exportación a **Libro de Sueldos Digital AFIP (F.931)** y TXT Bancario.
9. **🚛 Gestión de Flota (`/flota`)**: Ficha automotor, alertas preventivas de vencimiento a 30 días de **VTV / RTO y Seguros**, historial de mantenimientos por KM y control de combustible con cálculo de **KM / Litro**.
10. **🛠️ Configuración (`/configuracion`)**: Identidad corporativa, subida de Logo institucional, certificados fiscales (.crt / .key) y plantillas de impresión.

---

## 🚢 Despliegue en Servidor de Producción (VPS)

El proyecto incluye configuración Docker lista para producción (`docker-compose.prod.yml` y `Dockerfile` multi-stage):

```bash
cd /opt/lealcontrol-v2
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

---

## 📚 Documentación Técnica Adicional

- [Arquitectura Modular & DDD](docs/ARCHITECTURE.md)
- [Guía de Desarrollo y Onboarding](docs/DEVELOPER_GUIDE.md)
- [Especificación Detallada de Módulos](docs/MODULES_SPECIFICATION.md)
- [Reglas de Interfaz y UI Guidelines](docs/UI_LAYOUT_RULES.md)
