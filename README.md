# Leal Control ERP 2.0

Reescritura profesional del ERP. Leal Control 1.0 (Laravel) queda como sistema en producción y como guía de negocio. Esta solución no lo modifica.

## Levantar en Ubuntu

```bash
cd ~/Desarrollo
docker compose up -d
dotnet run --project src/Host/LealControl.Api
cd frontend && npm install && npm run dev
```

Sistema: http://localhost:5173  
API / Swagger: http://localhost:5208/swagger

Frontend: React 19 + TypeScript + Vite (`frontend/`). Tokens en `frontend/src/styles/tokens.css`.

Tenant de desarrollo (se usa si no mandás header):

`X-Tenant-Id: 11111111-1111-1111-1111-111111111111`

## Primer módulo: CRM

- Clientes con CUIT validado, condición IVA, plantas, contactos y alícuotas IIBB
- Prospectos con conversión real a cliente
- Oportunidades (embudo propio, no atado a presupuestos)
- Timeline de actividades

Ver `docs/ARCHITECTURE.md`.
