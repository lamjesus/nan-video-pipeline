---
title: Troubleshooting
description: Fallos reales del cluster ya descubiertos y su solución.
---

Resumen de los hallazgos documentados en `docs/TROUBLESHOOTING.md` del repo
(formato SÍNTOMA / CAUSA / FIX):

## mimo-v2.5 está ciego

No descarga URLs de imagen: alucina la descripción a partir del nombre del
fichero. **Fix:** evaluar con `gemma4` (fallback `qwen3.6`) mandando la imagen
en **base64** dentro del formato array OpenAI.

## Wikimedia devuelve HTML en vez de imágenes

Sin `User-Agent` identificable, `upload.wikimedia.org` responde páginas de
error. **Fix:** toda descarga lleva `User-Agent` propio.

## Máximo 3 peticiones simultáneas

Límite duro del cluster. **Fix:** el wrapper `nan-call` (semáforo global +
ventanas de rpm por endpoint + retry). No lances varios procesos del pipeline
en paralelo.

## kokoro y whisper tienen límites propios

15 rpm y 10 rpm respectivamente (vs 60 rpm del chat). **Fix:** buckets de rpm
por endpoint en `nan-call`.

## No hay CI en GitHub Actions

La cuenta del owner tiene Actions bloqueado por billing. **Fix:** verificación
local antes de cada PR: `yarn typecheck` + `yarn test` (+ `yarn doctor` si
tocas el cluster).

> La lista completa y los detalles de diagnóstico viven en
> [`docs/TROUBLESHOOTING.md`](https://github.com/lamjesus/nan-video-pipeline/blob/main/docs/TROUBLESHOOTING.md).
