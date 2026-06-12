# Caso de uso — `caso-local` (imágenes 100% generadas fuera con IA)

Caso **independiente** de los tres goldens: un cuarto caso cuyo material
visual no sale de ningún archivo, sino de un **generador de imágenes externo**
(probado con **FLUX.2 Klein 9B** del generador de la comunidad; inputs:
*prompt*, *aspect ratio*, *variants* x1-x4). Demuestra el modo de imágenes
locales de punta a punta: el generador produce **una imagen por prompt**, así
que el caso son 10 prompts coherentes entre sí — la coherencia la da la
`artDirection` del storyboard, que va pegada como sufijo en los 10.

| | |
|---|---|
| **Slug** | `caso-local` |
| **Tipo** | Futurista (sin archivo posible) · storyboard generado por qwen3.6 |
| **Escenas** | **10** — guion en `content/caso-local.yml` (versionado) |
| **Tema** | La ciudad del año 2100: cómo viviremos en el futuro |

Referencia del modo: AGENTS.md > Imágenes locales.

## Los 10 prompts (uno por escena)

**Sufijo de estilo común** (la `artDirection` de `content/caso-local.yml` —
pégalo al final de TODOS):

> Cinematic 3D animation style, clean vector edges, cyan, white and soft
> green palette, natural daylight with bioluminescent accents, smooth glass,
> living moss and polished metal textures, optimistic serene utopian mood,
> wide composition with vertical emphasis, distant human silhouettes

**Aspect ratio: 9:16** (video vertical) · **variants: x1** (con x2-x4 eliges
tú la mejor a ojo).

| Fichero destino | Prompt base (añadir el sufijo) |
|---|---|
| `scene-01` | Wide shot of a futuristic utopian city with vertical gardens covering skyscrapers, bright blue sky, clean white architecture, cinematic lighting |
| `scene-02` | Close up of a building facade covered in lush green plants and algae panels, sunlight filtering through leaves, hyperrealistic, bright colors |
| `scene-03` | Sleek transparent pods moving on magnetic tracks between towers, no roads, no cars, futuristic design, soft focus background |
| `scene-04` | Pedestrian street filled with trees, flowers and water features, people walking peacefully, no vehicles, bright natural lighting, wide angle |
| `scene-05` | Solar panels integrated into glass windows, wind turbines shaped like flowers, clean energy grid visualization, bright and airy atmosphere |
| `scene-06` | Interior of a high-rise building with hydroponic farms on every floor, people harvesting fresh vegetables, warm lighting, healthy atmosphere |
| `scene-07` | Abstract visualization of data streams connecting people in a community center, holographic interfaces, diverse group of people interacting, futuristic but human-centric |
| `scene-08` | Clean recycling facility with robotic arms sorting materials, sparkling clean environment, no trash visible, high-tech aesthetic |
| `scene-09` | Sunset over the futuristic city, silhouettes of people enjoying a rooftop garden, golden hour lighting, peaceful and hopeful mood |
| `scene-10` | Minimalist end screen with the text "FuturoVisión" on a clean white background with subtle green accents, professional design |

## Flujo

La voz y los subtítulos del caso ya están generados (`assets/audio/caso-local.mp3`,
`assets/output/caso-local.srt`); solo faltan las imágenes:

```powershell
# 1. Genera las 10 imágenes y, al descargar cada una, renómbrala YA al id
#    exacto de su escena (el generador da nombres aleatorios):
#    assets/images/caso-local/scene-01.png … scene-10.png  (png o jpg)
New-Item -ItemType Directory -Force assets/images/caso-local

# 2. Visión = 10 overrides, 0 llamadas al cluster (las colocadas se respetan)
yarn vision caso-local

# 3. Workspace y preview
yarn compose caso-local
start renders/caso-local/preview.html
```

Si regeneras la voz o el guion, repite `yarn voice` / `yarn subtitles` antes
de `compose`. (El override puntual sobre un golden y el pool con variantes x4
son el mismo mecanismo — ver AGENTS.md > Imágenes locales.)

## Qué comprobar

- El log de `yarn vision caso-local` dice `Override: scene-XX… ya colocada`
  para las 10 y no hace ninguna búsqueda.
- El preview muestra tus 10 imágenes, coherentes entre sí, recortadas en 9:16.
- Si falta alguna escena, la etapa **falla en alto** con la lista exacta (no
  hay escenas en negro silenciosas).
