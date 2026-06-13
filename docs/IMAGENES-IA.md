# Generar imágenes con IA externa (modo local)

Guía **general** (vale para cualquier caso) para producir las imágenes de un
video con un generador de IA externo y dárselas al pipeline. Los modelos del
cluster NaN entienden imágenes pero **no las generan**; para temas sin material
de archivo (técnicos, futuristas, nicho) la solución es generar fuera y usar el
modo de imágenes locales. La mecánica del modo está en
**AGENTS.md > Imágenes locales**; esto es la receta de uso.

## La receta de prompts: estilo común + escena

Cada caso trae los dos ingredientes en su YAML (`content/<slug>.yml`):

1. **Prompt de estilo (común a todas las escenas)** — se construye con la
   `artDirection` del storyboard (`medium`, `lineWork`, `palette`, `lighting`,
   `texture`, `mood`, `composition`, `humanTreatment`, `constraints`). Se pega
   como **sufijo en TODOS los prompts**: es lo que hace que las N imágenes
   parezcan del mismo video.
2. **Prompt de escena (variable)** — el `imagePrompt` de cada escena: el
   contenido concreto que se ve.

Plantilla del prompt final de cada escena:

```
<imagePrompt de la escena>. <medium>. <lineWork>. <palette>. <lighting>.
<texture>. <mood>. <composition>. <humanTreatment>. <constraints>.
9:16 aspect ratio.
```

**Aspect ratio: 9:16** (video vertical). Probado con FLUX en el generador de la
comunidad (inputs: *prompt*, *aspect ratio*, *variants* ×1-×4): una imagen por
prompt, así que un caso de N escenas son N prompts coherentes entre sí.

## Dónde colocar los ficheros

Dos formas, combinables:

| Destino | Comportamiento |
|---|---|
| `assets/images/<slug>/<scene-id>.png` (también jpg/jpeg/gif/webp/svg) | **Override determinista por escena**: se usa tal cual, sin búsqueda ni visión. Renombra cada descarga YA al id exacto de su escena (`scene-01.png`…): el generador da nombres aleatorios. |
| `assets/images/_pool/` con nombres descriptivos (p. ej. `ciudad_jardines-verticales.png`) | **Pool con matching**: el nombre del fichero se convierte en texto y se empareja a cada escena con pre-ranking (`qwen3-embedding`) + evaluación visual (`gemma4`). Útil con variants ×4: dejas que el modelo elija la mejor. |

El modo se elige en `config.yml > media.mode` (override puntual con la env
`MEDIA_MODE`):

- **`local`** — cero red: solo overrides + pool.
- **`auto`** — los overrides también se respetan, y el pool compite con
  Wikimedia/Pexels como un provider más (`local` en `media.providers`).

## Regenerar

En ambos modos, si la imagen de una escena ya existe en
`assets/images/<slug>/`, la etapa la **respeta** y no busca nada. Para
regenerar: **bórrala**, o `yarn vision <slug> --force` (ignora todas las
colocadas y vuelve a buscar/emparejar).

## Flujo típico

```bash
# 1. Genera una imagen por escena (prompt = imagePrompt + artDirection, 9:16)
#    y colócala como assets/images/<slug>/<scene-id>.png

# 2. Visión = N overrides; con todas colocadas no hay llamadas al cluster.
#    El log debe decir "Override: scene-XX... ya colocada" para cada escena.
yarn vision <slug>

# 3. Resto del pipeline
yarn voice <slug>
yarn subtitles <slug>
yarn compose <slug>     # → renders/<slug>/ (abre preview.html)
```

El caso vivo del repo ([`caso-nan-community`](./caso-nan-community.md)) usa
exactamente este flujo.
