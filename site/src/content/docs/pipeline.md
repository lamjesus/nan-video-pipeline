---
title: El pipeline
description: Las 7 etapas, los modelos que las impulsan y el flujo de datos.
---

## Modelos del cluster y su rol

| Etapa | Modelo | Rol |
|-------|--------|-----|
| Guion | `qwen3.6` | escribe el storyboard estructurado (JSON validado con retry) |
| Selección visual | `gemma4` (fallback `qwen3.6`) | evalúa candidatas reales en base64 |
| Pre-ranking | `qwen3-embedding` | similitud coseno query ↔ títulos de candidatas |
| Voz | `kokoro` | narración en español (`em_alex` / `ef_dora`) |
| Subtítulos | `whisper` | transcripción con timestamps |

Composición y render son herramientas locales: HTML + GSAP + HyperFrames + FFmpeg.

## Flujo de datos

```
tema → (qwen3.6) → content/<slug>.yml
     → (providers + embedding + gemma4) → assets/images/<slug>/
     → (kokoro + ffmpeg) → assets/audio/<slug>.mp3
     → (whisper + alineación LCS) → assets/output/<slug>.srt
     → (manifest + GSAP) → renders/<slug>/
     → (HyperFrames + ffmpeg mux) → assets/output/<slug>.mp4
```

El contrato entre etapas es el `Storyboard` (datos en YAML, nunca código) y el
`Manifest` (contrato composición → render, con rutas relativas portables).

## Decisiones clave

- **La visión no genera imágenes: elige.** El cluster no tiene image-gen por
  API; el material sale de archivo (Wikimedia/Pexels) o de un pool local de
  imágenes generadas fuera. `gemma4` puntúa cada candidata mirando los bytes
  reales (base64), porque los modelos del cluster no descargan URLs.
- **El audio real manda.** El guion inventa tiempos; tras generar la voz, los
  tiempos de escena se reescalan a la duración real medida con ffprobe.
- **Captions inline.** Los subtítulos se alinean por LCS contra el texto
  canónico del guion y viajan como HTML estático por escena — el render no
  hace fetch en runtime.
- **Throttle por endpoint.** `nan-call` serializa todo el proceso: 3
  concurrentes globales y ventanas de rpm por endpoint (chat 60, kokoro 15,
  whisper 10), con retry exponencial.

> Referencia técnica completa, etapa por etapa: `docs/` en el repositorio.
