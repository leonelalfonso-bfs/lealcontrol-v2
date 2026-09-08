# Leal Control ERP 2.0 — Progreso migración SaaS

> Última actualización: 31 ago 2026  
> Rama activa: `staging/metrology-2307`  
> Repo: `leonelalfonso-bfs/lealcontrol-v2`

---

## Ambientes

| Rol | URL | Carpeta VPS | Compose |
|-----|-----|-------------|---------|
| Pruebas | https://v2.lealcontrol.com | `/opt/lealcontrol-staging` | `docker-compose.staging.yml` |
| Producción | https://erp.lealcontrol.com | `/opt/lealcontrol-v2` | `docker-compose.prod.yml` |
| Landing | https://www.lealcontrol.com | (sitio estático `website/`) | — |

**Postgres staging:** usuario `lealv2`, BD `lealcontrol_v2` (catálogo master + tenant demo por defecto).

**Flujo git correcto:**
- **Commit + push** → PC local (WSL: `~/Desarrollo`), usuario `leonel@Leonel`
- **Pull + docker rebuild** → VPS (`/opt/lealcontrol-staging`), usuario `root@vps-6191106-x`
- El VPS tiene clave SSH **solo lectura** → no hacer `git push` desde el servidor

---

## Plan por fases

| # | Fase | Estado | Commit ref. |
|---|------|--------|-------------|
| 1 | BD privada por tenant (`ITenantConnectionProvider`) | ✅ Hecho | `b83a1c7` |
| 2 | Backups automáticos (local + Google Drive + cron 3:00) | ✅ Hecho | `9119d0f` |
| 3 | Demo www → SuperAdmin → aprovisionar tenant | ✅ Hecho y validado en v2 | `202e3a1` |
| 4 | Multi-empresa en login (selector) | 🔄 Código listo, **sin commit/push aún** | — |
| 5 | Sesión única por usuario | ⏳ Pendiente | — |
| 6 | Migración Laravel 1.0 + módulos restantes | ⏳ Pendiente | — |

---

## Fase 3 — Demo → SuperAdmin (completada)

### Qué hace
1. Formulario público `POST /api/v1/public/demo-requests` (anónimo, rate limit).
2. SuperAdmin ve solicitudes en `/superadmin/demos`.
3. Botón **Aprovisionar** crea tenant + BD dedicada (`leal_tenant_*`) + usuario admin.
4. `register-tenant` público bloqueado en Production.

### Archivos principales
- `src/Host/LealControl.Api/SuperAdmin/SuperAdminEndpoints.cs`
- `frontend/src/pages/superadmin/SuperAdminDemoRequestsPage.tsx`
- `website/index.html` — meta `leal-api-base` → `https://erp.lealcontrol.com`
- `website/app.js` — POST demo con API base configurable
- `deploy/nginx-www-api.conf.example` — proxy opcional www → erp

### Validado en v2 (31/08)
- `curl POST /api/v1/public/demo-requests` → HTTP 200
- SuperAdmin login: `admin@lealcontrol.com` (contraseña reseteada vía hash en BD)
- Aprovisionamiento **Demo Test SA** → BD `leal_tenant_demo_test_sa`, admin `test@demo.com`

### Fix SuperAdmin 403 (incluido en cambios locales sin commit)
Si había sesión ERP en `localStorage` (`leal_token`), el panel SuperAdmin devolvía 403.
- `frontend/src/api/client.ts` — rutas `/api/v1/superadmin/*` usan solo `leal_superadmin_token`
- `frontend/src/pages/superadmin/SuperAdminLoginPage.tsx` — limpia sesión ERP al entrar

**Workaround manual:** en consola del navegador:
```javascript
localStorage.removeItem('leal_token');
localStorage.removeItem('leal_user');
localStorage.removeItem('leal_tenant_id');
location.reload();
```

### Reset contraseña SuperAdmin (VPS)
```bash
cd /opt/lealcontrol-staging
HASH=$(python3 -c "
import os, hashlib, base64
p = 'TU_PASSWORD_AQUI'
s = os.urandom(16)
h = hashlib.pbkdf2_hmac('sha256', p.encode(), s, 100000)
print(f'{base64.b64encode(s).decode()}.{base64.b64encode(h).decode()}')
")
docker compose -f docker-compose.staging.yml exec -T postgres psql -U lealv2 -d lealcontrol_v2 \
  -c "UPDATE public.superadmin_users SET \"PasswordHash\" = '$HASH' WHERE lower(\"Email\") = 'admin@lealcontrol.com';"
```
Login: https://v2.lealcontrol.com/superadmin/login (no es el login normal del ERP).

---

## Fase 4 — Multi-empresa en login (código local, pendiente deploy)

### Objetivo de negocio
Mismo email/contraseña en varias empresas (estudios contables, 2 empresas post-migración) → selector al login y en el sidebar.

### Backend — archivos nuevos/modificados
| Archivo | Cambio |
|---------|--------|
| `src/Modules/Crm/.../Http/MultiTenantAuthResolver.cs` | **Nuevo.** Busca usuario en BD master + cada `leal_tenant_*` del catálogo `master_tenants` |
| `src/Modules/Crm/.../Http/AuthEndpoints.cs` | Login, `/me` y `switch-tenant` usan el resolver cross-DB |

