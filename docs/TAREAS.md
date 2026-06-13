# Tareas

## Estado actual (2026-06-12)

El equipo pasó a **cierre en solitario (Manu)**. Las tareas A-H están **hechas
y verificadas** (las notas por tarea quedan abajo como historial); la Tarea E
(biblioteca) sigue **abierta sin dueño** y la Tarea I es **futura**.

Pendiente real:

- **Demo:** el video de `caso-nan-community` (guion en 2 actos + imágenes +
  voz) — ver [`caso-nan-community.md`](./caso-nan-community.md).
- **Site de documentación**: scaffold en `site/` (Starlight); el destino de
  deploy se decide tras el video demo.
- **Release.**

Los arreglos de `main` (flags `--skip-<etapa>`, slug por defecto, doctor,
captions, throttle por endpoint) viajan en la **misma rama/PR** que esta doc.

---

Cada tarea es autónoma: tiene un **objetivo**, un **archivo** donde trabajar,
**pasos** y un **criterio de hecho** (cómo saber que quedó).

Antes de tocar nada: `yarn install`, copiar `.env.example` a `.env` y completarlo,
y comprobar que `yarn load caso-nan-community` corre sin error.

Regla de oro: **no toques el archivo de otra tarea.** Si necesitas un dato de
otra pieza, usa datos de ejemplo (el caso vivo, `caso-nan-community`) mientras
tanto.

---

## Tarea A — Voz con kokoro [✅ verificada e2e 2026-06-11]

**Verificado:** el código del "stub" funcionaba tal cual — nadie lo había
ejecutado. `yarn voice caso-ejemplo` llama a `/audio/speech` de kokoro, genera
`assets/audio/caso-ejemplo.mp3` en estéreo (ffmpeg) e imprime la duración real
(58.5s). Añadido `mkdir` defensivo para clones limpios.

**Pendiente (decisión de equipo):** elegir la voz por defecto — probar
`em_alex` (actual) vs `ef_dora` con `NAN_VOICE_ID` en `.env` y fijar la
ganadora en `config.yml`.

---

## Tarea B — Subtítulos con whisper [✅ done]

**Implementado:**
- `src/pipeline/05-subtitles.ts` — orchestration: audio read → Whisper STT → alignment → SRT write
- `src/pipeline/subtitle-alignment.ts` — pure alignment (LCS word matching) + SRT serialization
- `tests/pipeline/subtitle-alignment.test.ts` — 7 tests covering alignment, fallback, SRT format
- `"subtitles"` script in `package.json`
- Fallback mode when `verbose_json` not supported (plain text → distribute across scene boundaries)
- Error handling: missing audio (exit 1), empty transcription (exit 1), ERROR/WHY/FIX format

**Verified:** `yarn test` passes all 37 tests (30 existing + 7 new), `yarn typecheck` clean.

---

## Tarea C — Selección visual con modelo de visión NaN [Manu ✅ verificado e2e]

**Archivos:** `src/pipeline/02-vision.ts` + `src/lib/media/` (5 ficheros)
**Objetivo:** que por cada escena se elija una imagen de archivo relevante,
**evaluada por un modelo de visión**.

**Implementado:**
- Capa de proveedores de media: Wikimedia (default, sin key), Local (fallback offline),
  Pexels (opt-in, requiere `PEXELS_API_KEY` — validada: key OK, JPEG descargable)
- Selector por `MEDIA_PROVIDERS` con default desde `config.yml` (`wikimedia,local`)
- Search terms: heurística simple (quita stopwords del imagePrompt)
- Descarga de candidatas (con `User-Agent`) y guardado de la elegida en
  `assets/images/<scene.id>.<ext>`
- **Evaluación por visión:** `gemma4` (fallback `qwen3.6`) con la imagen en base64
  (formato array OpenAI), porque `mimo-v2.5` está ciego en el cluster. El porqué
  y el contraste con/sin evaluación, en [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md).
  Modelos configurables en `config.yml`.
- Tests TDD: 30 tests (16 providers + 14 de lógica pura en `image-search.ts`;
  freepik eliminado — su API no es gratuita)
