# Casos de uso

Un **caso** es un video corto definido por su storyboard (`content/<slug>.yml`,
datos en YAML editables a mano) más los assets que el pipeline genera para él
(imágenes, voz, subtítulos, workspace de render). Esta carpeta documenta el
flujo común y las fichas de los casos golden del repo.

## Requisitos

- `.env` con `NAN_BASE_URL` y `NAN_API_KEY` (copia `.env.example`)
- `ffmpeg` en el PATH (re-encode de la voz y medición de duración)
- `yarn install` y, como preflight, `yarn doctor`

## Flujo completo de un caso

```bash
yarn script "<tema>" <slug> [escenas]  # 1. guion (qwen3.6) → content/<slug>.yml
yarn vision <slug>                     # 2. 1 imagen por escena (gemma4) → assets/images/<slug>/
yarn voice <slug>                      # 3. narración (kokoro) → assets/audio/<slug>.mp3
yarn subtitles <slug>                  # 4. SRT estilo CapCut (whisper) → assets/output/<slug>.srt
yarn compose <slug>                    # 5. workspace de render → renders/<slug>/
```

El resultado se ve **sin servidor ni cluster**: doble click en
`renders/<slug>/preview.html` (audio + motion GSAP + captions sincronizados).
El `index.html` del mismo workspace es la **fuente de frames** para el runner
de HyperFrames — nace pausado y sin audio a propósito; no es un reproductor.

> ⚠️ Límite del cluster: **máximo 3 peticiones simultáneas**. Los casos se
> lanzan en máximo 2 carriles paralelos (ver
> [`../TROUBLESHOOTING.md`](../TROUBLESHOOTING.md)).

## Tiempos orientativos (medidos 2026-06-11)

| Etapa | Duración típica | Cluster |
|---|---|---|
| script | ~30 s | 1-3 llamadas (retry con feedback) |
| vision | ~2-4 min | ~8-16 evaluaciones de visión por escena |
| voice | ~5-15 s | 1 llamada TTS |
| subtitles | ~5 s a ~6 min | 1 transcripción (whisper, variable) |
| compose | ~1-2 s | ninguna (100% local) |

## Fichas

- [`caso-uso-1-vision.md`](./caso-uso-1-vision.md) — demo original de la
  selección visual (qué corre en local vs. qué necesita el cluster)
- _(pendiente: fichas de los 3 casos golden con 9/10/12 escenas — en elección)_
