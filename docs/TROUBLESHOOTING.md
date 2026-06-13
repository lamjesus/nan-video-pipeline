# Troubleshooting

Problemas reales encontrados en el cluster NaN y sus soluciones. Formato
`SÍNTOMA / CAUSA / FIX` para que cualquiera (humano o agente) lo aplique rápido.

> Antes vivía como `PROGRESS.md` (bitácora personal, gitignoreada). Se movió aquí
> para que viaje en el repo y los compañeros lo vean.

---

## mimo-v2.5 está CIEGO (no "ve" las imágenes)

**Síntoma:** al seleccionar material visual, las N escenas devuelven la misma
imagen o descripciones que no corresponden a la imagen real. La selección no es
real.

**Causa:** `mimo-v2.5` en el cluster (vía proxy litellm) **no descarga la URL**
de la imagen. "Alucina" la descripción a partir del **nombre del fichero** de la
URL. Pasarle la imagen como markdown inline (`![image](url)`) o como `image_url`
remoto no sirve: nunca llega a mirar los bytes.

**Fix:** evaluar con **`gemma4`** (fallback `qwen3.6`) y mandar la imagen en
**base64** dentro del **formato array OpenAI**:

```ts
content: [
  { type: 'text', text: 'Escena: ... Del 1 al 10 ...' },
  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
]
```

Al ir los bytes embebidos, el proxy no tiene que ir a buscar nada y el modelo sí
describe la imagen real. Configurable en `config.yml` → `models.visionEval` /
`models.visionEvalFallback`. Implementado en `src/pipeline/02-vision.ts`.

---

## El modelo `rerank` (Qwen3-Reranker-8B) NO está desplegado

**Síntoma:** se anunció un reranker en el cluster, pero cualquier llamada de
rerank falla con `404 page not found` (texto plano).

**Causa:** a fecha 2026-06-11 el modelo **no está expuesto**: `GET /v1/models`
lista exactamente 7 modelos (deepseek-v4-flash, gemma4, kokoro, mimo-v2.5,
qwen3-embedding, qwen3.6, whisper) y ninguna ruta de rerank existe — probadas
`/v1/rerank`, `/rerank` y `/v2/rerank` (formato Cohere/Jina, el que soportan
litellm y vLLM) y `/v1/score`, `/score` (cross-encoders de vLLM). El `404` en
texto plano viene del **gateway** (cuando litellm conoce la ruta pero no el
modelo responde un JSON de error), así que el anuncio se adelantó al despliegue.

**Fix:** `yarn models:check` incluye una sonda de rerank que hoy reporta
"no desplegado" sin contar como fallo. Cuando el cluster lo exponga, la sonda
pasará a ✅ y mostrará el formato de respuesta; entonces se puede cambiar el
backend del pre-ranking de candidatas (hoy `qwen3-embedding` por similitud de
coseno, ver `config.yml > media.shortlist`) al endpoint de rerank real.

---

## Wikimedia devuelve HTML / error en vez de la imagen

**Síntoma:** la descarga de una imagen de Wikimedia falla, o devuelve HTML en
lugar de los bytes de la imagen.

**Causa:** la API y el CDN de Wikimedia **exigen un `User-Agent` identificable**.
Sin él, responden con error o con una página HTML.

**Fix:** mandar siempre un `User-Agent` en `fetch`, tanto en la búsqueda
(`src/lib/media/wikimedia.ts`) como en la descarga (`src/pipeline/02-vision.ts`):

```ts
fetch(url, { headers: { 'User-Agent': 'nan-video-pipeline/0.1 (hackathon; +<repo>)' } })
```

---

## Pexels / Freepik: la API no siempre es gratis

**Síntoma:** un provider de imágenes de stock devuelve 401/403 o requiere plan de
pago.

**Causa:** **Freepik** no ofrece API gratuita → se eliminó del repo (provider y
tests). **Pexels** sí es gratis pero **opt-in**: requiere `PEXELS_API_KEY`.

**Fix:** Pexels sólo se activa si hay key (`MEDIA_PROVIDERS` lo incluye **y**
existe `PEXELS_API_KEY`). Sin key, el selector lo salta sin romper. El default
seguro es `wikimedia,local` (ver `config.yml`).

---

## La API del cluster admite máximo 3 peticiones en paralelo

**Síntoma:** lanzando varios casos del pipeline a la vez, el cluster degrada o
da errores intermitentes.

**Causa:** el cluster NaN tiene un límite duro de **3 peticiones simultáneas**
(todas las modalidades juntas). Para colmo, el throttle original de
`nan-call.ts` creaba un semáforo nuevo por cada llamada, así que en la práctica
no limitaba nada (hallazgo P1-B de la auditoría 2026-06-11).

