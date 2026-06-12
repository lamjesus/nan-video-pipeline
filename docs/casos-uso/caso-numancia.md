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

## Resultados medidos (2026-06-11)

- Guion: **12 escenas** válidas al primer intento (~24 s)
- Imágenes: **12/12** (visión con 8 candidatas/proveedor: ~4 min)
- Audio kokoro: **98.5 s** estéreo (guion decía 90 s → escenas reescaladas ×1.09)
- Subtítulos: **42 bloques cortos**

## Notas

- Con 12 escenas la visión es la etapa más cara (~20 s/escena con 8
  candidatas). Si se itera mucho un caso, bajar `media.candidates` en
  `config.yml` durante el desarrollo y subirlo para la pasada final.
