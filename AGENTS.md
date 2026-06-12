# nan-video-pipeline

> Pipeline de video generativo usando solo modelos del cluster NaN.

## Mapa del repo

```
config.yml         — Modelos + voz + providers + candidatas (ajustable sin tocar TS)
content/           — Casos (storyboards) en YAML: DATOS editables, no código
src/
  config/          — Carga config.yml + .env + rutas + acceso a la API
  content/load.ts  — Cargador: parsea content/<slug>.yml y valida la estructura
  lib/
    types.ts       — Tipos del dominio (Storyboard, Scene, ArtDirection)
    nan-client.ts  — Cliente OpenAI compartido para el cluster NaN
    nan-call.ts    — Throttle GLOBAL del proceso (máx 3 en vuelo, 60 rpm) + retry
    ffprobe.ts     — Duración real del audio
    manifest.ts    — Tipos + builder puro del manifest de render
    media/         — Proveedores de imágenes (wikimedia default, local, pexels opt-in)
  pipeline/
    00-orchestrator.ts — Orquestador (encadena etapas; en construcción)
    01-script.ts       — Guion qwen3.6 → content/<slug>.yml (validado, con retry)
    script-util.ts     — Puro: extractJson + validateStoryboard
    02-vision.ts       — Selección visual gemma4 → assets/images/<slug>/
    vision-util.ts     — Puro: search terms, ext/mime, ranking
    03-voice.ts        — Voz kokoro → assets/audio/<slug>.mp3
    04-compose.ts      — Compose → renders/<slug>/ (manifest + HTML + assets + preview)
    compose-util.ts    — Puro: copy plan, reescalado al audio real, manifest portable
    05-subtitles.ts    — Subtítulos whisper → assets/output/<slug>.srt
    subtitle-util.ts   — Puro: alineación LCS + chunking estilo CapCut
  render/
    motion.ts      — Motion en español → presets GSAP
    srt.ts         — Parser SRT
    template.ts    — index.html + styles.css deterministas (9:16, para HyperFrames)
    preview.ts     — preview.html reproducible con doble click (audio + captions)
renders/           — Workspaces de render por caso (artefactos, gitignored)
scripts/
  doctor.ts        — Preflight: env, ffmpeg, NaN API, vitest
  models-check.ts  — Smoke test de cada modelo del cluster
tests/             — vitest: lógica pura de cada etapa
docs/
  TAREAS.md        — Reparto de trabajo (objetivos + criterios de hecho)
  TROUBLESHOOTING.md — Hallazgos del cluster (mimo ciego, límite de 3, User-Agent…)
  casos-uso/       — Casos de uso documentados (golden cases)
  sessions/        — Bitácora por sesión (memoria del equipo)
```

## Cómo usar

```bash
# Preflight
yarn doctor

# Smoke test de modelos
yarn models:check

# Pipeline completo (orquestador, en construcción)
yarn produce "<tema>"

# Etapas por caso (slug = nombre del caso, p.ej. caso-ejemplo)
yarn script "<tema>" [slug] [escenas]  # guion → content/<slug>.yml (10 escenas por defecto)
yarn vision <slug>     # 1 imagen por escena → assets/images/<slug>/
yarn voice <slug>      # narración → assets/audio/<slug>.mp3
yarn subtitles <slug>  # SRT estilo CapCut → assets/output/<slug>.srt
yarn compose <slug>    # workspace de render → renders/<slug>/ (abre preview.html)

# Tests
yarn test
yarn typecheck
```

> ⚠️ **Límite del cluster: máximo 3 peticiones simultáneas a la API.** Dentro de
> un proceso ya lo garantiza `nan-call.ts`; entre procesos no hay coordinación,
> así que los casos se lanzan en **máximo 2 carriles paralelos**
> (ver `docs/TROUBLESHOOTING.md`).

## Imágenes locales (generadas fuera / colocadas a mano)

Dos modos para la etapa de visión (`config.yml` → `media.mode`, override
puntual con la env `MEDIA_MODE`):

- **`auto`** (default): busca candidatas en los providers (Wikimedia…),
  qwen3.6 genera la query de cada escena, qwen3-embedding pre-rankea por
  título (solo el top `media.shortlist` se descarga) y gemma4 elige sobre
  los píxeles reales.
