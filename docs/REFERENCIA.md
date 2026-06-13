# nan-video-pipeline — Referencia técnica

> Referencia técnica completa del pipeline (semilla del futuro site de
> documentación). Para la vista rápida, ver el [README](../README.md).

## Qué es

Un pipeline de video generativo end-to-end que convierte un tema en un video narrado de formato vertical (9:16). Funciona con **7 etapas encadenadas**, cada una usando un modelo diferente del cluster NaN (OpenAI-compatible). Todo el código es tipado con TypeScript y tiene 18 archivos de tests vitest.

**Flujo de datos:**
```
tema → (qwen3.6) → storyboard.yml → (gemma4) → imágenes → (kokoro) → audio → (whisper) → SRT → HTML/GSAP → (HyperFrames) → MP4
```

**Output:** `assets/output/<slug>.mp4` — video 1080x1920, audio AAC (medido con los casos de prueba: ~56 MB para ~55 s).

---

## Arquitectura general

```
nan-video-pipeline/
├── config.yml                  # Modelos, voz, providers (ajustable sin tocar TS)
├── .env                        # NAN_BASE_URL, NAN_API_KEY (secreto)
├── content/                    # Storyboards como YAML (datos, no código)
│   └── caso-nan-community.yml  # El caso vivo (ver docs/caso-nan-community.md)
├── src/
│   ├── config/index.ts         # Carga config.yml + .env + rutas + API
│   ├── content/load.ts         # Cargador: parsea content/<slug>.yml y valida
│   ├── lib/
│   │   ├── types.ts            # Tipos del dominio (Storyboard, Scene, ArtDirection)
│   │   ├── nan-client.ts       # Cliente OpenAI compartido para el cluster
│   │   ├── nan-call.ts         # Throttle GLOBAL: máx 3 concurrentes, 60 rpm + retry
│   │   ├── ffprobe.ts          # Duración real del audio
│   │   ├── manifest.ts         # Tipos + builder puro del manifest de render
│   │   └── media/              # Proveedores de imágenes
│   │       ├── provider.ts     # Interfaces: MediaProvider, Candidate
│   │       ├── wikimedia.ts    # Wikimedia Commons (default, sin API key)
│   │       ├── pexels.ts       # Pexels (opt-in, requiere PEXELS_API_KEY)
│   │       └── local.ts        # Pool local: assets/images/_pool/
│   ├── pipeline/
│   │   ├── 00-orchestrator.ts  # Orquestador (encadena 7 etapas)
│   │   ├── 01-script.ts        # Guion: qwen3.6 → content/<slug>.yml
│   │   ├── storyboard-validation.ts  # Pure: extractJson + validateStoryboard
│   │   ├── 02-vision.ts        # Selección visual: gemma4 sobre candidatas reales
│   │   ├── image-search.ts     # Pure: queries, pre-rank, modo/overrides, ext/mime
│   │   ├── 03-voice.ts         # Voz: kokoro → assets/audio/<slug>.mp3
│   │   ├── 04-compose.ts       # Compose: manifest + HTML + assets → renders/<slug>/
│   │   ├── render-workspace.ts # Pure: copy plan, reescalado al audio real
│   │   ├── 05-subtitles.ts     # Subtítulos: whisper → assets/output/<slug>.srt
│   │   ├── subtitle-alignment.ts # Pure: alineación LCS + chunking CapCut
│   │   └── render-runner.ts    # HyperFrames render + ffmpeg mux
│   ├── render/
│   │   ├── template.ts         # index.html + styles.css deterministas (9:16)
│   │   ├── motion.ts           # Motion: keywords → presets GSAP
│   │   ├── srt.ts              # Parser SRT
│   │   └── preview.ts          # preview.html reproducible con doble click
├── scripts/                    # En la RAÍZ del repo (no en src/)
│   ├── doctor.ts               # Preflight: env, vitest, ffmpeg, hyperframes, NaN API
│   └── models-check.ts         # Smoke test de cada modelo del cluster
├── assets/
│   ├── images/<slug>/          # Imágenes elegidas por la etapa de visión
│   ├── images/_pool/           # Pool local de imágenes (provider `local`)
│   ├── audio/<slug>.mp3        # Narración generada por kokoro
│   └── output/<slug>.mp4       # Video final (y <slug>.srt)
├── renders/<slug>/             # Workspace de render (manifest + HTML + assets)
├── tests/                      # 18 archivos de tests vitest
├── docs/
│   ├── REFERENCIA.md           # Este documento
│   ├── TAREAS.md               # Reparto de trabajo con dueños y criterios
│   ├── TROUBLESHOOTING.md      # Problemas reales y soluciones
│   ├── caso-nan-community.md   # Ficha del caso vivo
│   └── imagenes-ia.md          # Guía: imágenes con IA externa (modo local)
└── package.json                # yarn, tsx, typescript, vitest
```

