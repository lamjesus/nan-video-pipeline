---
title: Empezar
description: Puesta en marcha del pipeline en local.
---

## Requisitos previos

- **Node.js 24+** y **yarn**
- **FFmpeg + ffprobe** (`brew install ffmpeg` en macOS, `apt install ffmpeg` en Linux)
- **HyperFrames** para el render final (`npm install -g hyperframes`)
- **pre-commit** (`pip install pre-commit`) → `pre-commit install`
- Una cuenta de la comunidad NaN con su `NAN_BASE_URL` y `NAN_API_KEY`

## Puesta en marcha

```bash
yarn install
pre-commit install
cp .env.example .env          # completa NAN_BASE_URL y NAN_API_KEY
yarn doctor                   # preflight: env, ffmpeg, HyperFrames, API NaN
yarn load caso-nan-community  # comprueba que el caso del repo carga
```

## Comandos

```bash
# Pipeline completo de un tema a un MP4
yarn produce "<tema>" [slug] [--skip-<etapa>]...

# Etapas sueltas (slug = nombre del caso)
yarn script "<tema>" [slug] [escenas]  # guion → content/<slug>.yml
yarn vision <slug>                     # 1 imagen por escena → assets/images/<slug>/
yarn voice <slug>                      # narración → assets/audio/<slug>.mp3
yarn subtitles <slug>                  # SRT → assets/output/<slug>.srt
yarn compose <slug>                    # workspace de render → renders/<slug>/

# Salud del entorno y del cluster
yarn doctor
yarn models:check

# Verificación local (no hay CI)
yarn typecheck
yarn test
```

## Configuración

Dos fuentes, sin solapamiento:

- **`config.yml`** (versionado): nombres de modelo, voz por defecto, providers
  de imagen. Si la plataforma renombra un modelo, se cambia aquí.
- **`.env`** (secreto): `NAN_BASE_URL` y `NAN_API_KEY` obligatorias; overrides
  opcionales `NAN_VOICE_ID`, `MEDIA_PROVIDERS`, `MEDIA_MODE`, `PEXELS_API_KEY`.

:::caution[Límite del cluster]
Máximo **3 peticiones simultáneas** a la API. Dentro de un proceso lo garantiza
el wrapper `nan-call` (semáforo + rpm por endpoint); entre procesos no hay
coordinación — no lances varios casos en paralelo.
:::