- **`local`**: cero red. Para imágenes **generadas con IA externa** (u otra
  fuente manual). Dos formas de colocarlas, combinables:
  1. **Por escena (determinista):** `assets/images/<slug>/<scene-id>.jpg`
     (también png/gif/webp/svg) — se usa tal cual, sin búsqueda ni visión.
  2. **Pool con nombres descriptivos:** `assets/images/_pool/` — p. ej.
     `numancia_hilltop-fog.jpg`. El nombre se convierte en texto y se
     empareja a cada escena con el mismo pre-ranking + gemma4 (el pool
     entero entra al ranking, no solo los primeros N). El cluster sí se usa
     para emparejar; el modo offline real es otra cosa (TROUBLESHOOTING).

En **ambos modos**, si la imagen de una escena ya existe en
`assets/images/<slug>/`, la etapa la **respeta** y no busca; regenerar =
borrarla o `yarn vision <slug> --force`.

## Modelos del cluster NaN

| Modelo | Endpoint | Uso |
|--------|----------|-----|
| qwen3.6 | `POST /v1/chat/completions` | Guion, tool calling |
| deepseek-v4-flash | `POST /v1/chat/completions` | Razonamiento largo (alternativa) |
| gemma4 | `POST /v1/chat/completions` | Visión real (imagen en base64, formato array) |
| mimo-v2.5 | `POST /v1/chat/completions` | Visión legacy — CIEGO (ver `docs/TROUBLESHOOTING.md`) |
| kokoro | `POST /v1/audio/speech` | TTS (español) |
| whisper | `POST /v1/audio/transcriptions` | STT (subtítulos) |
| qwen3-embedding | `POST /v1/embeddings` | Embeddings (RAG + pre-ranking de candidatas) |
| rerank | *(sin ruta aún)* | Anunciado (Qwen3-Reranker-8B), **NO desplegado** — `yarn models:check` lo sondea (ver `docs/TROUBLESHOOTING.md`) |

## Configuración

- **`config.yml`** (versionado): modelos, voz por defecto y providers. Si la
  plataforma renombra un modelo, se cambia aquí (no en el código).
- **`.env`** (secreto): `NAN_BASE_URL`, `NAN_API_KEY` obligatorias; overrides
  opcionales `NAN_VOICE_ID`, `MEDIA_PROVIDERS`, `PEXELS_API_KEY`. Ver `.env.example`.

## Formato de errores

```
ERROR: descripción del problema
WHY: causa raíz
FIX: cómo solucionarlo
```

## Convenciones

- Casos = **datos** (`content/<slug>.yml`), nunca código: los genera `yarn script`,
  se editan a mano y el cargador los valida al usarlos. Los artefactos generados
  (`assets/*`, `renders/`) no se versionan.
- Gestor de paquetes: **yarn** (no npm). Lockfile: `yarn.lock`.
- Commits y ramas: Conventional Commits, **en inglés**, sin atribución a herramientas
  de IA ni referencias a fases internas (ej. `feat/media-providers`, no `feat/fase-3`).
- ESM: imports con extensión `.js`.
- Tests: vitest, **TDD para código nuevo**. Lógica pura → módulo aparte y testeable
  (ej. `vision-util.ts`), no enterrada en un script con `main()` autoejecutable.
- Errores: formato `ERROR / WHY / FIX`.

## Cómo trabajar en este repo (para agentes y personas)

1. Lee este `AGENTS.md` y el reparto en **`docs/TAREAS.md`** (cada tarea es autónoma:
   objetivo, archivo, criterio de "hecho"; respeta el dueño marcado).
2. Antes de tocar el cluster, mira **`docs/TROUBLESHOOTING.md`**: recoge los fallos
   ya descubiertos (mimo ciego, User-Agent de Wikimedia, pexels…) para no repetirlos.
3. Para ver un caso real corriendo, **`docs/casos-uso/`** (flujo común + fichas).
4. Al cerrar una sesión de trabajo no trivial, deja una entrada en **`docs/sessions/`**
   (qué cambió y por qué) — es la memoria compartida del equipo.
5. No cambies la forma de `Storyboard` (`src/lib/types.ts`) sin avisar: todas las
   piezas dependen de ella.