---

## Tipos del dominio

Todo el pipeline consume estas tres interfaces. Son la "fuente de verdad":

### `Storyboard`

```typescript
interface Storyboard {
  channel: string;           // nombre del canal (p.ej. "Historias Reales")
  caseNumber: number;        // número del caso
  title: string;             // título del video
  totalDuration: number;     // duración objetivo en segundos
  artDirection: ArtDirection;
  scenes: Scene[];           // típicamente 10 escenas
}
```

### `Scene`

```typescript
interface Scene {
  id: string;              // "scene-01"
  block: string;           // "GANCHO" | "DESARROLLO" | "CIERRE"
  start: number;           // segundo de inicio
  end: number;             // segundo de fin
  voiceover: string;       // narración en español
  onScreenText: string[];  // textos que aparecen en pantalla
  imagePrompt: string;     // descripción visual en inglés
  motion: string;          // nota de animación GSAP ("zoom-in lento", etc.)
}
```

### `ArtDirection`

La "biblia visual" del video. Define el estilo visual que se inyecta en cada etapa:

```typescript
interface ArtDirection {
  medium: string;           // "dark cinematic graphic novel illustration"
  lineWork: string;         // "bold ink outlines, heavy shadows"
  palette: string;          // "desaturated greys, deep blacks"
  lighting: string;         // "low-key chiaroscuro"
  texture: string;          // "film grain, halftone"
  mood: string;             // "ominous, somber"
  composition: string;      // "wide cinematic framing"
  humanTreatment: string;   // "silhouettes, no gore"
  constraints: string;      // "no text, no watermark"
}
```

---

## Configuración

### `config.yml` — Ajustable sin tocar código

```yaml
models:
  text: qwen3.6              # guion / chat
  textHeavy: deepseek-v4-flash  # razonamiento largo
  visionEval: gemma4         # evaluación visual (base64)
  visionEvalFallback: qwen3.6 # fallback si visionEval falla
  tts: kokoro                # texto a voz
  stt: whisper               # voz a texto
  embedding: qwen3-embedding # embeddings (RAG + pre-ranking)
  reranker: rerank           # anunciado, NO desplegado

voice:
  default: em_alex           # voz por defecto de kokoro

media:
  mode: auto                 # auto (providers) | local (colocadas a mano)
  providers:
    - wikimedia
    - local
  candidates: 8              # candidatas por proveedor y escena
  shortlist: 5               # candidatas que pasan a visión tras pre-ranking
```

### `.env` — Secretos

```bash
NAN_BASE_URL=https://...     # base URL del cluster (API OpenAI-compatible)
NAN_API_KEY=...              # token del miembro (secreto)
NAN_VOICE_ID=ef_dora         # opcional: override de voz por defecto
MEDIA_PROVIDERS=wikimedia,local  # opcional: override de providers
MEDIA_MODE=local             # opcional: override del modo de imágenes
PEXELS_API_KEY=...           # opcional, para Pexels
```

### `src/config/index.ts` — Carga centralizada

- Lee `config.yml` con `yaml.parse()`
- Carga `.env` con `dotenv/config` (import al inicio del módulo)
- Calcula `ROOT` como dos niveles arriba de `src/config/`
- Exporta `config.paths.*` como rutas absolutas
- Exporta `config.models.*` directamente desde el YAML
- `config.media.mode()` permite override con env `MEDIA_MODE`

---

## Etapa 1: Guion (`01-script.ts`)

**CLI:** `yarn script "<tema>" [slug] [escenas]`

**Qué hace:** Genera un storyboard estructurado a partir de un tema libre.

**Proceso:**

1. Construye un system prompt que pide JSON con la forma exacta de `Storyboard`
2. Llama a `nan.chat.completions.create()` con `config.models.text` (qwen3.6)
3. Intenta desactivar `reasoning_config` (más rápido y barato); si falla, retry sin él
4. Extrae el JSON de la respuesta (`extractJson` — tolera `</think>`, vallas markdown, prosa)
5. Valida contra la estructura (`validateStoryboard`):
   - Scene count exacto
   - Campos requeridos en cada escena
   - Tiempos contiguos (cada escena empieza donde termina la anterior)
   - `start: 0` en la primera, `end` igual a `totalDuration` en la última
