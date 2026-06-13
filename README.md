# NaN Video Pipeline

Pipeline que convierte un **tema** en un **video corto narrado**, usando únicamente
los modelos del cluster **NaN** (API OpenAI-compatible). Sin servicios externos.

## Idea

```
Tema → guion → selección visual → voz → subtítulos → composición → render → MP4 (9:16)
```

Toda la información de un video vive en una estructura de datos central (el
`Storyboard`). Cada etapa la consume y la enriquece.

## Modelos del cluster y su rol

| Etapa | Modelo | Rol |
|-------|--------|-----|
| Guion | `qwen3.6` (`deepseek-v4-flash` como alternativa) | escribe el storyboard estructurado |
| Visión | `gemma4` (fallback `qwen3.6`) | evalúa candidatas reales con la imagen en **base64, formato array** (no genera imágenes) |
| Voz | `kokoro` | narración en español (`em_alex` / `ef_dora`) |
| Subtítulos | `whisper` | transcribe la voz para alinear los subtítulos |
| Biblioteca / pre-ranking | `qwen3-embedding` | pre-rankea candidatas de imagen por título; biblioteca RAG de casos (Tarea E, pendiente) |

> `mimo-v2.5` (visión legacy) está **ciego** en el cluster y no se usa —
> detalles en [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md).

Composición y render son herramientas locales (HTML + GSAP + HyperFrames + FFmpeg).

> **Nota sobre GSAP y HyperFrames:** no son dependencias instalables de este repo.
> GSAP se carga por CDN **dentro del `index.html`** de cada caso (es un script de
> navegador, no un paquete de Node). HyperFrames se ejecuta con `npx hyperframes
> render .` (se resuelve al vuelo). Por eso no aparecen en `package.json`:
> entran en escena al montar la composición, que es la etapa de render.
> FFmpeg sí debe estar instalado en el sistema (`brew install ffmpeg`).

## Estructura

```
config.yml             modelos + voz + providers (ajustable, sin tocar TS)
content/               casos (storyboards) en YAML — datos, no código
src/
  config/index.ts      rutas + acceso al cluster + carga de config.yml y .env
  content/load.ts      cargador de casos por argumento (valida el YAML)
  lib/                 types, nan-client, nan-call (throttle), ffprobe,
                       manifest, media/ (wikimedia, pexels, local)
  pipeline/            00-orchestrator → 01-script → 02-vision → 03-voice →
                       05-subtitles → 04-compose → render-runner
                       (+ lógica pura testeable en módulos aparte)
  render/              motion (presets GSAP), template (HTML/CSS), srt, preview
scripts/               doctor.ts (preflight) y models-check.ts (smoke test)
assets/audio/<slug>.mp3        narración (gitignored)
assets/images/<slug>/          imágenes por caso (gitignored)
assets/output/<slug>.srt/.mp4  subtítulos + video final (gitignored)
renders/<slug>/        workspace de render por caso (gitignored)
tests/                 vitest: lógica pura de cada etapa
docs/                  REFERENCIA, TAREAS, TROUBLESHOOTING, IMAGENES-IA,
                       caso-nan-community
```

## Requisitos previos

- **Node.js 18+** (LTS recomendado)
- **FFmpeg + ffprobe** (`brew install ffmpeg` en macOS, `apt install ffmpeg` en Linux)
- **HyperFrames** — se ejecuta vía `npx hyperframes` (no requiere instalación global)
- **pre-commit** (`pip install pre-commit` o `brew install pre-commit`) → `pre-commit install`
  (solo `gitleaks` configurado; lint/typecheck se ejecutan manualmente)
- Variables de entorno: copiar `.env.example` a `.env` y completar `NAN_BASE_URL` / `NAN_API_KEY`

## Puesta en marcha

```bash
yarn install
pre-commit install
cp .env.example .env          # completa NAN_BASE_URL y NAN_API_KEY
yarn doctor                   # verifica que todo está listo
yarn load caso-nan-community  # comprueba que la estructura carga
```

