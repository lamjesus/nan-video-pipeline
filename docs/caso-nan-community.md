# Caso vivo · caso-nan-community — La comunidad que te da GPUs

| | |
|---|---|
| **Slug** | `caso-nan-community` |
| **Tipo** | Video demo del proyecto · storyboard **curado a mano** (no generado) |
| **Estado** | **Guion DRAFT** — 10 escenas / 60 s; se reescribirá en 2 actos |
| **Guion** | `content/caso-nan-community.yml` (versionado) |
| **Fuentes** | Documentación oficial de NaN (PDFs: Introducción, Empezar, Modelos, Agents, API, Apps, Ejemplos) |

## Qué es

El video de demo del proyecto: explica **primero la comunidad NaN** (GPUs de
inferencia, API OpenAI-compatible, modelos, microVMs, deploys desde GitHub) y
**después este propio pipeline**. El guion actual es un borrador de un solo
acto (solo comunidad); la versión final tendrá **dos actos: comunidad →
proyecto**.

## Por qué NO se genera con `yarn script`

El storyboard habla de datos concretos (nombres de modelos, parámetros,
límites, productos de la plataforma). Generarlo con `qwen3.6` **alucinaría esos
datos**, así que el YAML está **curado a mano sobre la documentación oficial**
— el propio fichero lo avisa en su comentario de cabecera ("NO usar yarn script
para este caso"). El orquestador lo respeta: si `content/<slug>.yml` existe, lo
toma tal cual y no llama al modelo.

## Cómo reproducirlo

Las imágenes se generan con **IA externa** (modo local) — receta completa en
[`IMAGENES-IA.md`](./IMAGENES-IA.md). El estilo común sale de la
`artDirection` del YAML (dark cinematic graphic novel) y el contenido de cada
escena de su `imagePrompt`.

```bash
# 1. Imágenes: generar fuera (9:16) y colocar como
#    assets/images/caso-nan-community/scene-01.png ... scene-10.png

# 2. Etapas (el guion ya existe; vision respeta las imágenes colocadas)
yarn vision caso-nan-community
yarn voice caso-nan-community
yarn subtitles caso-nan-community
yarn compose caso-nan-community   # → renders/caso-nan-community/ (preview.html)

# O todo de una vez (toma el YAML existente, NO regenera el guion):
yarn produce "La comunidad que te da GPUs" caso-nan-community
```

## Pendiente

- **Guion en 2 actos:** reescribir el storyboard (acto 1 comunidad, acto 2 el
  propio pipeline).
- **Imágenes definitivas:** generarlas con IA externa siguiendo
  [`IMAGENES-IA.md`](./IMAGENES-IA.md).
- **Voz por decidir:** `em_alex` vs `ef_dora` (probar con `NAN_VOICE_ID` en
  `.env`, fijar la ganadora en `config.yml`).