6. Si la validación falla, reintenta hasta 3 veces pasándole los errores como feedback
7. Escribe `content/<slug>.yml` con `yaml.stringify()`

**Detalles técnicos:**
- El slug se valida con regex `/^[a-z0-9][a-z0-9-]*$/`
- El motion usa keywords que coinciden con los presets de `motion.ts`
- Los `imagePrompt` se piden en inglés (para compatibilidad con providers de imágenes)
- Se usa `createNanCall()` para respetar el límite de 3 concurrentes del cluster

---

## Etapa 2: Visión (`02-vision.ts`)

**CLI:** `yarn vision <slug> [--force]`

**Qué hace:** Selecciona una imagen real por escena, evaluada por un modelo de visión.

**No genera imágenes.** Busca material de archivo existente y un modelo decide cuál encaja.

**Proceso por escena:**

### 0. Override
Si ya existe `assets/images/<slug>/scene-XX.<ext>` (jpg/jpeg/png/gif/webp/svg), se usa tal cual. Regenerar = borrarla o usar `--force`.

### 1. Queries de búsqueda
Una sola llamada a `qwen3.6` que genera una query de búsqueda por escena (1 llamada para TODAS). Si falla tras 3 intentos, degrada a heurística: quita stopwords del `imagePrompt` y usa hasta 3 palabras restantes. Si una query no devuelve candidatas, se reintenta con una versión genérica (`generifyQuery`: sin nombres propios).

### 2. Buscar candidatas
Cada provider (Wikimedia, Pexels, local) busca por la query. Devuelve `{url, title}`.

**Proveedores:**

| Provider | API Key | Descripción |
|----------|---------|-------------|
| Wikimedia | No | `generator=search` en Wikipedia API, thumbnails 512px. Exige `User-Agent`. |
| Pexels | `PEXELS_API_KEY` | Opt-in. Solo si la env existe. Fotos de stock. |
| Local | No | Lee `assets/images/_pool/`. Nombres descriptivos → texto para matching. |

### 3. Pre-ranking por título
`qwen3-embedding` genera embeddings de: `[query, título_candidata_1, título_candidata_2, ...]`. Similitud coseno → solo el top 5 (`media.shortlist`) pasa a la siguiente etapa. Las demás se descartan sin descargar. Este paso es crítico: evita descargar y evaluar imágenes irrelevantes.

### 4. Descargar
Los bytes de las candidatas que pasaron el pre-ranking se bajan con `fetch({ headers: { 'User-Agent': ... } })`. Wikimedia bloquea sin User-Agent.

### 5. Evaluación con visión
`gemma4` (fallback `qwen3.6`) evalúa cada candidata. La imagen se pasa en **base64** dentro del formato array OpenAI:

```json
{
  "content": [
    { "type": "text", "text": "Escena: {imagePrompt}. Del 1 al 10, ¿qué tan bien esta imagen ilustra la escena?" },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,{base64}" } }
  ]
}
```

`mimo-v2.5` está CIEGO (no descarga URLs, alucina desde el nombre del fichero), por eso se usa gemma4 con bytes embebidos.

### 6. Elegir y guardar
La candidata con mejor score se guarda en `assets/images/<slug>/scene-XX.<ext>` (extensión derivada de la URL, `jpg` por defecto). Se evita repetir la misma imagen entre escenas. Si una escena queda sin candidata válida, se escribe un **placeholder SVG** oscuro con el id de la escena (la etapa no rompe el pipeline por una búsqueda vacía); solo sale con exit 1 si ni siquiera pudo guardarse una imagen para alguna escena.

**Modo `local`:** Cero red. Solo lee `assets/images/_pool/`. El pool entero entra al pre-ranking por nombre de fichero (el nombre se convierte en texto: `numancia_hilltop-fog.jpg` → `"numancia hilltop fog"`).

---

## Etapa 3: Voz (`03-voice.ts`)

**CLI:** `yarn voice <slug>`

**Qué hace:** Genera narración con TTS y la guarda como MP3 estéreo.

**Proceso:**

1. Concatena todos los `voiceover` del storyboard
2. Muestra el texto antes de generar (revisar tildes/pronunciación)
3. POST a `${baseUrl}/audio/speech` con:
   ```json
   {
     "model": "kokoro",
     "voice": "em_alex",
     "input": "texto completo"
   }
   ```
4. Guarda raw → `assets/audio/<slug>-raw.mp3`
5. Re-encodea a estéreo con ffmpeg: `libmp3lame -b:a 192k -ac 2 -ar 44100`
6. Mide duración real con ffprobe

