# Caso de uso 1 — Selección visual (Tarea C)

Demuestra la etapa de visión de punta a punta sobre el `caso-ejemplo`
(9 escenas, "El día que el Vesubio sepultó Pompeya"): para cada escena se buscan
imágenes de archivo, se descargan y un modelo de visión elige la que mejor encaja.

## Qué se prueba y cómo

| Capa | Cómo se prueba | Necesita cluster |
|------|----------------|------------------|
| Lógica pura (search terms, ext/mime, ranking) | `yarn test` (14 tests en `image-search.test.ts`) | No |
| Providers (Wikimedia, local, pexels) | `yarn test` (16 tests) | No |
| Búsqueda + descarga (con User-Agent) | corrida real de `yarn vision` | No (Wikimedia es público) |
| Evaluación por visión (`gemma4`) | corrida real de `yarn vision` | Sí (`NAN_API_KEY` + `gemma4`) |

## Correr

```bash
yarn doctor                 # confirma .env + que el cluster lista gemma4
yarn vision caso-ejemplo    # 9 escenas → assets/images/scene-0X.*
```

## Resultado con `gemma4` (evaluación real)

Cada escena evalúa sus candidatas (Wikimedia + Pexels) en base64 y elige una.
**9/9 imágenes** descargadas. Selecciones representativas:

| Escena | Prompt (resumen) | Elegida por `gemma4` |
|--------|------------------|----------------------|
| scene-04 | columna de erupción volcánica | `Lava_forms.jpg` (Wikimedia) ✅ |
| scene-06 | oleada piroclástica bajando el volcán | `Mayon_Volcano_eruption…jpg` ✅ |
| scene-09 | ruinas de Pompeya a la hora azul | `Theathres_of_Pompeii.jpg` ✅ |
| scene-01 | ciudad romana al pie del volcán | bandera del Vaticano ❌ |

## Lo que enseña (honesto)

- **La tubería funciona end-to-end** y `gemma4` mejora claramente la relevancia en
  la mayoría de escenas frente a no evaluar.
- **`scene-01` falla**: la evaluación es tan buena como las **candidatas**. Los
  términos de búsqueda heurísticos (`roman, city, foot`) traen archivo malo, y ni
  `gemma4` puede elegir bien si no hay nada bueno. → conecta con el TODO de derivar
  keywords con `qwen3.6` (Tarea D) y con generar imágenes para el pool (Tarea I).

### Contraste: sin evaluación (fallback)

Apuntando a credenciales dummy (un host que responde 404 rápido), la evaluación
cae al fallback neutro (coge la primera candidata). Mismo pipeline, selección sin
criterio:

| Escena | Elegida por el fallback |
|--------|--------------------------|
| scene-01 | bandera del Vaticano |
| scene-05 | foto de Bonnie Tyler |
| scene-07 | "grey literature" (un PDF) |

Es la mejor demostración de **por qué** hace falta la evaluación por visión: la
búsqueda+descarga sola produce archivo irrelevante; el valor está en que un modelo
**vea** la imagen (en base64, ver [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md)).