**Fix:** `src/lib/nan-call.ts` mantiene un semáforo **global por proceso**
(máx 3 en vuelo, 60 rpm). Como las etapas de un caso llaman a la API en serie
(~1 petición en vuelo por caso), los casos se lanzan en **máximo 2 carriles
paralelos** — nunca 3+ procesos del pipeline a la vez (un semáforo en memoria
no coordina procesos distintos).

---

## `yarn voice` crashea esporádicamente con exit code 3221226505 (Windows)

**Síntoma:** la etapa de voz muere con exit code `3221226505` (`0xC0000409`,
STATUS_STACK_BUFFER_OVERRUN) sin mensaje útil; las etapas siguientes fallan en
cascada con "Audio file not found".

**Causa:** crash nativo transitorio (ffmpeg o node en el re-encode). Observado
1 vez en 12 ejecuciones (batería del 2026-06-11, `caso-milgram`); el reintento
inmediato funcionó a la primera. No reproducible de momento.

**Fix:** reintentar `yarn voice <slug>` y seguir la cadena. Si se volviera
frecuente: separar el re-encode de ffmpeg a un paso reintentable o capturar el
exit code para reintentar automáticamente dentro de la etapa.

---

## No hay CI en GitHub Actions

**Síntoma:** la PR no ejecuta checks automáticos (typecheck/test), o aparecía un
check que fallaba al instante con "the job was not started because your account is
locked due to a billing issue".

**Causa:** GitHub Actions en repos privados consume minutos facturables. La cuenta
del **owner** del repo tiene Actions **bloqueado por billing**, así que ningún job
arranca (falla en segundos sin ejecutarse).

**Fix:** se eliminó el workflow (`.github/workflows/ci.yml`) para no dejar un check
rojo permanente. La verificación se hace **en local** antes de abrir/actualizar PR:

```bash
yarn typecheck      # tipos
yarn test           # suite completa (vitest)
yarn doctor         # sólo si tocas el cluster
```

Si el owner resuelve el billing y queréis CI de vuelta, basta recuperar el workflow
del historial (`git show <commit>:.github/workflows/ci.yml`).

---

## `gitleaks` / pre-commit no se ejecuta

**Síntoma:** los hooks de pre-commit no corren al hacer commit tras clonar o
hacer pull.

**Causa:** pre-commit se instala por repo; clonar no lo activa.

**Fix:** `pre-commit install` una vez tras clonar/pull. Requiere tener
`pre-commit` (`pip install pre-commit` o `brew install pre-commit`).

---

## El `.env` está configurado pero `yarn doctor` dice que faltan las variables

**Síntoma:** tienes tu `.env` con `NAN_BASE_URL`/`NAN_API_KEY`, pero `yarn doctor`
(o cualquier script) reporta "Falta la variable de entorno NAN_...".

**Causa:** el código **no cargaba el `.env`**. `dotenv` estaba en `package.json`
pero nadie llamaba a `dotenv.config()`, así que `process.env` no tenía esas
variables salvo que las exportaras a mano en la shell.

**Fix:** `import 'dotenv/config'` al inicio de `src/config/index.ts` (lo importan
los scripts del pipeline) y de `scripts/doctor.ts` (lee `process.env` directo). Si
no existe `.env`, dotenv no falla. Ya aplicado.

---

## Probar la tubería sin cluster (offline)

**Síntoma:** quieres ejercitar búsqueda/descarga de imágenes sin gastar el cluster.

**Causa:** el cliente del cluster (`src/lib/nan-client.ts`) se construye al
importar y exige credenciales, porque la **evaluación** por visión las necesita.

**Fix:** exporta valores dummy (`NAN_BASE_URL`, `NAN_API_KEY`) — apuntando a un
host que devuelva 404 rápido evitas reintentos lentos. La búsqueda y descarga
corren de verdad; toda la cadena de modelos degrada sin romper: las queries
caen a la heurística de stopwords, el pre-ranking se salta (bajan todas las
candidatas) y la evaluación coge la primera. Útil para ver la tubería, **no**
la calidad de selección — el contraste medido (2026-06-10, demo de la Tarea C)
fue elocuente: con `gemma4` eligiendo, 9/9 escenas razonables; con el fallback
sin visión, `scene-01` acabó con la bandera del Vaticano, `scene-05` con una
foto de Bonnie Tyler y `scene-07` con un PDF de "grey literature". El valor de
la etapa está en que un modelo VEA la imagen (en base64, ver mimo-v2.5 arriba).