**Nota:** HyperFrames necesita audio estéreo. ElevenLabs y kokoro devuelven mono, por eso el re-encode.

---

## Etapa 4: Subtítulos (`05-subtitles.ts`)

**CLI:** `yarn subtitles <slug>`

**Qué hace:** Transcribe el audio con Whisper, alinea con el voiceover canónico, genera SRT estilo CapCut.

**Proceso:**

### 1. Whisper STT
POST a `${baseUrl}/audio/transcriptions` con `response_format: verbose_json`. Usa el SDK OpenAI (`nan.audio.transcriptions.create`) o fallback a fetch directo con FormData.

### 2. Parsear respuesta
`res.segments[]` → `TranscriptionSegment[]` con `{text, start, end}`.

### 3. Alineación LCS
`alignSegments(voiceoverSegments, transcriptionSegments)`:

- Construye lista de palabras canónicas (del voiceover) y palabras raw (de Whisper)
- LCS (Longest Common Subsequence) a nivel de palabras normalizadas (lowercase, sin puntuación)
- Mapa de timing: índice canónico → `{start, end}` de Whisper
- Pasa en orden canónico identificando runs de palabras CON y SIN match:
  - Runs con match → toman timing de Whisper directamente
  - Runs sin match → se colocan en la ventana temporal entre el vecino anterior y el siguiente (nunca al final de la escena, que causaba solapes)
  - Si no hay hueco temporal (MIN_WINDOW = 0.2s), se fusionan con el segmento vecino

### 4. Chunking estilo CapCut
`chunkSegments(aligned, {maxChars: 42})`:

- Trocea segmentos en bloques de máximo 42 caracteres
- Tiempo distribuido proporcionalmente a la longitud de cada bloque
- Reindexa 1..n (formato SRT)

### 5. Escribir SRT
`toSRT(chunked)` → formato estándar:
```
1
00:00:01,500 --> 00:00:03,000
Primera parte
```

---

## Etapa 5: Composición (`04-compose.ts`)

**CLI:** `yarn compose <slug>`

**Qué hace:** Valida assets, construye el manifest, genera HTML animado con GSAP, copia assets al workspace.

**Proceso:**

1. Valida que exista `assets/audio/<slug>.mp3` (hard error)
2. Mide duración real del audio con ffprobe
3. Valida que exista subtítulo (soft warning, no bloquea)
4. Descubre imágenes por escena: `discoverImages(imagesDir, scenes)` → Map<sceneId, absolutePath>
5. Construye manifest con `buildManifest()` (puro)
6. Valita orden de escenas: `validateManifest()` — checks start < end, no overlaps
7. **Reescala tiempos:** `rescaleScenesToAudio(manifest)` — el guion inventa los tiempos; el audio real manda. Factor = `audioDuration / totalSceneTime`. Escena 10 termina exactamente con el audio.
8. Escribe `renders/<slug>/manifest.json` con rutas relativas (portable)
9. Genera `index.html` + `styles.css` desde el manifest
10. Copia assets al workspace: `images/`, `captions/`, `audio/`
11. Genera `preview.html` (doble click para ver, audio + captions inline)

---

## Etapa 6: Render (`render-runner.ts`)

**Qué hace:** Ejecuta HyperFrames para extraer frames del HTML animado → video silencioso.

**Proceso:**

1. Valida que exista `renders/<slug>/index.html`
2. Ejecuta: `npx hyperframes render <dir> --output video-silent.mp4 --workers 1 --low-memory-mode`
3. Produce `renders/<slug>/video-silent.mp4` (1080x1920, sin audio)

**Por qué `--workers 1 --low-memory-mode`:** Multi-worker falla con GSAP timeline detection. HyperFrames necesita que el timeline se ejecute para capturar frames.

**Requisitos:** HyperFrames 0.6.x instalado (`npm install -g hyperframes`).

---

## Etapa 7: Mux (`render-runner.ts`)

**Qué hace:** Combina video silencioso + audio → video final.

**Proceso:**

1. Lee `renders/<slug>/manifest.json` para encontrar la ruta del audio
2. Valida que exista `video-silent.mp4`
3. FFmpeg:
   ```bash
   ffmpeg -i audio.mp3 -i video-silent.mp4 \
     -c:v copy -c:a aac \
     -map 1:v:0 -map 0:a:0 \
     -shortest -y \
     assets/output/<slug>.mp4
   ```
   - `-c:v copy`: stream-copy (no re-encode video)
   - `-c:a aac`: encode audio a AAC para contenedor MP4
   - `-map 1:v:0`: video de video-silent.mp4
   - `-map 0:a:0`: audio del MP3
   - `-shortest`: corta al final del más corto
