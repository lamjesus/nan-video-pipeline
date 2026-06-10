# nan-video-pipeline

> Pipeline de video generativo usando solo modelos del cluster NaN.

## Mapa del repo

```
config.yml         — Modelos + voz + providers (ajustable sin tocar TS)
src/
  config/          — Carga config.yml + rutas + acceso a la API
  content/         — Storyboards (caso-ejemplo, load.ts)
  lib/
    types.ts       — Tipos del dominio (Storyboard, Scene, ArtDirection)
    nan-client.ts  — Cliente OpenAI compartido para el cluster NaN
    nan-call.ts    — Wrapper con retry + semáforo + throttle
    media/         — Proveedores de imágenes (Tarea C)
      provider.ts  — Interfaces Candidate / MediaProvider
      wikimedia.ts — Wikimedia Commons (default, sin key)
      local.ts     — Pool local (fallback offline)
      pexels.ts    — Pexels (opt-in, requiere PEXELS_API_KEY)
      index.ts     — Selector por env MEDIA_PROVIDERS
  pipeline/
    00-orchestrator.ts — Orquestador (encadena etapas)
    01-script.ts       — Guion con qwen3.6 (Tarea D)
    02-vision.ts       — Selección visual con gemma4 + base64 (Tarea C)
    03-voice.ts        — Voz con kokoro (Tarea A)
scripts/
  doctor.ts        — Preflight: env, ffmpeg, NaN API, vitest
  models-check.ts  — Smoke test de cada modelo del cluster
tests/
  lib/media/       — Tests TDD de media providers
docs/
  TAREAS.md        — Reparto de trabajo (objetivos + criterios de hecho)
  TROUBLESHOOTING.md — Hallazgos del cluster (mimo ciego, User-Agent…)
  caso-uso-1.md    — Demo de la selección visual
  sessions/        — Bitácora por sesión (memoria del equipo)
```

## Cómo usar

```bash
# Preflight
yarn doctor

# Smoke test de modelos
yarn models:check

# Pipeline completo
yarn produce "<tema>"

# Etapas individuales
yarn script "<tema>"     # Generar guion
yarn vision caso-ejemplo  # Seleccionar imágenes
yarn voice caso-ejemplo   # Generar voz

# Tests
yarn test
yarn typecheck
```

## Modelos del cluster NaN

| Modelo | Endpoint | Uso |
|--------|----------|-----|
| qwen3.6 | `POST /v1/chat/completions` | Guion, tool calling |
| deepseek-v4-flash | `POST /v1/chat/completions` | Razonamiento largo (alternativa) |
| gemma4 | `POST /v1/chat/completions` | Visión real (imagen en base64, formato array) |
| mimo-v2.5 | `POST /v1/chat/completions` | Visión legacy — CIEGO (ver `docs/TROUBLESHOOTING.md`) |
| kokoro | `POST /v1/audio/speech` | TTS (español) |
| whisper | `POST /v1/audio/transcriptions` | STT (subtítulos) |
| qwen3-embedding | `POST /v1/embeddings` | Embeddings (RAG) |

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
3. Para ver un caso real corriendo, **`docs/caso-uso-1.md`**.
4. Al cerrar una sesión de trabajo no trivial, deja una entrada en **`docs/sessions/`**
   (qué cambió y por qué) — es la memoria compartida del equipo.
5. No cambies la forma de `Storyboard` (`src/lib/types.ts`) sin avisar: todas las
   piezas dependen de ella.