**Comportamiento:**
- `POST /login` — devuelve `availableTenants[]`; acepta `tenantId` opcional para elegir empresa
- `GET /me` — repone todas las empresas del email del JWT (sobrevive al refresh)
- `POST /switch-tenant` — cambia de empresa entre BDs dedicadas distintas

### Frontend — archivos modificados
| Archivo | Cambio |
|---------|--------|
| `frontend/src/context/AuthContext.tsx` | Persiste `leal_available_tenants`; exporta `applySession()` |
| `frontend/src/pages/LoginPage.tsx` | Paso 2: **“Elegí tu Empresa”** si `availableTenants.length > 1` |
| `frontend/src/App.tsx` | Selector sidebar (ya existía, ahora recibe datos de `/me`) |

### Cómo probar multi-empresa
Requiere **mismo email + misma contraseña en 2 tenants** (en BDs distintas o en la misma BD compartida).

Ejemplo: crear `contador@test.com` en:
- Empresa Demostración (`lealcontrol_v2`)
- Demo Test SA (`leal_tenant_demo_test_sa`)

Luego login en https://v2.lealcontrol.com/login → debe aparecer selector.

---

## Comandos deploy habituales

### WSL (commit + push)
```bash
cd ~/Desarrollo
git status
git add <archivos>
git commit -m "mensaje"
git push origin staging/metrology-2307
```

### VPS (solo pull + rebuild)
```bash
cd /opt/lealcontrol-staging
git pull --ff-only origin staging/metrology-2307
docker compose -f docker-compose.staging.yml --env-file .env up -d --build api web
git log -1 --oneline   # verificar commit
```

### Health / smoke tests
```bash
curl -s -o /dev/null -w "%{http_code}" https://v2.lealcontrol.com/health
curl -s -w "\nHTTP %{http_code}\n" -X POST https://v2.lealcontrol.com/api/v1/public/demo-requests \
  -H "Content-Type: application/json" \
  -d '{"companyName":"Test","contactFullName":"X","email":"x@test.com","phone":"3416000000"}'
```

---

## Seguridad — pendientes conocidos

- [ ] Backdoor dev en `AuthEndpoints.cs`: crea admin con `admin123` si email es `admin@lealcontrol.com` / `admin` y no existe
- [ ] `erp.lealcontrol.com` (prod) aún no tiene código nuevo de seguridad/Fase 3-4
- [ ] Rotar/documentar `SUPERADMIN_BOOTSTRAP_PASSWORD` en `.env` staging

---

## Checklist para mañana

### Prioridad 1 — Subir y validar Fase 4
- [ ] En **WSL** (`cd ~/Desarrollo`): verificar `git status` — deben aparecer archivos Fase 4 + fix SuperAdmin
- [ ] Commit sugerido: `Add multi-company login across dedicated tenant databases`
- [ ] `git push origin staging/metrology-2307`
- [ ] En **VPS**: `git pull` + rebuild `api` y `web`
- [ ] Crear usuario de prueba multi-empresa (mismo email en 2 tenants)
- [ ] Probar login → selector de empresa → cambio desde sidebar → refresh (F5) mantiene selector

### Prioridad 2 — Cerrar Fase 3 en www
- [ ] Subir `website/` a www.lealcontrol.com (o deploy del sitio estático)
- [ ] Confirmar meta `leal-api-base` apunta a `https://erp.lealcontrol.com` (o v2 en pruebas)
- [ ] Opcional: aplicar fragmento `deploy/nginx-www-api.conf.example` si se prefiere proxy `/api` desde www
- [ ] Probar formulario demo real desde www → ver solicitud en SuperAdmin v2

### Prioridad 3 — Login cliente demo
- [ ] Login con `test@demo.com` en https://v2.lealcontrol.com/login (contraseña del aprovisionamiento)
- [ ] Confirmar que entra a **Demo Test SA** y no a Empresa Demostración

### Prioridad 4 — Fase 5 (siguiente desarrollo)
- [ ] Definir regla de sesión única: ¿invalidar JWT anterior al nuevo login? ¿un dispositivo? ¿tabla `active_sessions` en master?
- [ ] Implementar y probar

### Prioridad 5 — Cuando v2 esté estable
- [ ] Merge `staging/metrology-2307` → rama staging principal
- [ ] Promover a `main` / deploy en `erp.lealcontrol.com`
- [ ] Planificar migración de las 2 empresas reales desde Laravel 1.0

### Recordatorios operativos
- [ ] Backups: cron `0 3 * * *` en VPS — verificar `/usr/local/bin/leal-backup.sh`
- [ ] No confundir: SuperAdmin = `/superadmin/login` | Clientes = `/login`
- [ ] Si SuperAdmin da 403: limpiar `leal_token` del localStorage o usar ventana incógnito

---

## Estado tenants en v2 (31/08)

| Empresa | Slug | BD PostgreSQL | Admin |
|---------|------|---------------|-------|
| Empresa Demostración | `demo` | `lealcontrol_v2` | `admin@lealcontrol.com` |
| Demo Test SA | `demo-test-sa` | `leal_tenant_demo_test_sa` | `test@demo.com` |

---

## Referencias rápidas

- SuperAdmin staging: https://v2.lealcontrol.com/superadmin/login
- ERP clientes staging: https://v2.lealcontrol.com/login
- Solicitudes demo: https://v2.lealcontrol.com/superadmin/demos
- Guía dev general: `docs/DEVELOPER_GUIDE.md`
- Arquitectura: `docs/ARCHITECTURE.md`