4. Limpia `video-silent.mp4` (intermedio no necesario)
5. Output: `assets/output/<slug>.mp4`

---

## Orquestador (`00-orchestrator.ts`)

**CLI:** `yarn produce "<tema>" [slug] [--skip-<stage>]...`

**Qué hace:** Encadena las 7 etapas en orden.

**Argumentos:**
- `$1`: tema del video (obligatorio)
- `$2`: slug (opcional; si empieza por `--` se interpreta como flag, no como slug)
- flags `--skip-<stage>` para runs parciales (pueden ir con o sin slug)

Sin slug explícito se usa el sentinel interno `caso-generado`, que dispara el
fallback: el YAML **más reciente** de `content/` por mtime.

**Proceso:**

1. **Pre-flight:** Verifica HyperFrames y ffmpeg. Si falta HyperFrames, salta render/mux.
2. **Slug dinámico:** Si no se pasa slug, busca el YAML más reciente en `content/` por mtime.
3. **Ejecuta etapas:** Cada etapa es un script CLI independiente. Se invoca con `execFile('yarn', ['tsx', ...args])` sin shell (seguridad: sin inyección de comandos).
4. **Flags de skip:** `--skip-script`, `--skip-vision`, `--skip-voice`, `--skip-subtitles`, `--skip-compose`, `--skip-render`, `--skip-mux`

### Etapa 1: Guion — comportamiento condicional

**El orquestador verifica si `content/<slug>.yml` existe antes de generar el guion:**

- **Si el YAML existe:** lo toma tal cual (no llama a qwen3.6). Imprime: `📄 YAML existente encontrado`.
- **Si el YAML no existe:** genera con `qwen3.6` como antes. Imprime: `📝 no existe YAML, generando con qwen3.6...`

Esto permite dos flujos:

```bash
# Flujo 1: YAML escrito a mano (basado en documentación, datos específicos)
# El YAML existe → se toma tal cual, no se alucina con un tema ajeno
yarn produce "La comunidad que te da GPUs" caso-nan-community

# Flujo 2: YAML no existe → genera con qwen3.6
yarn produce "Un volcán que sepultó Pompeya" caso-vesubio

# Forzar regeneración del guion (sobreescribe el YAML existente)
yarn script "tema" slug
```

**Ejemplos:**
```bash
yarn produce "La erupción del Vesubio" vesubio
yarn produce "tema" slug --skip-subtitles --skip-voice
yarn produce "tema"   # slug automático del YAML más reciente
```

---

## Render Layer

### `motion.ts` — Keyword matcher

Mapea strings libres de movimiento a presets GSAP:

| Keyword | Preset | GSAP animation |
|---------|--------|----------------|
| `zoom-out` | `zoom-out` | scale 1 → 1.08, xPercent 0 → 2 |
| `zoom` / `escala` | `zoom-in` | scale 1.08 → 1, xPercent -2 → 0 |
| `pan` | `pan-left` | xPercent 0 → 0, x 5% → -5% |
| `pan derecha` / `pan right` | `pan-right` | x -5% → 5% |
| `shake` | `shake` | x +=8, steps(2), repeat |
| `deriva` / `drift` | `pan-slow` | xPercent 3 → -3, ease none |
| (default) | `static` | sin animación |

**Orden importa:** "zoom-out" se chequea antes que "zoom" para evitar match falso.

### `template.ts` — Generador HTML/CSS

**`generateHtml(manifest)`** — HTML determinista (mismo manifest → mismo output):

- GSAP 3.12.5 desde CDN
- Secciones de escena con `data-motion`, `data-scene`, `data-start`, `data-end`
- Contenedor con `data-composition-id="main"` y `data-duration=<segundos>` (requerido por HyperFrames)
- Script inline: timeline GSAP con `paused: false` (HyperFrames necesita que se ejecute)
- SRT parser browser-side + fetch de captions
- Sync de captions con `tl.eventCallback('onUpdate')`

**`generateCss(manifest)`** — CSS determinista:

- Container 9:16 con `aspect-ratio: 9/16`
- Escenas absolutas con `opacity: 0` (GSAP las activa)
- Overlay text: uppercase, amarillo para el primero, blanco para el segundo
- Captions: fondo semitransparente `rgba(0,0,0,0.75)`, `border-radius: 6px`, transición fade 50ms

