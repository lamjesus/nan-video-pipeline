---
title: 'Caso demo: la comunidad NaN'
description: El video que el propio pipeline produce sobre la comunidad NaN y sobre sí mismo.
---

El caso vivo del repo es `caso-nan-community`: un video demo que explica
**primero qué es la comunidad NaN** (GPUs de inferencia, API OpenAI-compatible,
modelos, NaN Cloud) y **después en qué consiste este proyecto** — con el giro
de que el propio video está producido por el pipeline que describe.

[▶ Ver en YouTube](https://youtube.com/shorts/KgxE2EAXMnE)

## Por qué el guion es curado, no generado

El storyboard (`content/caso-nan-community.yml`) se escribe a mano sobre la
documentación oficial de NaN. Si se generase con `yarn script`, el modelo
alucinaría datos (cifras, nombres de producto). La regla del orquestador lo
respeta: si el YAML existe, lo toma tal cual y no llama al modelo de guion.

## Reproducirlo

```bash
# Las imágenes se generan con IA externa y se colocan en modo local
MEDIA_MODE=local yarn produce "La comunidad NaN" caso-nan-community
```

## Estado

El guion actual es un **draft** en evolución (se está reescribiendo en dos
actos: comunidad → proyecto).