# CRM vivo — branding, clientes reales y WhatsApp

## Qué se sumó

1. **Logo** en sidebar + favicon (`frontend/public/logo.svg`)
2. **Alta de clientes real** con UX de CUIT (formato + dígito verificador), normalización de teléfono/WhatsApp y errores de API más claros
3. **WhatsApp profesional (click-to-chat)**
   - Botón en ficha y por contacto
   - Plantillas: Seguimiento / Cotización / Cobranza
   - Abre `wa.me` y deja actividad `WhatsApp` en el timeline

## Enfoque WhatsApp (recomendado)

**Ahora:** click-to-chat + timeline (sin Meta API). Útil, barato, profesional para vendedores.

**Después (cuando el volumen lo pida):** Meta Cloud API / WhatsApp Business Platform para bandeja entrante, plantillas oficiales y webhooks.

No conviene empezar por la API oficial: trámites, tokens y costos antes de validar el uso diario.

## Cómo probar

```bash
# API
dotnet run --project src/Hosts/LealControl.Api

# UI
cd frontend && npm run dev
```

Abrí `http://localhost:5173` → **Clientes → Nuevo cliente** con un CUIT válido y WhatsApp → desde la ficha usá las plantillas.