### `preview.ts` — Preview para humanos

Genera un HTML autocontenido que se abre con doble click:
- Inlines el SRT (no usa fetch, funciona con `file://`)
- Agrega `<audio>` con la narración
- Botón de play que inicia el timeline GSAP
- Escapes XSS en captions inlined

---

## Infraestructura

### `nan-call.ts` — Semaphore + throttle + retry

**Problema:** El cluster NaN tiene un límite duro de 3 peticiones simultáneas.

**Solución:** Cola global a nivel de módulo (ESM singleton):

- **Semáforo:** máx 3 concurrentes (`active < MAX_CONCURRENT`)
- **Throttle:** 60 RPM (ventana de 60 segundos, FIFO)
- **Retry exponencial:** máx 3 retries, delay = `2^retries * 1000ms` (2s, 4s, 8s)
- **Slot release durante retry:** el slot se libera antes del backoff para no bloquear a otros
- **Re-queue al inicio:** los retries van al frente de la cola (`queue.unshift`)

**Uso:**
```typescript
const call = createNanCall(() => nan.chat.completions.create({ ... }));
const result = await call();
```

### `nan-client.ts` — Cliente OpenAI compartido

```typescript
export const nan = new OpenAI({
  baseURL: config.nan.baseUrl(),  // NAN_BASE_URL
  apiKey: config.nan.apiKey(),    // NAN_API_KEY
});
```

Se usa para:
- `nan.chat.completions.create()` — texto y visión
- `nan.audio.transcriptions.create()` — Whisper STT
- `nan.embeddings.create()` — pre-ranking por título

TTS (kokoro) se hace con `fetch` directo a `/audio/speech` (no soportado por el SDK).

---

## Modelo de datos: Manifest

El Manifest es el contrato entre la etapa de composición y el render:

```typescript
interface Manifest {
  slug: string;
  title: string;
  audio: { path: string; duration: number | null };
  subtitle: { path: string | null };
  artDirection: ArtDirection;
  scenes: ManifestScene[];  // Scene + image (absolute path)
  generatedAt: string;      // ISO timestamp
}
```

**Flujo del Manifest:**

1. `buildManifest(storyboard, slug, audioPath, audioDuration, subtitlePath, imageMap)` — construye con rutas absolutas
2. `rescaleScenesToAudio(manifest)` — reescala tiempos al audio real
3. `toWorkspaceManifest(manifest)` — convierte rutas absolutas a relativas (`audio/`, `captions/`, `images/`)
4. `buildCopyPlan(manifest)` — plan de copia: `{src: ruta_absoluta, dest: ruta_relativa}`

---

## Modelo de datos: Storyboard (YAML)

Los storyboards son **datos**, no código. Se generan con `yarn script` O se escriben a mano (como el caso vivo, `content/caso-nan-community.yml`):

```yaml
# Guion sobre la comunidad NaN — basado en la documentación oficial (PDFs)
channel: NaN Community
caseNumber: 1
title: La comunidad que te da GPUs para construir con IA
totalDuration: 60
artDirection:
  medium: Dark cinematic graphic novel illustration, editorial comic art
  lineWork: Bold ink outlines, heavy cross-hatching in shadows
  palette: Desaturated charcoal blacks, slate greys, deep blues, muted red accents
  lighting: Low-key chiaroscuro, dramatic single light source, volumetric haze
  texture: Heavy film grain, halftone dithering, cinematic vignette
  mood: Ominous, somber, sense of hidden power
  composition: Cinematic wide framing, strong depth, dramatic negative space
  humanTreatment: Human presence through silhouettes and distant figures, faces obscured
  constraints: No text, no watermark, no logos, no gore
scenes:
  - id: scene-01
    block: GANCHO
    start: 0
    end: 6
    voiceover: "Imaginá tener acceso a GPUs de inferencia sin pagar una suscripción..."
    onScreenText:
      - "La comunidad NaN"
      - "GPUs para construir"
    imagePrompt: A dark server room with rows of glowing GPU racks, volumetric light beams
    motion: zoom-in lento
  # ... más escenas
```

**Validación al cargar:**
- `validateStoryboard()` verifica estructura (sin reglas de conteo de escenas)
- El conteo de escenas es regla de GENERACIÓN, no de carga (los casos pueden variar)
- Las etapas toman el slug del primer argumento de la CLI; sin argumento, el
  default es `caso-nan-community` (el caso vivo del repo)

---

## Proveedores de Media

### Interfaz `MediaProvider`

