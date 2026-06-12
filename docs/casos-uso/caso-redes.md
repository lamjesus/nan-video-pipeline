# Golden · caso-redes — Cómo aprende una red neuronal

| | |
|---|---|
| **Slug** | `caso-redes` |
| **Tipo** | Técnico (IA) · storyboard **generado** por qwen3.6 |
| **Escenas** | **10** — el recuento por defecto de la regla de generación |
| **Guion** | `content/caso-redes.yml` (versionado; regenerable) |

## Por qué es golden

Es el caso de estrés de la **búsqueda de imágenes con un tema abstracto**:
"red neuronal" tiene poco material de archivo en Wikimedia, así que las
candidatas son flojas y se ve dónde aporta subir `media.candidates` en
`config.yml` — y dónde haría falta el pool de imágenes generadas (Tarea I).
También es el ejemplo del flujo 100% generado: de un tema en texto a preview
sin tocar nada a mano.

## Reproducir

```bash
yarn script "Cómo aprende una red neuronal: el secreto de la inteligencia artificial" caso-redes
yarn vision caso-redes
yarn voice caso-redes
yarn subtitles caso-redes
yarn compose caso-redes      # → renders/caso-redes/ (abre preview.html)
```

## Resultados medidos (2026-06-11)

- Guion: 10 escenas, válido al primer intento (~30 s, `reasoning_config` off)
- Imágenes: **10/10** elegidas — la relevancia es desigual (limitación de
  archivo con temas abstractos, no del evaluador)
- Audio kokoro: **52.4 s** estéreo
- Subtítulos: **23 bloques cortos**

## Notas

- Comparar sus imágenes con las de los casos históricos es la mejor
  demostración de por qué existe la Tarea I (imágenes generadas al pool local).
