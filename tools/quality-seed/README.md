# quality-seed

Script de carga inicial del árbol documental ISO 17025 (fase C1).

## Qué hace

1. Descarga archivos del Drive `INMELA - BFS` a `input/` (no versionar binarios).
2. Convierte `.docx`/`.xlsx` a PDF con LibreOffice headless.
3. Resuelve códigos con `mapping.json`.
4. Crea/actualiza documentos y versiones vía API `/api/v1/quality`.
5. Emite `discrepancies-report.md`.

## Uso (cuando la API esté arriba)

```bash
# 1) Completar mapping.json revisado a mano
# 2) Exportar token admin y tenant
export QUALITY_SEED_API=http://127.0.0.1:5209
export QUALITY_SEED_TOKEN=...
export QUALITY_SEED_TENANT=...

# 3) Correr (Python 3.11+)
python seed.py --dry-run   # solo mapeo / discrepancias
python seed.py             # carga real
```

El seed de **códigos** (sin archivos) ya corre automáticamente al primer GET de `/api/v1/quality/dashboard` o `/documents/tree`.