- (2026-06-11) Imágenes **por caso** en `assets/images/<slug>/` — los scene-id
  se repiten entre casos y el directorio plano hacía que un caso pisara al otro.
  Candidatas por proveedor configurables en `config.yml` → `media.candidates`
  (8). La etapa ahora **falla en alto** si alguna escena queda sin imagen.
  *(Superado el 2026-06-12, PR #8: la escena sin candidatas recibe un
  placeholder SVG y el exit 1 queda para fallos de guardado — ver
  [`REFERENCIA.md`](./REFERENCIA.md) > Etapa 2.)*

**Verificado e2e (2026-06-10):** `yarn vision caso-ejemplo` contra el cluster real
→ 9/9 imágenes; `gemma4` acierta en la mayoría (volcán, ruinas). `yarn models:check`
confirma que `gemma4` acepta el base64 array.

**Limitación conocida (resuelta 2026-06-11):** la selección es tan buena como las
candidatas; los términos heurísticos débiles (ej. `scene-01`) traían archivo malo.
Resuelto con queries por escena con `qwen3.6` + pre-ranking por título con
`qwen3-embedding` (solo el top `media.shortlist` pasa a visión) + modo de imágenes
locales (`media.mode`, ver AGENTS.md > Imágenes locales). Para temas sin archivo
(técnicos/nicho) el remedio es el modo local; la GUI del pool sigue siendo la Tarea I.

**No toques:** el guion (Tarea D); consumes el storyboard ya cargado.

---

## Tarea D — Guion con qwen3.6 [Manu ✅]

**Implementado:**
- `src/pipeline/storyboard-validation.ts` — lógica pura: `extractJson` (tolera `<think>`,
  vallas markdown y prosa) y `validateStoryboard` (10 escenas, campos requeridos,
  tiempos por escena; errores con ruta de campo, p.ej. `scenes[3].voiceover`).
- `src/pipeline/01-script.ts` — retry con feedback de validación al modelo
  (3 intentos), `reasoning_config` desactivado (con fallback si el cluster lo
  rechaza), slug opcional (`yarn script "<tema>" [slug]`), `createNanCall` y
  errores ERROR/WHY/FIX.
- `src/content/load.ts` — los casos generados se cargan **sin registro manual**
  (import dinámico con slug validado). Fix: el guard de auto-ejecución no
  funcionaba en Windows (`yarn load` era un no-op).
- 14 tests TDD en `tests/pipeline/storyboard-validation.test.ts`.

**Verificado e2e (2026-06-11):** `yarn script "La biblioteca de Alejandría"
caso-alejandria` → Storyboard válido al primer intento (10 escenas, 45s); el
cluster acepta `reasoning_config`. `yarn load caso-alejandria` carga por fallback.

**Pendiente (fuera de esta tarea):** mejorar los search terms de visión con
qwen3.6 (limitación documentada en Tarea C).

---

## Tarea E — Biblioteca buscable con qwen3-embedding [abierta, sin dueño]

**Archivo:** nuevo, `src/pipeline/06-library.ts`
**Objetivo:** indexar cada caso producido y permitir búsqueda por similitud.

**Pasos:**
1. Crear una función que, dado un storyboard, genere un embedding de su título +
   narración con `qwen3-embedding` y lo guarde (un JSON local basta como índice).
2. Crear una función de búsqueda: dado un texto, genera su embedding y devuelve
   los casos más similares (similitud coseno).
3. Exponer un comando simple (`yarn library "buscar algo"`).

**Hecho cuando:** se puede indexar un caso existente (p. ej.
`caso-nan-community`) y buscar por una frase relacionada, devolviendo el caso.

**No toques:** el resto del pipeline; esta pieza es independiente.

---

## Tarea H — Harness y tooling [Manu ✅]

**Archivos:** varios (aditivos, no tocan tareas de otros)
**Objetivo:** tooling de desarrollo para el repo.

