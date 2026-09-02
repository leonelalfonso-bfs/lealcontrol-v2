# Deuda pendiente: npm audit moderate

Fecha: 2026-09-01

Estado actual después del hardening:

- `npm audit --audit-level=high`: pasa.
- Vulnerabilidades `critical`: 0.
- Vulnerabilidades `high`: 0.
- Vulnerabilidades `moderate`: 4.

Pendientes para resolver en esta o próxima etapa:

1. `react-router` / `react-router-dom`
   - Riesgo: moderate.
   - Fix esperado: upgrade major a React Router 7.
   - Nota: las versiones actuales más nuevas piden Node >=20, por eso no se forzó en esta etapa con Node 18.

2. `exceljs` vía `uuid`
   - Riesgo: moderate.
   - Fix esperado: actualizar cuando `exceljs` publique cadena sin advisory o reemplazar import/export Excel por implementación alternativa.
   - Nota: se reemplazó `xlsx` porque tenía advisories critical/high; este moderate remanente no bloquea producción interna.

Criterio acordado:

- No bloquear el próximo ciclo local/E2E si no quedan `critical` ni `high`.
- Resolver los `moderate` antes de declarar release comercial limpio.
