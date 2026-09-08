# quality-seed

Carga inicial de archivos del SGC ISO 17025 (cierre C1).

El **catálogo de códigos** (MC/PG/IT/externos) se siembra solo en la API al primer `GET /api/v1/quality/dashboard` o `/documents/tree`.

Este script sube **fuentes + PDF publicado** desde una carpeta local.

## Flujo

1. Descargar archivos del Drive `INMELA - BFS` a `input/` (misma carpeta o subcarpetas; el nombre debe coincidir con `fileName` en `mapping.json`).
2. Revisar / completar `mapping.json` (`missing: true` = aún no está en Drive; `generated: true` = no subir).
3. Convertir `.docx`/`.xlsx` → PDF con LibreOffice headless → `output/`.
4. `POST /api/v1/quality/files` + `attach` a la versión del catálogo.
5. Emitir `discrepancies-report.md`.

No versionar binarios en git (`input/`, `output/`).

## Requisitos

- Python 3.11+
- LibreOffice (`soffice` o `libreoffice` en PATH) para conversión
- Token JWT de un usuario del tenant (Admin / Calidad). Para `--approve` hace falta Director Técnico (`IsTechnicalDirector`).

## Uso

```bash
cd tools/quality-seed
mkdir -p input output

# 1) Colocar archivos en input/ (nombres según mapping.json)

# 2) Solo mapeo / discrepancias
python seed.py --dry-run

# 3) Carga real
export QUALITY_SEED_API=https://v2.lealcontrol.com   # o http://127.0.0.1:5209
export QUALITY_SEED_TOKEN='eyJ...'
export QUALITY_SEED_TENANT='<tenant-guid>'

python seed.py
python seed.py --approve                 # intenta aprobar versiones con PDF
python seed.py --codes MC01,PG01,PG14    # subset
```

## Idempotencia

Si la versión ya tiene `publishedFileId`, el ítem se omite (`skipped`). Se puede re-correr tras agregar archivos que faltaban.

## Notas

- PG05, PG09 (+ R), IT01–04 figuran con `missing: true` hasta que ELEVAR los suba.
- PG01-R01/R02 y PG14-R03/R04 son `generated` (vistas del sistema / C2).