```typescript
interface MediaProvider {
  name: string;
  search(query: string, limit?: number): Promise<Candidate[]>;
}

interface Candidate {
  url: string;
  title?: string;
  license?: string;
  source: string;
}
```

### `WikimediaProvider`

- API: `https://en.wikipedia.org/w/api.php?action=query&generator=search`
- Parámetros: `gsrsearch=<query>`, `gsrlimit=<limit>`, `pithumbsize=512`
- User-Agent obligatorio: `'nan-video-pipeline/0.1 (hackathon; +https://github.com/nan-cluster)'`
- Devuelve thumbnails 512px con título y licencia
- Sin API key necesaria

### `PexelsProvider`

- API: `https://api.pexels.com/v1/search?query=<query>&per_page=<limit>`
- Header: `Authorization: <PEXELS_API_KEY>`
- Opt-in: solo se activa si `PEXELS_API_KEY` existe en env
- Devuelve fotos medium-quality con alt text como título

### `LocalProvider`

- Lee `assets/images/_pool/` (configurable)
- `filenameToText()`: convierte `numancia_hilltop-fog.jpg` → `"numancia hilltop fog"`
- Devuelve `file://` URLs con títulos normalizados
- En modo `local`, el pool ENTERO entra al pre-ranking (no solo los primeros N)

### `selectProvider(mode)`

```typescript
// Auto (default): lee MEDIA_PROVIDERS env (csv), default "wikimedia,local"
selectProvider('auto')  // [WikimediaProvider, LocalProvider]

// Local: cero red
selectProvider('local') // [LocalProvider]
```

---

## Subtitle Alignment (LCS)

El algoritmo de alineación es el corazón de la etapa de subtítulos:

### `alignSegments(voiceoverSegments, transcriptionSegments)`

**Input:**
- Voiceover segments: texto canónico + rango de tiempo por escena
- Transcription segments: texto raw de Whisper + timestamps reales

**Paso 1: Normalización**
- `normalize(word)`: lowercase + strip non-alphanumeric
- `words(text)`: split por whitespace

**Paso 2: LCS (Longest Common Subsequence)**
- Tabla DP: `dp[i][j]` = longitud del LCS entre `canonical[0..i]` y `raw[0..j]`
- Backtracking para encontrar pares de índices `[canonicalIndex, rawIndex]`

**Paso 3: Mapa de timing**
- Cada match `canonical[i] ↔ raw[j]` → `timingMap[i] = {start: raw[j].start, end: raw[j].end}`

**Paso 4: Runs con ventana temporal**
- Pasa en orden canónico identificando runs de palabras CON match y SIN match
- Runs con match → toman timing de Whisper directamente
- Runs sin match → se colocan en la ventana entre el vecino anterior y el siguiente
- `MIN_WINDOW = 0.2s`: si no hay hueco, se fusionan con el segmento vecino
- Evita solapes y segmentos de duración cero

**Paso 5: Chunking proporcional**
- `chunkSegments()` divide cada segmento alineado en bloques de máx 42 chars
- Tiempo distribuido proporcionalmente: `dt = duration * chunkLength / totalChars`

---

## Tests (18 archivos, 205 tests)

Recuento medido el 2026-06-12 (`yarn test`, con los fixes de
`fix/broken-main-and-tech-debt` aplicados). El recuento por archivo cambia con
cada PR; el mapa de cobertura es lo estable:

| Archivo | Cubre |
|---------|-------|
| `tests/pipeline/storyboard-validation.test.ts` | `extractJson`, `validateStoryboard`, YAML round-trip |
| `tests/pipeline/image-search.test.ts` | `deriveSearchTerms`, `buildSearchQueriesPrompt`, `parseSearchQueries`, `shortlistByCosine`, `resolveMediaMode`, `findSceneOverride`, `extFromUrl`, `mimeFromExt`, `bestByScore`, `generifyQuery` |
| `tests/pipeline/subtitle-alignment.test.ts` | `alignSegments`, `toSRT`, `parseSRT` |
| `tests/pipeline/subtitle-chunk.test.ts` | `chunkSegments` — word preservation, time contiguity, reindexing |
| `tests/pipeline/subtitle-align-position.test.ts` | Regression: unmatched word placement |
| `tests/pipeline/render-workspace.test.ts` | `buildCopyPlan`, `rescaleScenesToAudio`, `toWorkspaceManifest` |
| `tests/pipeline/render-runner.test.ts` | `checkRenderDeps`, `runRender`, `muxAudio` (mocked) |
| `tests/render/motion.test.ts` | `resolveMotion` — keyword matching, case insensitive, fallback |
| `tests/render/template.test.ts` | `generateHtml`, `generateCss` — determinism, escaping, data attributes |
| `tests/render/preview.test.ts` | `generatePreviewHtml` — audio overlay, SRT inlining, XSS escape |
| `tests/render/srt.test.ts` | `parseSrt`, `formatTimestamp` |
| `tests/lib/nan-call.test.ts` | Semaphore max 3, retry backoff, slot release |
| `tests/lib/ffprobe.test.ts` | `getAudioDuration` — null fallback |
| `tests/lib/manifest.test.ts` | `buildManifest`, `validateManifest`, `discoverImages` |
| `tests/lib/media/wikimedia.test.ts` | search, limit, empty query |
| `tests/lib/media/index.test.ts` | `selectProvider` — defaults, env override, pexels opt-in, local mode |
| `tests/lib/media/local.test.ts` | `filenameToText`, `LocalProvider` — temp dir cleanup |
| `tests/lib/media/provider.test.ts` | Type compliance |

