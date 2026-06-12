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

(No lleva `yarn script`: el guion curado ya está en `content/`.)

## Resultados medidos (2026-06-11)

- Imágenes: **9/9** (Wikimedia, evaluadas por gemma4 en base64)
- Audio kokoro: **58.5 s** estéreo (guion decía 90 s → escenas reescaladas ×0.65)
- Subtítulos: **26 bloques cortos** estilo CapCut (whisper + alineación LCS)
- Compose: ~1.5 s, sin cluster

## Notas

- La escena 1 ("scene-01") tiene términos de búsqueda débiles — el caso que
  motivó la mejora de search terms (pendiente) y la Tarea I (pool de imágenes).
