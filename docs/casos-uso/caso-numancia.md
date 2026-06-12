# Golden · caso-numancia — Numancia: La Última Resistencia

| | |
|---|---|
| **Slug** | `caso-numancia` |
| **Tipo** | Histórico (España) · storyboard **generado** por qwen3.6 |
| **Escenas** | **12** — generado con recuento parametrizado (`yarn script … 12`) |
| **Guion** | `content/caso-numancia.yml` (versionado; regenerable) |

## Por qué es golden

Demuestra el **recuento de escenas parametrizado** (la regla de generación ya
no es un 10 fijo: `yarn script "<tema>" <slug> 12`, validado con retry) y el
reescalado de tiempos **hacia arriba**: el guion declaró 90 s pero la narración
real duró 98.5 s → las escenas se estiran ×1.09 (el caso simétrico a Pompeya,
que encoge). Tema de historia de España con buen material de archivo.

## Reproducir

```bash
yarn script "Numancia: la ciudad española que desafió a Roma" caso-numancia 12
yarn vision caso-numancia
yarn voice caso-numancia
yarn subtitles caso-numancia
yarn compose caso-numancia    # → renders/caso-numancia/ (abre preview.html)
```

## Resultados medidos (2026-06-11, visión mejorada)

- Guion: **12 escenas** válidas al primer intento (~24 s)
- Imágenes: **12/12, sin repetidas** (queries qwen3.6 + pre-rank 9-16→5).
  Buenos aciertos de archivo (estatua de Viriato, ilustración de la guerra
  numantina de una enciclopedia de 1911) y fallos de nicho: para "Scipio
  Aemilianus bust" el archivo ofreció un busto de Aníbal — romano plausible,
  persona equivocada. Para clavar personajes concretos: colocar la imagen a
  mano en `assets/images/caso-numancia/scene-03.jpg` (override por escena).
- Audio kokoro: **98.5 s** estéreo (guion decía 90 s → escenas reescaladas ×1.09)
- Subtítulos: **42 bloques cortos**

## Notas

- El pre-rank por título acota la visión a ~5 evaluaciones gemma4 por escena
  aunque `media.candidates` siga en 8 por proveedor: iterar un caso ya no
  obliga a bajar candidatas en `config.yml` (el corte lo pone
  `media.shortlist`).
