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
| vision | ~1.5-2.5 min | 1 llamada de queries (qwen3.6) + por escena: 1 embedding (pre-rank) y ~5 evaluaciones gemma4 |
| voice | ~5-15 s | 1 llamada TTS |
| subtitles | ~5 s a ~6 min | 1 transcripción (whisper, variable) |
| compose | ~1-2 s | ninguna (100% local) |

> `vision` **respeta las imágenes ya colocadas** en `assets/images/<slug>/`
> (override por escena; regenerar = `--force` o borrarlas) y tiene un modo
> 100% local para imágenes generadas fuera — ver AGENTS.md > Imágenes locales.

## Fichas

Los **3 casos golden** (versionados en `content/`, con recuentos de escenas
distintos a propósito):

- [`caso-ejemplo.md`](./caso-ejemplo.md) — Pompeya · histórico · **9 escenas**,
  curado a mano (ejercita el reescalado al audio real)
- [`caso-redes.md`](./caso-redes.md) — redes neuronales · técnico ·
  **10 escenas** generadas (estresa la búsqueda con tema abstracto)
- [`caso-numancia.md`](./caso-numancia.md) — Numancia · histórico España ·
  **12 escenas** generadas (ejercita el recuento parametrizado)

Y el cuarto caso, independiente, del modo de imágenes locales:

- [`caso-uso-local.md`](./caso-uso-local.md) — `caso-local` · futurista ·
  **10 escenas** con imágenes 100% generadas fuera (FLUX): 10 prompts
  coherentes (imagePrompt + artDirection), una imagen por escena
