# Tareas

Cada tarea es autónoma: tiene un **objetivo**, un **archivo** donde trabajar,
**pasos** y un **criterio de hecho** (cómo saber que quedó). Las marcadas con
**[Luis]** ya tienen dueño; el resto están abiertas para repartir.

Antes de tocar nada: `yarn install`, copiar `.env.example` a `.env` y completarlo,
y comprobar que `yarn load caso-ejemplo` corre sin error.

Regla de oro: **no toques el archivo de otra tarea.** Si necesitas un dato de
otra pieza, usa datos de ejemplo (el `caso-ejemplo`) mientras tanto.

---

## Tarea A — Voz con kokoro

**Archivo:** `src/pipeline/03-voice.ts`
**Objetivo:** que `yarn voice caso-ejemplo` genere un MP3 con la narración en español.

**Pasos:**
1. Confirmar en la documentación del cluster el endpoint real de `kokoro`
   (puede ser `/audio/speech` u otro) y el formato de respuesta (binario / base64).
2. Ajustar la llamada `fetch` del stub a ese endpoint y formato.
3. Probar las voces `em_alex` (masculina) y `ef_dora` (femenina); dejar como
   default la que suene mejor para narración (se cambia en `.env`, `NAN_VOICE_ID`).
4. Mantener el paso de FFmpeg (re-encode a estéreo) y la medición de duración.

**Hecho cuando:** corre `yarn voice caso-ejemplo`, se crea `assets/audio/caso-ejemplo.mp3`
en estéreo, y la consola imprime la duración real.

**No toques:** los tipos (`types.ts`) ni el cargador (`load.ts`).

---

## Tarea B — Subtítulos con whisper [✅ done]

**Implementado:**
- `src/pipeline/05-subtitles.ts` — orchestration: audio read → Whisper STT → alignment → SRT write
- `src/pipeline/subtitle-util.ts` — pure alignment (LCS word matching) + SRT serialization
- `tests/pipeline/subtitle-util.test.ts` — 7 tests covering alignment, fallback, SRT format
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
  (formato array OpenAI), porque `mimo-v2.5` está ciego en el cluster. El porqué,
  en [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md); demo en [`caso-uso-1.md`](./caso-uso-1.md).
  Modelos configurables en `config.yml`.
- Tests TDD: 30 tests (16 providers + 14 de lógica pura en `vision-util.ts`;
  freepik eliminado — su API no es gratuita)

**Verificado e2e (2026-06-10):** `yarn vision caso-ejemplo` contra el cluster real
→ 9/9 imágenes; `gemma4` acierta en la mayoría (volcán, ruinas). `yarn models:check`
confirma que `gemma4` acepta el base64 array. Detalle en `caso-uso-1.md`.

**Limitación conocida:** la selección es tan buena como las candidatas; términos
heurísticos débiles (ej. `scene-01`) traen archivo malo → mejorar keywords con
`qwen3.6` (Tarea D) y generar imágenes al pool (Tarea I).

**No toques:** el guion (Tarea D); consumes el storyboard ya cargado.

---

## Tarea D — Guion con qwen3.6 [Manu ✅]

**Implementado:**
- `src/pipeline/script-util.ts` — lógica pura: `extractJson` (tolera `<think>`,
  vallas markdown y prosa) y `validateStoryboard` (10 escenas, campos requeridos,
  tiempos por escena; errores con ruta de campo, p.ej. `scenes[3].voiceover`).
- `src/pipeline/01-script.ts` — retry con feedback de validación al modelo
  (3 intentos), `reasoning_config` desactivado (con fallback si el cluster lo
  rechaza), slug opcional (`yarn script "<tema>" [slug]`), `createNanCall` y
  errores ERROR/WHY/FIX.
- `src/content/load.ts` — los casos generados se cargan **sin registro manual**
  (import dinámico con slug validado). Fix: el guard de auto-ejecución no
  funcionaba en Windows (`yarn load` era un no-op).
- 14 tests TDD en `tests/pipeline/script-util.test.ts`.

**Verificado e2e (2026-06-11):** `yarn script "La biblioteca de Alejandría"
caso-alejandria` → Storyboard válido al primer intento (10 escenas, 45s); el
cluster acepta `reasoning_config`. `yarn load caso-alejandria` carga por fallback.

**Pendiente (fuera de esta tarea):** mejorar los search terms de visión con
qwen3.6 (limitación documentada en Tarea C).

---

## Tarea E — Biblioteca buscable con qwen3-embedding

**Archivo:** nuevo, `src/pipeline/06-library.ts`
**Objetivo:** indexar cada caso producido y permitir búsqueda por similitud.

**Pasos:**
1. Crear una función que, dado un storyboard, genere un embedding de su título +
   narración con `qwen3-embedding` y lo guarde (un JSON local basta como índice).
2. Crear una función de búsqueda: dado un texto, genera su embedding y devuelve
   los casos más similares (similitud coseno).
3. Exponer un comando simple (`yarn library "buscar algo"`).

**Hecho cuando:** se puede indexar el caso-ejemplo y buscar por una frase
relacionada, devolviendo el caso.

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

## Tarea F — Entorno e integración [Luis]

**Objetivo:** que el repo arranque limpio en cualquier máquina y el orquestador
encadene las piezas.

**Incluye:** revisar `package.json`/`tsconfig`, el orquestador
(`00-orchestrator.ts`), y que `yarn produce "<tema>"` corra las etapas en orden.

---

## Tarea G — Composición y render [Luis]

**Objetivo:** montar el video final a partir del guion, la voz y las imágenes.

**Incluye:** la composición animada (`index.html` con la línea de tiempo) y la
integración con HyperFrames para exportar el MP4 vertical. GSAP se carga por CDN
dentro del propio HTML; HyperFrames se ejecuta con `npx hyperframes render .`.
Esta pieza la lleva Luis.

---

## Tarea I — Generación de imágenes con el nuevo modelo NaN [Manu · próxima PR]

**Objetivo:** explorar la generación de imágenes con el nuevo modelo de imagen de
NaN para escenas que el archivo no cubre bien (ej. la `scene-01` del caso-ejemplo,
donde las candidatas de archivo son malas).

**Enfoque:** la generación se hace **por la GUI de NaN** (no por API en este repo).
Las imágenes generadas se colocan en `assets/images/_pool/`, de modo que el
provider **`local`** las sirve como candidatas — sin tocar la capa de evaluación,
que ya rankea con `gemma4` sobre la unión de providers.

**Hecho cuando:** con imágenes generadas en el pool, `yarn vision caso-ejemplo`
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
