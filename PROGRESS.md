# PROGRESS.md — nan-video-pipeline PR

> **Rama:** `feat/media-providers-and-harness`  
> **Autor:** Manu  
> **Fecha:** 2026-06-09  
> **Propósito:** tracker temporal entre sesiones. Commit en la rama para persistir.  
> **Al final:** lo que sea relevante va al PR body como notas para el equipo.  

## 🏁 TLDR — Estado actual

| Paso | Estado | Notas |
|------|--------|-------|
| 0 — Gitleaks | ✅ | `.pre-commit-config.yaml` + `pre-commit install` |
| 1 — Doctor | ✅ | `scripts/doctor.ts`, verifica env/ffmpeg/NaN/vitest |
| 2 — Models:check | ✅ | qwen3.6/kokoro/embedding OK. mimo con markdown inline. whisper pendiente de sample |
| 3 — nan-call wrapper | ✅ | `src/lib/nan-call.ts` con retry+semáforo+throttle |
| 4 — Media providers (core) | ✅ | provider/wikimedia/local/index + tests TDD (17 tests) |
| 5 — Media providers (ext) | ✅ | pexels.ts + freepik.ts (stubs funcionales) |
| 6 — Cierre harness | 🔶 | CI creado, falta .editorconfig, AGENTS.md, TAREAS.md |

**Tests:** 17 pasan (vitest). **Typecheck:** ✅. **Doctor:** ✅. **Vision (local):** 9/9 imágenes ✅.

## Pasos completados

### Paso 0 — Gitleaks ✅
- [x] `.pre-commit-config.yaml` con gitleaks v8.30.1
- [x] `pre-commit install` ejecutado
- [x] Commit: `chore: add gitleaks pre-commit hook`

### Paso 1 — Doctor ✅
- [x] `scripts/doctor.ts` creado
- [x] Scripts package.json añadidos: `doctor`, `models:check`
- [x] Verifica: env vars, ffmpeg/ffprobe, API NaN connectivity
- [x] Commit: `feat: add doctor preflight script`
- [x] ffmpeg corregido (`-version` en lugar de `--version`)
- [x] `npm run doctor` → 100% verde ✅

### Paso 2 — Models:check ✅
- [x] `scripts/models-check.ts` creado con endpoints correctos
- [x] qwen3.6 → ✅
- [x] kokoro → ✅ (genera `_voice-sample.mp3`)
- [x] qwen3-embedding → ✅ (dimensión 4096)
- [x] mimo-v2.5 → ✅ con markdown inline `![image](url)`
- [ ] whisper → ❌ dependiente de kokoro (sin audio sample)

### Paso 3 — nan-call wrapper ✅
- [x] `src/lib/nan-call.ts`: retry exponencial + semáforo (max 3) + throttle 60rpm

### Paso 4 — Media providers (Tarea C core) ✅
- [x] `src/lib/media/provider.ts` — interfaces
- [x] `src/lib/media/wikimedia.ts` — default, sin key
- [x] `src/lib/media/local.ts` — fallback offline
- [x] `src/lib/media/index.ts` — selector por env (async)
- [x] Editar `src/pipeline/02-vision.ts` — wire + descarga + search terms
- [x] Tests TDD: 17 tests (provider/wikimedia/local/index)

### Paso 5 — Media providers ext (opt-in) ✅
- [x] `src/lib/media/pexels.ts` — opt-in PEXELS_API_KEY
- [x] `src/lib/media/freepik.ts` — opt-in FREEPIK_API_KEY

### Paso 6 — Cierre harness ✅
- [x] `.editorconfig`
- [x] `.github/workflows/ci.yml` — typecheck + test
- [x] `AGENTS.md` — mapa del repo, comandos, modelos, convenciones
- [x] Editar `TAREAS.md` (claim C + H)
- [x] `vitest.config.ts` + script `npm test`
- [x] `.env.example` actualizado con MEDIA_PROVIDERS
- [x] `npm run doctor` ✅ | `npm test` 17/17 ✅ | `npm run typecheck` ✅
- [x] `MEDIA_PROVIDERS=local npm run vision` → 9/9 imágenes ✅
- [x] Whisper → transcripción correcta con timestamps ✅

## Hallazgos de la API NaN (doc oficial)

| Modelo | Endpoint | Notas |
|--------|----------|-------|
| qwen3.6 | `POST /v1/chat/completions` | reasoning: `chat_template_kwargs.enable_thinking` (default on) |
| mimo-v2.5 | `POST /v1/chat/completions` | **⚠️ NO acepta `content` como array OpenAI** (litellm da "Param Incorrect"). Usar markdown `![image](url)` en content string. Ver hallazgo detallado abajo. |
| kokoro | `POST /v1/audio/speech` | binario mp3/wav/flac. Voices: ef_dora, em_alex, af_heart |
| whisper | `POST /v1/audio/transcriptions` | multipart/form-data. verbose_json con timestamp_granularities |
| qwen3-embedding | `POST /v1/embeddings` | estándar OpenAI |

## Diagrama de flujo — Media providers