> ⚠️ **No hay CI configurado** (GitHub Actions bloqueado en la cuenta del owner).
> Antes de PR: `yarn typecheck && yarn test` en local. Ver `docs/TROUBLESHOOTING.md`
> para fallos conocidos del cluster (mimo ciego, límite 3 req, User-Agent…).

## Comandos

```bash
yarn produce "<tema>" [slug] [--skip-<etapa>]  # pipeline completo (orquestador)
yarn script "<tema>" [slug] [escenas]  # 1. guion → content/<slug>.yml
yarn vision <slug> [--force]           # 2. una imagen por escena → assets/images/<slug>/
yarn voice <slug>                      # 3. narración → assets/audio/<slug>.mp3
yarn subtitles <slug>                  # 4. SRT estilo CapCut → assets/output/<slug>.srt
yarn compose <slug>                    # 5. workspace de render → renders/<slug>/
yarn doctor                            # preflight: env + ffmpeg + hyperframes + API
yarn models:check                      # smoke test de cada modelo NaN
yarn typecheck && yarn test            # verificación local (no hay CI)
```

Etapas que admite `--skip-<etapa>`: `script`, `vision`, `voice`, `subtitles`,
`compose`, `render`, `mux`. Sin slug, el orquestador usa el YAML más reciente
de `content/`; si `content/<slug>.yml` ya existe, el guion se toma tal cual
(no se regenera).

## Casos de uso

Un **caso** es un video corto definido por su storyboard (`content/<slug>.yml`,
datos en YAML editables a mano) más los assets que el pipeline genera para él
(imágenes, voz, subtítulos, workspace de render, MP4 final).

Flujo completo, etapa a etapa:

```bash
yarn script "<tema>" <slug> [escenas]  # 1. guion (qwen3.6) → content/<slug>.yml
yarn vision <slug>                     # 2. 1 imagen por escena (gemma4) → assets/images/<slug>/
yarn voice <slug>                      # 3. narración (kokoro) → assets/audio/<slug>.mp3
yarn subtitles <slug>                  # 4. SRT estilo CapCut (whisper) → assets/output/<slug>.srt
yarn compose <slug>                    # 5. workspace de render → renders/<slug>/
yarn produce "<tema>" <slug>           # 1-7: añade render (HyperFrames) y mux (ffmpeg)
                                       #      → assets/output/<slug>.mp4
```

El resultado intermedio se ve **sin servidor ni cluster**: doble click en
`renders/<slug>/preview.html` (audio + motion GSAP + captions sincronizados).
El `index.html` del mismo workspace es la fuente de frames para HyperFrames —
nace sin audio a propósito; no es un reproductor.

Tiempos orientativos (medidos 2026-06-11):

| Etapa | Duración típica | Cluster |
|---|---|---|
| script | ~30 s | 1-3 llamadas (retry con feedback) |
| vision | ~1.5-2.5 min | 1 llamada de queries + por escena: 1 embedding (pre-rank) y ~5 evaluaciones gemma4 |
| voice | ~5-15 s | 1 llamada TTS |
| subtitles | ~5 s a ~6 min | 1 transcripción (whisper, variable) |
| compose | ~1-2 s | ninguna (100% local) |

> ⚠️ Límite del cluster: **máximo 3 peticiones simultáneas.** Dentro de un
> proceso lo garantiza `nan-call.ts`; entre procesos no hay coordinación, así
> que los casos se lanzan en máximo **2 carriles paralelos** (ver
> [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md)).

El caso vivo del repo es **`caso-nan-community`** — el video demo que explica
la comunidad NaN y el propio pipeline. Ficha completa en
[`docs/caso-nan-community.md`](./docs/caso-nan-community.md); sus imágenes se
generan con IA externa siguiendo [`docs/IMAGENES-IA.md`](./docs/IMAGENES-IA.md).

## Configuración

