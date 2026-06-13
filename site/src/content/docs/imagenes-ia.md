---
title: Imágenes con IA externa
description: Cómo alimentar la etapa de visión con imágenes generadas fuera del cluster.
---

El cluster NaN entiende imágenes pero no las genera. Para temas sin archivo
fotográfico (técnicos, abstractos, de marca), las imágenes se generan con una
IA externa y la etapa de visión las consume en **modo local** (cero red).

## El patrón de prompts

Cada escena combina dos piezas del storyboard:

1. **Prompt base de estilo** — derivado de `artDirection` (medium, paleta,
   iluminación, textura, mood…). Se pega idéntico en todas las escenas para
   mantener coherencia visual.
2. **Prompt de escena** — el `imagePrompt` de cada escena (en inglés), que
   describe el contenido concreto.

## Dónde colocar los ficheros

Dos formas, combinables:

- **Por escena (determinista):** `assets/images/<slug>/<scene-id>.png` — se usa
  tal cual, sin búsqueda ni visión.
- **Pool con nombres descriptivos:** `assets/images/_pool/` — p. ej.
  `gpu-server-room_volumetric-light.png`. El nombre se convierte en texto y se
  empareja a cada escena con pre-ranking + `gemma4`.

En ambos casos, si la imagen de una escena ya existe, la etapa la **respeta**;
regenerar = borrarla o `yarn vision <slug> --force`.