**Implementado:**
- `scripts/doctor.ts` — preflight: env vars, ffmpeg, NaN API, vitest
- `scripts/models-check.ts` — smoke test de cada modelo del cluster
- `src/lib/nan-call.ts` — wrapper con retry exponencial + semáforo (max 3) + throttle (60 rpm)
- `config.yml` — modelos + voz + providers fuera del código (carga en `src/config`)
- Carga de `.env` con `dotenv/config` (antes no se leía → `doctor` fallaba)
- Gestor de paquetes **yarn** (scripts y docs migrados; `package-lock.json` fuera)
- `.pre-commit-config.yaml` — gitleaks v8.30.1
- `.editorconfig` — utf-8, lf, indent 2
- `AGENTS.md` — mapa del repo, comandos, convenciones, cómo trabajar
- `vitest` + `yarn test` — 30 tests (freepik eliminado)

**Sin CI en GitHub Actions:** la cuenta del owner tiene Actions bloqueado por
billing, así que el workflow se eliminó. La verificación se hace **en local** antes
de la PR: `yarn typecheck` + `yarn test` (+ `yarn doctor` si tocas el cluster). Ver
[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) > No hay CI.

**Nota:** `pre-commit install` necesario tras pull.

---

## Tarea F — Entorno e integración [✅ completada 2026-06-12]

**Verificado:** `yarn produce "<tema>" [slug] [--skip-<stage>]...` encadena
las 7 etapas en orden:

- **Slug dinámico:** si no se pasa slug, busca el YAML más reciente en `content/`
- **Pre-flight:** verifica HyperFrames + ffmpeg al inicio; salta render/mux si falta
- **--skip-\<stage\>:** permite runs parciales (ej: `--skip-voice --skip-subtitles`)
- **execFile sin shell:** los argumentos van literales, sin inyección de comandos
- **Orquestador completo:** script → vision → voice → subtitles → compose → render → mux

**Uso:**
```bash
yarn produce "El día que internet colapsó" mi-caso
yarn produce "Científicos descubren algo inquietante" mi-caso --skip-subtitles
```

**Pendiente (fuera de esta tarea):** e2e test automatizado que corra el pipeline
completo contra el cluster (por ahora se valida manualmente con un caso existente).

---

## Tarea G — Composición y render [✅ completada 2026-06-12]

**Verificado:** pipeline completo e2e — `yarn produce` genera MP4 de ~55s a ~56MB.

**Cambios:**
- **GSAP timeline no pausada:** el timeline era `paused: true`, HyperFrames
  necesita que se ejecute para capturar frames → `paused: false` + `onUpdate`
  inline.
- **data-composition-id + data-duration:** HyperFrames 0.6.x requiere un root
  element con `data-composition-id` y `data-duration` para detectar la duración
  de la composición.
- **HyperFrames flags:** `--workers 1 --low-memory-mode` necesario (multi-worker
  falla con GSAP timeline detection).
- **Test actualizado:** `render-runner.test.ts` incluye los nuevos flags.

**Uso:**
```bash
yarn produce "tema" slug
yarn produce "tema" slug --skip-subtitles --skip-voice
```

**Output:** `assets/output/<slug>.mp4` (MP4 1080x1920, audio AAC + video copy)

---

## Tarea I — Generación de imágenes con el nuevo modelo NaN [futura]

**Objetivo:** explorar la generación de imágenes con el nuevo modelo de imagen de
NaN para escenas que el archivo no cubre bien (las escenas de encuadre o de
temas abstractos suelen traer candidatas de archivo malas).

**Enfoque:** la generación se hace **por la GUI de NaN** (no por API en este repo).
Las imágenes generadas se colocan en `assets/images/_pool/`, de modo que el
provider **`local`** las sirve como candidatas — sin tocar la capa de evaluación,
que ya rankea con `gemma4` sobre la unión de providers.

**Hecho cuando:** con imágenes generadas en el pool, `yarn vision <slug>`
(con `MEDIA_PROVIDERS` incluyendo `local`) las considera y `gemma4` elige entre
archivo y generadas.

**No toques:** la capa de evaluación ni los otros providers; sólo añades material
al pool local. Va en una PR aparte de la actual.

---

## Sincronización

El único punto que conecta a todos es la estructura `Storyboard` (en `types.ts`).
Está cerrada: no se cambia sin avisar, porque todas las piezas dependen de su forma.

Cierre de cada día: una corrida rápida para ver que las piezas encajan. El riesgo
principal de la hackathon no es que una pieza no funcione, es que no se integren
entre sí; por eso conviene probar la integración pronto, no el último día.