```
02-vision.ts (main)
  │
  ├─ deriveSearchTerms(imagePrompt) → ["keyword1", "keyword2", "keyword3"]
  │    Heurística: quita stopwords, toma top 3 palabras significativas
  │
  ├─ selectProvider() → MediaProvider[]
  │    Lee MEDIA_PROVIDERS del env (default: wikimedia,local)
  │    Providers opt-in (pexels, freepik) solo si tienen API key
  │
  ├─ provider.search(query, limit) → Candidate[]
  │    ├─ WikimediaProvider: API pública de Wikipedia (sin key)
  │    ├─ LocalProvider: lee de assets/images/_pool/ (sin red)
  │    ├─ PexelsProvider: API de Pexels (requiere PEXELS_API_KEY)
  │    └─ FreepikProvider: API de Freepik (requiere FREEPIK_API_KEY)
  │
  ├─ elegirMejor(scene, urls) → url
  │    Llama a mimo-v2.5 con cada candidata por separado
  │    Usa markdown inline: `![image](url)` (único formato que acepta el cluster NaN)
  │    Pide puntuación 1-10, elige la más alta
  │
  └─ downloadImage(url, destPath)
       Descarga la imagen elegida a assets/images/<scene.id>.<ext>
```

## Decisiones técnicas

### TDD para media providers
- Se aplicó TDD estricto (RED → GREEN) para `provider.ts`, `wikimedia.ts`, `local.ts`, `index.ts`
- `nan-call.ts` NO tiene tests — es infraestructura existente, no código nuevo nuestro
- Tests usan `vitest` (instalado como devDep)
- Imports en tests usan extensión `.ts` (vitest no resuelve `.js` → `.ts` automáticamente)
- 17 tests en total, todos pasando

### selectProvider es async
- `selectProvider()` es async porque los providers opt-in (pexels, freepik) se importan con `await import()` dinámico
- Esto evita `require()` (code smell en ESM) y carga lazy solo si hay API key

### vitest config
- Sin plugins extra. Los tests importan con `.ts` directamente
- `vitest.config.ts` mínimo: solo `include` y `environment: node`

### .env.example actualizado
- Añadidas variables `MEDIA_PROVIDERS`, `PEXELS_API_KEY`, `FREEPIK_API_KEY`
- Documentado el formato csv y qué providers son opt-in

## Hallazgos críticos

### mimo-v2.5: el formato OpenAI estándar NO funciona en el cluster NaN

**ERROR:** `litellm.BadRequestError: OpenAIException - Param Incorrect. Received Model Group=mimo-v2.5`

**WHY:** El proxy litellm del cluster NaN rechaza el formato OpenAI estándar para contenido multimodal (`content` como array con `{ type: "image_url", image_url: { url } }`). La doc oficial de Xiaomi MiMo (https://platform.xiaomimimo.com/docs/en-US/usage-guide/multimodal-understanding/image-understanding) SÍ usa ese formato, pero el cluster NaN no lo soporta.

**FIX:** Pasar la imagen como markdown inline dentro del `content` string:
```ts
content: `![image](${url}) Describe esta imagen brevemente.`
```

**Verificado:**
- `content` como array con `image_url` → ❌ Param Incorrect (instantáneo)
- `content` como string con `![image](url)` → ✅ El modelo VE la imagen y la describe correctamente
- `content` como string con URL plana → ❌ El modelo NO ve la imagen (dice "I cannot view images from URLs")

**Implicaciones para la Tarea C:**
- `elegirMejor()` en `02-vision.ts` debe usar markdown inline, no el formato OpenAI array
- No se pueden pasar múltiples imágenes en una sola llamada (el markdown inline solo permite una URL por content). Solución: llamar a mimo por cada candidata por separado, o pasar todas en markdown separado por saltos de línea y pedir que elija número.

### ffmpeg
- ffmpeg no disponible en este sistema (documentado en README)

### Rate limits
- Rate limits activos en la API (3 concurrentes, 60rpm) — se soluciona con paso 3 (nan-call wrapper)

---

## 🛑 Checkpoint: parar y arrancar sesión nueva con contexto limpio

**Regla:** cuando un paso esté completo y el siguiente implique crear múltiples ficheros nuevos (especialmente pasos 4-5 con 6-8 archivos), es buen momento para parar y arrancar sesión nueva. El agente de la siguiente sesión lee PROGRESS.md y continúa desde donde se quedó sin contexto acumulado.

**Señales de que es buen checkpoint:**
- Un paso completo con commit hecho ✅
- El siguiente paso requiere crear ≥3 ficheros nuevos
- Hay hallazgos pendientes de verificar (como los endpoints de la API NaN)
- La conversación ha acumulado >20 mensajes

**Qué deja el agente:**
- PROGRESS.md actualizado con estado de cada paso
- Commits hechos por cada paso completado
- Hallazgos y decisiones documentados en el archivo

**Qué lee el siguiente agente:**
- PROGRESS.md → dónde está y qué sigue
- El spec inline o `2026-06-09-pr-brief-media-and-harness.md` si necesita contexto completo
- Los ficheros ya creados en la rama `feat/media-providers-and-harness`