**Ejecutar:** `yarn test` (vitest)

---

## Scripts de desarrollo

### `yarn doctor` — Preflight

Verifica:
1. `NAN_BASE_URL` y `NAN_API_KEY` en env (carga `.env` vía `dotenv/config`)
2. `vitest` en devDependencies (lee `package.json` por ruta relativa al script,
   funciona desde cualquier cwd)
3. `ffmpeg` y `ffprobe` en PATH
4. `hyperframes` disponible
5. Conectividad a NaN API (fetch `/models`)

### `yarn models:check` — Smoke test

Sonda cada modelo del cluster:
- `qwen3.6` (text): completion simple
- `gemma4` (vision): envía 1x1 PNG base64
- `kokoro` (TTS): genera `_voice-sample.mp3`
- `whisper` (STT): transcribe el sample
- `qwen3-embedding`: verifica dimensión del embedding
- `reranker`: sonda `/rerank` (reporta "not deployed" si 404)

---

## Problemas conocidos (TROUBLESHOOTING.md)

### `mimo-v2.5` está CIEGO
No descarga URLs de imagen. Alucina desde el nombre del fichero. Fix: usar `gemma4` con imagen en base64.

### `reranker` (Qwen3-Reranker-8B) NO desplegado
404 en cualquier ruta de rerank. `yarn models:check` lo sondea sin contar como fallo.

### Wikimedia devuelve HTML sin User-Agent
Exige `User-Agent` identificable. Se setea en `fetch()`.

### Pexels requiere API key
Opt-in. Sin `PEXELS_API_KEY`, el provider se salta silenciosamente.

### Cluster: máximo 3 peticiones simultáneas
`nan-call.ts` implementa semáforo global + throttle 60 RPM. No lanzar múltiples procesos del pipeline en paralelo.

### Windows: `yarn voice` crasha con exit 3221226505
Crash nativo transitorio de ffmpeg. Reintento funciona.

### No hay CI en GitHub Actions
Cuenta del owner con Actions bloqueado por billing. Verificación manual: `yarn typecheck` + `yarn test`.

---

## Dependencias

| Package | Versión | Uso |
|---------|---------|-----|
| `openai` | ^4.67.0 | Cliente para chat, embeddings, transcripciones |
| `yaml` | ^2.9.0 | Parse/stringify de config.yml y storyboards |
| `dotenv` | ^16.4.5 | Carga de .env |
| `tsx` | ^4.19.0 | Run TypeScript sin compile step |
| `typescript` | ^5.6.0 | Type checking |
| `vitest` | ^4.1.8 | Test runner |

**Herramientas externas (no npm):**
- `ffmpeg` / `ffprobe` — re-encode de audio, mux de video
- `hyperframes` — render de HTML → video (headless Chromium)

---

## Convenciones

- **Casos = datos** (`content/<slug>.yml`), nunca código. Se generan con `yarn script` O se escriben a mano.
- **Guion condicional:** el orquestador verifica si el YAML existe antes de generar. Si existe, lo toma tal cual; si no, llama a qwen3.6.
- **ESM:** imports con extensión `.js`.
- **Errores:** formato `ERROR / WHY / FIX`.
- **Lógica pura separada:** `subtitle-alignment.ts`, `image-search.ts`, `render-workspace.ts` son testeables en aislamiento.
- **Determinismo:** `generateHtml` y `generateCss` producen el mismo output para el mismo input.
- **Yarn:** gestor de paquetes. Lockfile: `yarn.lock`.
