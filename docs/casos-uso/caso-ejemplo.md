# Golden · caso-ejemplo — El día que el Vesubio sepultó Pompeya

| | |
|---|---|
| **Slug** | `caso-ejemplo` |
| **Tipo** | Histórico · storyboard **curado a mano** (no generado) |
| **Escenas** | **9** — demuestra que el pipeline no asume las 10 de la regla de generación |
| **Guion** | `content/caso-ejemplo.yml` (versionado) |

## Por qué es golden

Es el caso de referencia original del repo: guion escrito por humanos, con
tiempos "de diseño" (90s) que NO coinciden con el audio real (58.5s) — ejercita
el **reescalado de escenas a la duración medida** en compose. Tema con material
de archivo excelente en Wikimedia (volcán, ruinas, frescos).

## Reproducir

```bash
yarn vision caso-ejemplo      # 9 imágenes → assets/images/caso-ejemplo/
yarn voice caso-ejemplo       # → assets/audio/caso-ejemplo.mp3
yarn subtitles caso-ejemplo   # → assets/output/caso-ejemplo.srt
yarn compose caso-ejemplo     # → renders/caso-ejemplo/ (abre preview.html)
```

(No lleva `yarn script`: el guion curado ya está en `content/`. Ojo: `vision`
respeta las imágenes ya colocadas — para regenerarlas, `--force`.)

## Resultados medidos (2026-06-11, visión mejorada)

- Imágenes: **9/9, todas distintas** (queries de sujeto con qwen3.6 + pre-rank
  por título 14-16→5 + gemma4 sobre las top-5). Las queries pasaron de
  "wide aerial shot" a "Mount Vesuvius eruption painting" → ganadoras de
  archivo clásico: *The Last Day of Pompeii* (Brullov), *Destruction of
  Pompeii and Herculaneum*, el Gargiulo de 1631, Herculano…
- Audio kokoro: **58.5 s** estéreo (guion decía 90 s → escenas reescaladas ×0.65)
- Subtítulos: **26 bloques cortos** estilo CapCut (whisper + alineación LCS)
- Compose: ~1 s, sin cluster
- Vision completa: ~100 s (1 llamada de queries + 1 embedding y ~5 gemma4
  por escena, en serie)

## Notas

- La debilidad histórica de la escena 1 (search terms de encuadre) quedó
  resuelta con las queries por modelo; era el caso que motivó la mejora.
