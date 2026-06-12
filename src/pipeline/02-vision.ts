// PASO 2 · Selección de material visual con un modelo de visión del cluster.
// El modelo NO genera imágenes: las entiende. Se le pasan candidatas (de archivo
// de dominio público, p.ej. Wikimedia Commons) y evalúa cuál encaja con la escena.
// Uso: yarn vision caso-ejemplo
//
// ⚠️ mimo-v2.5 está CIEGO en el cluster: no descarga URLs y alucina la imagen
// desde el nombre del fichero. La evaluación real se hace con `gemma4`
// (fallback `qwen3.6`) pasando la imagen en BASE64 dentro del formato array
// OpenAI (no markdown, no URL remota). Además Wikimedia exige User-Agent o
// devuelve HTML. Detalle completo en docs/TROUBLESHOOTING.md > mimo-v2.5.
import { writeFile, mkdir, readdir } from 'node:fs/promises';
import { nan } from '../lib/nan-client.js';
import { createNanCall } from '../lib/nan-call.js';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import type { Scene, Storyboard } from '../lib/types.js';

// Wikimedia (y muchos CDNs) bloquean peticiones sin User-Agent identificable.
const USER_AGENT =
  'nan-video-pipeline/0.1 (hackathon; +https://github.com/nan-cluster)';

// --- Media provider layer ---
import { selectProvider } from '../lib/media/index.js';

// --- Lógica pura (con tests en tests/pipeline/image-search.test.ts) ---
import {
  deriveSearchTerms,
  buildSearchQueriesPrompt,
  parseSearchQueries,
  shortlistByCosine,
  resolveMediaMode,
  findSceneOverride,
  extFromUrl,
  mimeFromExt,
  bestByScore,
} from './image-search.js';

// --- Queries de búsqueda con qwen3.6 (UNA llamada para todas las escenas) ---
// La heurística de stopwords producía queries de encuadre ("wide aerial shot")
// porque el imagePrompt empieza por la dirección de cámara. El modelo extrae
// el sujeto de cada escena; si falla tras los retries, se degrada a la
// heurística por escena (el pipeline nunca se cae por esto).
const QUERY_ATTEMPTS = 3;

async function generateSearchQueries(
  storyboard: Storyboard,
): Promise<Record<string, string> | null> {
  const scenes = storyboard.scenes.map((s) => ({ id: s.id, imagePrompt: s.imagePrompt }));
  const sceneIds = scenes.map((s) => s.id);
  let feedback = '';

  for (let attempt = 1; attempt <= QUERY_ATTEMPTS; attempt++) {
    const prompt = buildSearchQueriesPrompt(scenes, storyboard.title) + feedback;
    try {
      const call = createNanCall(() =>
        nan.chat.completions.create({
          model: config.models.text,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1000,
        }),
      );
      const res = await call();
      const raw = res.choices[0]?.message?.content ?? '';
      const { queries, errors } = parseSearchQueries(raw, sceneIds);
      if (errors.length === 0) return queries;
      console.warn(`  queries (intento ${attempt}/${QUERY_ATTEMPTS}): ${errors.length} error(es)`);
      feedback = `\n\nTu respuesta anterior tenía estos errores; corrígelos:\n- ${errors.join('\n- ')}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`  queries (intento ${attempt}/${QUERY_ATTEMPTS}): ${msg}`);
    }
  }
  return null;
}

// Trae los bytes de una candidata. Soporta file:// (pool local) y http(s).
// El User-Agent es obligatorio: sin él Wikimedia devuelve HTML, no la imagen.
async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith('file://')) {
    const { readFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    return readFile(fileURLToPath(url));
  }

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Candidata ya descargada: bytes en memoria + metadatos para evaluar/guardar.
interface Candidate {
  url: string;
  ext: string;
  buffer: Buffer;
}

// Candidata aún sin descargar: lo que devuelven los providers (URL + título).
interface FoundCandidate {
  url: string;
  title: string;
}

// --- Pre-ranking por título ANTES de descargar (qwen3-embedding) ---
// Una sola llamada a /embeddings con [query, ...títulos]; solo el top-K baja
// y pasa por gemma4. Si el embedding falla, se devuelve null y la etapa sigue
// con todas las candidatas (como antes del pre-rank). Backend intercambiable:
// cuando el cluster exponga `rerank` (ver TROUBLESHOOTING), cambiar aquí.
async function prerankByTitle(
  query: string,
  candidates: FoundCandidate[],
  topK: number,
): Promise<FoundCandidate[] | null> {
  try {
    const call = createNanCall(() =>
      nan.embeddings.create({
        model: config.models.embedding,
        input: [query, ...candidates.map((c) => c.title || '(sin título)')],
      }),
    );
    const res = await call();
    // El orden de data[] no está garantizado por la API: reordenar por index.
    const vectors = res.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
    const [queryVec, ...candVecs] = vectors;
    if (!queryVec || candVecs.length !== candidates.length) return null;
    return shortlistByCosine(
      queryVec,
      candidates.map((c, i) => ({ item: c, vector: candVecs[i] })),
      topK,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  pre-rank no disponible (${msg}); se evalúan todas las candidatas`);
    return null;
  }
}