Dos fuentes, sin solapamiento:

- **`config.yml`** (versionado): defaults compartidos — nombres de modelo, voz por
  defecto, providers y modo de imagen. Si la plataforma renombra un modelo, se cambia aquí.
- **`.env`** (secreto, no versionado): credenciales y overrides opcionales.

### Modo de imágenes local (`media.mode: local`)

Para usar imágenes generadas con IA externa (sin búsqueda en red):

```bash
# En .env o config.yml:
MEDIA_MODE=local
MEDIA_PROVIDERS=local
```

Dos formas de colocar imágenes (combinables):

1. **Por escena (determinista):** `assets/images/<slug>/<scene-id>.jpg` — se usa tal cual.
2. **Pool descriptivo:** `assets/images/_pool/numancia_hilltop-fog.jpg` — el nombre
   del archivo se convierte en query y se empareja por similitud + gemma4.

> En ambos modos, si la imagen de una escena ya existe, **se respeta** (no busca).
> Regenerar = borrarla o `yarn vision <slug> --force`.

| Variable (.env) | Obligatorio | Descripción |
|----------|-------------|-------------|
| `NAN_BASE_URL` | ✅ | Base URL del cluster NaN (API OpenAI-compatible) |
| `NAN_API_KEY` | ✅ | Token de autenticación del miembro (secreto) |
| `NAN_VOICE_ID` | ❌ | Override de la voz kokoro (default en `config.yml`: `em_alex`) |
| `MEDIA_PROVIDERS` | ❌ | Override de providers, csv (default en `config.yml`: `wikimedia,local`) |
| `MEDIA_MODE` | ❌ | Override del modo de imágenes, `auto`/`local` (default en `config.yml`: `auto`) |
| `PEXELS_API_KEY` | ❌ | API key para Pexels (opt-in, secreto) |

## Documentación

Todo lo de detalle vive en [`docs/`](./docs/):

| Documento | Para qué |
|-----------|----------|
| [`docs/REFERENCIA.md`](./docs/REFERENCIA.md) | Referencia técnica completa: etapas, tipos, infraestructura (semilla del site de docs) |
| [`docs/TAREAS.md`](./docs/TAREAS.md) | Reparto de trabajo: objetivos y criterio de "hecho" por pieza |
| [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) | Fallos del cluster ya descubiertos y su solución (mimo ciego, User-Agent, pexels…) |
| [`docs/caso-nan-community.md`](./docs/caso-nan-community.md) | Ficha del caso vivo: el video demo de la comunidad NaN |
| [`docs/IMAGENES-IA.md`](./docs/IMAGENES-IA.md) | Cómo generar las imágenes con IA externa (modo local) |

## Estado

El pipeline está **completo e2e**: guion → visión → voz → subtítulos →
composición → render (HyperFrames) → mux (ffmpeg) producen el MP4 final.
Pendiente: el video demo (`caso-nan-community`) y el site de documentación.
El estado por pieza vive en `docs/TAREAS.md`.

> El material visual proviene de **archivo de dominio público seleccionado por
> IA** o de **imágenes generadas fuera** (modo local): los modelos del cluster
> entienden imágenes pero no las generan.

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `vision`: 0 candidatas / fallback genérico | Términos de búsqueda débiles | Usa `MEDIA_MODE=local` + pool descriptivo en `_pool/` |
| `vision`: misma imagen en varias escenas | Pool pequeño / deduplicación | Añade más imágenes a `_pool/` o usa `--force` |
| `mimo-v2.5` alucina descripciones | Modelo **ciego** en el cluster | Usa `gemma4` (config.yml → `visionEval`) |
| `Error: máxima 3 peticiones simultáneas` | Límite del cluster | Lanza casos en **máx 2 carriles paralelos** |
| `wikimedia` devuelve HTML, no imagen | Falta `User-Agent` | Ya incluido en código; si falla, revisa `docs/TROUBLESHOOTING.md` |
