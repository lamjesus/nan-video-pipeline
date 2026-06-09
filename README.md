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

> **Nota sobre GSAP y HyperFrames:** no son dependencias de npm de este repo.
> GSAP se carga por CDN **dentro del `index.html`** de cada caso (es un script de
> navegador, no un paquete de Node). HyperFrames se ejecuta con `npx hyperframes
> render .` (npx lo resuelve al vuelo). Por eso no aparecen en `package.json`:
> entran en escena al montar la composición, que es la etapa de render.
> FFmpeg sí debe estar instalado en el sistema (`brew install ffmpeg`).

## Estructura

```
src/
  config/index.ts      rutas + acceso al cluster NaN
  lib/types.ts         Storyboard, Scene, ArtDirection
  lib/nan-client.ts    cliente OpenAI-compatible compartido
  content/
    load.ts            cargador de casos por argumento
    caso-ejemplo.ts    caso genérico de prueba (Vesubio)
  pipeline/
    00-orchestrator.ts  ejecuta todo de principio a fin
    01-script.ts        guion con qwen3.6        (stub)
    02-vision.ts        selección visual con mimo (stub)
    03-voice.ts         voz con kokoro           (stub)
assets/{audio,images,output}/   área de trabajo
```

## Puesta en marcha

```bash
yarn install
cp .env.example .env     # completa NAN_BASE_URL y NAN_API_KEY
yarn load caso-ejemplo   # comprueba que la estructura carga
```

## Comandos

```bash
yarn script "<tema>"     # genera un guion (paso 1)
yarn vision <caso>       # selecciona imágenes (paso 2)
yarn voice <caso>        # genera la voz (paso 3)
yarn produce "<tema>"    # pipeline completo (orquestador)
yarn typecheck           # comprueba tipos
```

## Estado y reparto

Los scripts del pipeline son **stubs funcionales con TODOs**. El reparto detallado
de trabajo, con objetivos y criterios de "hecho" por cada pieza, está en
**[`TAREAS.md`](./TAREAS.md)**. Cada `TODO` en el código marca el punto exacto a
completar.

Resumen de lo que falta: completar voz (`kokoro`) y subtítulos (`whisper`),
selección visual (`mimo` + búsqueda en Wikimedia), guion (`qwen3.6` + validación),
biblioteca (`qwen3-embedding`), y la composición/render (a cargo de Luis).

## Nota importante

`mimo-v2.5` y los demás multimodales **entienden** imágenes pero **no las
generan**. Por eso el material visual proviene de archivo de dominio público
seleccionado por IA, no de generación. Para contenido histórico esto es además
más responsable y creíble.
