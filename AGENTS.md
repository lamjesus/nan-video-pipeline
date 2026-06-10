# nan-video-pipeline

> Pipeline de video generativo usando solo modelos del cluster NaN.

## Mapa del repo

```
src/
  config/          — Configuración central (rutas, modelos, API)
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
    02-vision.ts       — Selección visual con mimo-v2.5 (Tarea C)
    03-voice.ts        — Voz con kokoro (Tarea A)
scripts/
  doctor.ts        — Preflight: env, ffmpeg, NaN API, vitest
  models-check.ts  — Smoke test de cada modelo del cluster
tests/
  lib/media/       — Tests TDD de media providers
```

## Cómo usar

```bash
# Preflight
npm run doctor

# Smoke test de modelos
npm run models:check

# Pipeline completo
npm run produce "<tema>"

# Etapas individuales
npm run script "<tema>"     # Generar guion
npm run vision caso-ejemplo  # Seleccionar imágenes
npm run voice caso-ejemplo   # Generar voz

# Tests
npm test
npm run typecheck
```

## Modelos del cluster NaN

| Modelo | Endpoint | Uso |
|--------|----------|-----|
| qwen3.6 | `POST /v1/chat/completions` | Guion, tool calling |
| deepseek-v4-flash | `POST /v1/chat/completions` | Razonamiento largo (alternativa) |
| mimo-v2.5 | `POST /v1/chat/completions` | Visión (markdown inline `![image](url)`) |
| kokoro | `POST /v1/audio/speech` | TTS (español) |
| whisper | `POST /v1/audio/transcriptions` | STT (subtítulos) |
| qwen3-embedding | `POST /v1/embeddings` | Embeddings (RAG) |

## Variables de entorno

Ver `.env.example`. Obligatorias: `NAN_BASE_URL`, `NAN_API_KEY`.
Opcionales: `NAN_VOICE_ID`, `MEDIA_PROVIDERS`, `PEXELS_API_KEY`.

## Formato de errores

```
ERROR: descripción del problema
WHY: causa raíz
FIX: cómo solucionarlo
```

## Convenciones

- Commits: Conventional Commits en inglés
- Sin atribución AI en git history
- ESM: imports con extensión `.js`
- Tests: vitest, TDD para código nuevo