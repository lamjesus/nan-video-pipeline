# Golden · caso-redes — Cómo aprende una red neuronal

| | |
|---|---|
| **Slug** | `caso-redes` |
| **Tipo** | Técnico (IA) · storyboard **generado** por qwen3.6 |
| **Escenas** | **10** — el recuento por defecto de la regla de generación |
| **Guion** | `content/caso-redes.yml` (versionado; regenerable) |

## Por qué es golden

Es el caso de estrés de la **búsqueda de imágenes con un tema abstracto**:
"red neuronal" tiene poco material de archivo en Wikimedia, así que aunque las
queries y el ranking ordenen bien, el pool de candidatas es flojo y gana "lo
menos malo". Es el candidato natural para el **modo local** (`media.mode:
local` o imágenes por escena en `assets/images/caso-redes/`, ver AGENTS.md >
Imágenes locales): generar las imágenes fuera con IA y dejar que el pipeline
las respete. También es el ejemplo del flujo 100% generado: de un tema en
texto a preview sin tocar nada a mano.

## Reproducir

```bash
yarn script "Cómo aprende una red neuronal: el secreto de la inteligencia artificial" caso-redes
yarn vision caso-redes
yarn voice caso-redes
yarn subtitles caso-redes
yarn compose caso-redes      # → renders/caso-redes/ (abre preview.html)
```

## Resultados medidos (2026-06-11, visión mejorada)

- Guion: 10 escenas, válido al primer intento (~30 s, `reasoning_config` off)
- Imágenes: **10/10, sin repetidas** (queries qwen3.6 + pre-rank 9-16→5).
  Queries correctas ("neural network diagram", "robotic eye close up"), pero
  la relevancia sigue desigual: es limitación del **archivo** con temas
  abstractos, no de la búsqueda ni del evaluador (p. ej. para "cat photos
  grid" el mejor candidato disponible fue un crucigrama).
- Audio kokoro: **52.4 s** estéreo
- Subtítulos: **23 bloques cortos**

## Notas

- Comparar sus imágenes con las de los casos históricos es la mejor
  demostración de por qué existe el modo local de imágenes (y la Tarea I,
  la GUI que alimentaría el pool).
