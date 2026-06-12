# Caso de uso — Imágenes locales (generadas fuera con IA)

Valida el **modo local de imágenes** con material generado en un generador
externo (probado con **FLUX.2 Klein 9B** del generador de la comunidad; sus
inputs son *prompt*, *aspect ratio* y *variants* x1-x4). Se ejercita sobre
`caso-redes`, el golden técnico cuyas candidatas de archivo son flojas — el
caso para el que existe este modo.

Referencia del modo: AGENTS.md > Imágenes locales.

## Receta del prompt

**Prompt = `imagePrompt` de la escena + la `artDirection` del caso** (la
dirección de arte mantiene coherentes las escenas de un mismo video). Para
`caso-redes` el sufijo de estilo es:

> 3D animation style, smooth and clean, electric blue and deep purple palette
> with white highlights, neon glow, high contrast, glassy and metallic
> textures, futuristic and educational mood, centered composition with depth
> of field

- **Aspect ratio: 9:16** (video vertical 1080×1920; si no está, el vertical
  más cercano — el CSS recorta en `cover`).
- **Variants:** x1 para el flujo A (eliges tú); x4 para el flujo B (elige
  gemma4 entre tus variantes).

Escenas sugeridas (las dos peores selecciones de archivo de 2026-06-11):

| Escena | Prompt base (añadir el sufijo de estilo) |
|---|---|
| scene-04 | A grid of simple cat photos entering a translucent digital funnel, clean interface, bright lighting, minimalist style |
| scene-05 | A digital label saying "Dog" next to a cat photo, with a large red X mark over it, clear and bold graphics |

## Flujo A — Override por escena (determinista, x1)

```powershell
Remove-Item assets/images/caso-redes/scene-04.*          # la actual tiene prioridad
Copy-Item tu-flux.png assets/images/caso-redes/scene-04.png
yarn vision caso-redes        # debe loguear "Override: scene-04.png ya colocada"
yarn compose caso-redes
start renders/caso-redes/preview.html
```

Sin `MEDIA_MODE`: el override se respeta en **ambos** modos. Con las 10
escenas cubiertas, `yarn vision` no hace ninguna llamada al cluster.

## Flujo B — Pool con variantes (x4, gemma4 elige)

```powershell
# Las 4 variantes al pool con nombre DESCRIPTIVO en inglés:
# el nombre del fichero es lo que se matchea contra la query de la escena.
Copy-Item v1.png assets/images/_pool/dog-label-cat-photo-red-x-mark-v1.png
# ... v2, v3, v4 igual

Remove-Item assets/images/caso-redes/scene-05.*          # libera SOLO esa escena
$env:MEDIA_MODE = 'local'
yarn vision caso-redes        # 9 overrides + scene-05 desde el pool (4 → gemma4)
$env:MEDIA_MODE = $null
yarn compose caso-redes && start renders/caso-redes/preview.html
```

En modo local **no hay red de búsqueda**, pero el cluster sí se usa:
embeddings para emparejar pool↔escena y gemma4 para elegir variante.

## Qué comprobar

- Flujo A: el log dice `Override: …` para tu escena y `0` búsquedas; el
  preview muestra tu imagen en la escena 4.
- Flujo B: el log dice `Proveedores activos: local` y `Pre-rank`/`Elegida`
  solo para la escena liberada; en el preview, una de tus 4 variantes.
- Caso entero en local: `MEDIA_MODE=local` + `yarn vision caso-redes --force`
  con un pool que cubra las 10 escenas; lo que no cubra **falla en alto** con
  la lista de escenas sin imagen (no hay escenas en negro silenciosas).