// --- Puntúa UNA candidata (1-10) según encaja con la escena ---
// La imagen va en BASE64 dentro del formato array OpenAI (image_url con data-URI).
// Se intenta con visionEval (gemma4); si falla, con visionEvalFallback (qwen3.6).
async function puntuar(scene: Scene, cand: Candidate): Promise<number> {
  const dataUri = `data:${mimeFromExt(cand.ext)};base64,${cand.buffer.toString('base64')}`;
  const messages = [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text:
            `Escena: ${scene.imagePrompt}\n` +
            `Del 1 al 10, ¿qué tan bien esta imagen ilustra la escena? ` +
            `Responde SOLO con el número.`,
        },
        { type: 'image_url' as const, image_url: { url: dataUri } },
      ],
    },
  ];

  const modelos = [config.models.visionEval, config.models.visionEvalFallback];
  for (const model of modelos) {
    try {
      const call = createNanCall(() =>
        nan.chat.completions.create({ model, messages, max_tokens: 10 }),
      );
      const res = await call();
      const txt = res.choices[0]?.message?.content ?? '';
      const score = parseInt(txt.trim(), 10);
      if (!isNaN(score)) return Math.max(1, Math.min(10, score));
    } catch {
      // probar el siguiente modelo
    }
  }
  return 5; // neutral si ninguno respondió un número
}

// --- Elige la mejor candidata evaluándolas con el modelo de visión ---
async function elegirMejor(scene: Scene, candidatas: Candidate[]): Promise<Candidate | null> {
  if (candidatas.length === 0) return null;
  if (candidatas.length === 1) return candidatas[0];

  const scored: { item: Candidate; score: number }[] = [];
  for (const cand of candidatas) {
    scored.push({ item: cand, score: await puntuar(scene, cand) });
  }
  return bestByScore(scored);
}

