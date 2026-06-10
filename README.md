# NaN Video Pipeline

Pipeline que convierte un **tema** en un **video corto narrado**, usando únicamente
los modelos del cluster **NaN** (API OpenAI-compatible). Sin servicios externos.

## Idea

```
Tema → guion → selección visual → voz → subtítulos → composición → MP4 (9:16)
```

Toda la información de un video vive en una estructura de datos central (el
`Storyboard`). Cada etapa la consume y la enriquece.

## Modelos del cluster y su rol

| Etapa | Modelo | Rol |
|-------|--------|-----|
| Guion | `qwen3.6` / `deepseek-v4-flash` | escribe el storyboard estructurado |
| Visión | `mimo-v2.5` | selecciona material visual de archivo (no genera imágenes) |
| Voz | `kokoro` | narración en español (`em_alex` / `ef_dora`) |
| Subtítulos | `whisper` | transcribe la voz para subtítulos |
| Biblioteca | `qwen3-embedding` | indexa y busca casos (RAG) |

Composición y render son herramientas locales (HTML + GSAP + HyperFrames + FFmpeg).

> **Nota sobre GSAP y HyperFrames:** no son dependencias instalables de este repo.
> GSAP se carga por CDN **dentro del `index.html`** de cada caso (es un script de
> navegador, no un paquete de Node). HyperFrames se ejecuta con `npx hyperframes
> render .` (se resuelve al vuelo). Por eso no aparecen en `package.json`:
> entran en escena al montar la composición, que es la etapa de render.
> FFmpeg sí debe estar instalado en el sistema (`brew install ffmpeg`).

## Estructura

```
config.yml             modelos + voz + providers (ajustable, sin tocar TS)
src/
  config/index.ts      rutas + acceso al cluster NaN + carga de config.yml
  lib/types.ts         Storyboard, Scene, ArtDirection
  lib/nan-client.ts    cliente OpenAI-compatible compartido
  lib/media/           providers de imagen (wikimedia, local, pexels)
  content/
    load.ts            cargador de casos por argumento
    caso-ejemplo.ts    caso genérico de prueba (Vesubio)
  pipeline/
    00-orchestrator.ts  ejecuta todo de principio a fin
    01-script.ts        guion con qwen3.6           (stub)
    02-vision.ts        selección visual (gemma4 + base64)
    03-voice.ts         voz con kokoro              (stub)
assets/{audio,images,output}/   área de trabajo
docs/                  TAREAS, TROUBLESHOOTING, caso-uso, sessions/
```

## Requisitos previos

- **Node.js 24+**
- **FFmpeg + ffprobe** (`brew install ffmpeg` en macOS, `apt install ffmpeg` en Linux)
- **pre-commit** (`pip install pre-commit` o `brew install pre-commit`) → `pre-commit install`
- Variables de entorno: copiar `.env.example` a `.env` y completar `NAN_BASE_URL` / `NAN_API_KEY`

## Puesta en marcha

```bash
yarn install
pre-commit install
cp .env.example .env     # completa NAN_BASE_URL y NAN_API_KEY
yarn doctor              # verifica que todo está listo
yarn load caso-ejemplo   # comprueba que la estructura carga
```

## Comandos

```bash
yarn script "<tema>"     # genera un guion (paso 1)
yarn vision <caso>       # selecciona imágenes (paso 2)
yarn voice <caso>        # genera la voz (paso 3)
yarn produce "<tema>"    # pipeline completo (orquestador)
yarn typecheck           # comprueba tipos
yarn test                # corre los tests (vitest)
yarn doctor              # verifica entorno (env + ffmpeg + API)
yarn models:check        # smoke-test de cada modelo NaN
```

## Configuración

Dos fuentes, sin solapamiento:

- **`config.yml`** (versionado): defaults compartidos — nombres de modelo, voz por
  defecto y providers de imagen. Si la plataforma renombra un modelo, se cambia aquí.
- **`.env`** (secreto, no versionado): credenciales y overrides opcionales.

| Variable (.env) | Obligatorio | Descripción |
|----------|-------------|-------------|
| `NAN_BASE_URL` | ✅ | Base URL del cluster NaN (API OpenAI-compatible) |
| `NAN_API_KEY` | ✅ | Token de autenticación del miembro (secreto) |
| `NAN_VOICE_ID` | ❌ | Override de la voz kokoro (default en `config.yml`: `em_alex`) |
| `MEDIA_PROVIDERS` | ❌ | Override de providers, csv (default en `config.yml`: `wikimedia,local`) |
| `PEXELS_API_KEY` | ❌ | API key para Pexels (opt-in, secreto) |

## Documentación

Todo lo de detalle vive en [`docs/`](./docs/):

| Documento | Para qué |
|-----------|----------|
| [`docs/TAREAS.md`](./docs/TAREAS.md) | Reparto de trabajo: objetivos y criterio de "hecho" por pieza |
| [`docs/TROUBLESHOOTING.md`](./docs/TROUBLESHOOTING.md) | Fallos del cluster ya descubiertos y su solución (mimo ciego, User-Agent, pexels…) |
| [`docs/caso-uso-1.md`](./docs/caso-uso-1.md) | Demo real de la selección visual (qué corre en local vs. qué necesita el cluster) |
| [`docs/sessions/`](./docs/sessions/) | Bitácora por sesión: la memoria compartida del equipo |

## Estado

Los scripts del pipeline son **stubs funcionales con TODOs**; la selección visual
ya está implementada. El reparto, el estado por pieza y los hallazgos del cluster
viven en `docs/` (ver tabla arriba) — no se duplican aquí.

> El material visual proviene de **archivo de dominio público seleccionado por IA**,
> no de generación: los modelos del cluster entienden imágenes pero no las generan.