async function main() {
  const storyboard = await loadStoryboard();
  const slug = currentCaseSlug();
  const elegidas: Record<string, string | null> = {};
  // URLs ya ganadoras en escenas anteriores: la misma imagen repetida en dos
  // escenas del video canta mucho (el mismo cráter salía en la 03 y la 06).
  const usadas = new Set<string>();

  // Modo de imágenes (auto = providers; local = colocadas a mano, cero red)
  // y flag --force (ignora las ya colocadas y regenera).
  const mode = resolveMediaMode(config.media.mode());
  const force = process.argv.includes('--force');
  console.log(`Modo de imágenes: ${mode}${force ? ' (--force: regenera overrides)' : ''}`);

  // Imágenes ya colocadas para este caso → override por escena (ambos modos).
  const destDir = config.paths.imagesFor(slug);
  let colocadas: string[] = [];
  try {
    colocadas = await readdir(destDir);
  } catch {
    // sin directorio = sin overrides
  }

  // Inicializar providers (modo local: solo el pool, da igual MEDIA_PROVIDERS)
  const providers = await selectProvider(mode);
  console.log(`Proveedores activos: ${providers.map((p) => p.name).join(', ')}`);

  // En modo local, el pool ENTERO entra al pre-ranking por nombre de fichero
  // (no solo los primeros N): el shortlist ya corta lo que baja a visión.
  const searchLimit = mode === 'local' ? 1000 : config.media.candidates;

  // Queries de búsqueda por escena con qwen3.6 (una llamada para el caso).
  // Si todas las escenas tienen override, la llamada sobra.
  const hayPendientes =
    force || storyboard.scenes.some((s) => !findSceneOverride(colocadas, s.id));
  const llmQueries = hayPendientes ? await generateSearchQueries(storyboard) : null;
  if (hayPendientes) {
    console.log(
      llmQueries
        ? `Queries de búsqueda: qwen3.6 (${Object.keys(llmQueries).length} escenas)`
        : 'Queries de búsqueda: heurística (qwen3.6 no disponible)',
    );
  }

  for (const scene of storyboard.scenes) {
    console.log(`\n--- ${scene.id}: ${scene.imagePrompt.slice(0, 60)}...`);

    // 0. Override: imagen ya colocada para la escena → se respeta tal cual.
    const override = force ? null : findSceneOverride(colocadas, scene.id);
    if (override) {
      elegidas[scene.id] = `${destDir}/${override}`;
      console.log(`  Override: ${override} ya colocada (regenera con --force o borrándola)`);
      continue;
    }

    // 1. Query de búsqueda: qwen3.6 → heurística → imagePrompt crudo
    const terms = deriveSearchTerms(scene.imagePrompt);
    const query =
      llmQueries?.[scene.id] ?? (terms.length > 0 ? terms.join(' ') : scene.imagePrompt);
    console.log(`  Query: ${query}`);

    // 2. Buscar candidatas (URL + título) en todos los providers
    const encontradas: FoundCandidate[] = [];
    for (const provider of providers) {
      try {
        const results = await provider.search(query, searchLimit);
        const valid = results.filter((c) => c.url);
        encontradas.push(...valid.map((c) => ({ url: c.url, title: c.title ?? '' })));
        console.log(`  ${provider.name}: ${valid.length} candidatas`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  ${provider.name}: error - ${msg}`);
      }
    }
    // La misma URL puede venir de dos providers: deduplicar antes de rankear.
    let pool = [...new Map(encontradas.map((c) => [c.url, c])).values()];

    // No repetir imagen entre escenas (mejor repetir que dejar la escena sin
    // imagen: si el filtro vacía el pool, se permite la repetición).
    const sinUsar = pool.filter((c) => !usadas.has(c.url));
    if (sinUsar.length > 0) pool = sinUsar;

    // 2.5 Pre-ranking por título antes de descargar: solo el top-K baja.
    if (config.media.shortlist > 0 && pool.length > config.media.shortlist) {
      const ranked = await prerankByTitle(query, pool, config.media.shortlist);
      if (ranked) {
        console.log(`  Pre-rank: ${pool.length} → ${ranked.length} candidatas (por título)`);
        pool = ranked;
      }
    }

    // 3. Descargar los bytes UNA vez (el modelo de visión los evalúa en base64)
    const candidatas: Candidate[] = [];
    for (const { url } of pool) {
      try {
        candidatas.push({ url, ext: extFromUrl(url), buffer: await fetchImageBuffer(url) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  descarga fallida (${url}): ${msg}`);
      }
    }

    // 4. Elegir la mejor con el modelo de visión (gemma4 → qwen3.6)
    const elegida = await elegirMejor(scene, candidatas);
    elegidas[scene.id] = elegida?.url ?? null;
    if (elegida) usadas.add(elegida.url);
    console.log(`  Elegida: ${elegida?.url ?? '(sin imagen)'}`);

    // 5. Guardar la ganadora (ya está en memoria, no se re-descarga).
    if (elegida) {
      await mkdir(destDir, { recursive: true });
      const destPath = `${destDir}/${scene.id}.${elegida.ext}`;
      try {
        await writeFile(destPath, elegida.buffer);
        console.log(`  Guardada: ${destPath}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  Error guardando: ${msg}`);
      }
    }
  }

  // Fallo en alto si falta alguna imagen: una escena sin imagen = escena en
  // negro en el video. El orquestador solo ve el exit code (P1-C auditoría).
  const total = Object.values(elegidas).filter(Boolean).length;
  if (total < storyboard.scenes.length) {
    const missing = storyboard.scenes.filter((s) => !elegidas[s.id]).map((s) => s.id);
    console.error(
      `ERROR: faltan imágenes para ${missing.length} escena(s): ${missing.join(', ')}\n` +
        'WHY: ningún proveedor devolvió candidatas válidas o falló la descarga/guardado\n' +
        `FIX: añade imágenes al pool (assets/images/_pool/), colócalas por escena ` +
        `(assets/images/${slug}/<scene-id>.jpg) o reintenta yarn vision ${slug}`,
    );
    process.exit(1);
  }
  console.log('\n✅ Selección visual completa.');
  console.log(`Imágenes descargadas: ${total}/${storyboard.scenes.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
