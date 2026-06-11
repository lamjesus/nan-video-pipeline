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
import { writeFile, mkdir } from 'node:fs/promises';
import { nan } from '../lib/nan-client.js';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import type { Scene } from '../lib/types.js';

// Wikimedia (y muchos CDNs) bloquean peticiones sin User-Agent identificable.
const USER_AGENT =
  'nan-video-pipeline/0.1 (hackathon; +https://github.com/nan-cluster)';

// --- Media provider layer ---
import { selectProvider } from '../lib/media/index.js';

// --- Lógica pura (con tests en tests/pipeline/vision-util.test.ts) ---
import {
  deriveSearchTerms,
  extFromUrl,
  mimeFromExt,
  bestByScore,
} from './vision-util.js';

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
      const res = await nan.chat.completions.create({ model, messages, max_tokens: 10 });
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

  // Inicializar providers
  const providers = await selectProvider();
  console.log(`Proveedores activos: ${providers.map((p) => p.name).join(', ')}`);

  for (const scene of storyboard.scenes) {
    console.log(`\n--- ${scene.id}: ${scene.imagePrompt.slice(0, 60)}...`);

    // 1. Derivar términos de búsqueda
    const terms = deriveSearchTerms(scene.imagePrompt);
    console.log(`  Términos: ${terms.join(', ') || '(usando fallback)'}`);
    const query = terms.length > 0 ? terms.join(' ') : scene.imagePrompt;

    // 2. Buscar URLs candidatas en todos los providers
    const urls: string[] = [];
    for (const provider of providers) {
      try {
        const results = await provider.search(query, 5);
        const found = results.map((c) => c.url).filter(Boolean);
        urls.push(...found);
        console.log(`  ${provider.name}: ${found.length} candidatas`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  ${provider.name}: error - ${msg}`);
      }
    }

    // 3. Descargar los bytes UNA vez (el modelo de visión los evalúa en base64)
    const candidatas: Candidate[] = [];
    for (const url of urls) {
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
    console.log(`  Elegida: ${elegida?.url ?? '(sin imagen)'}`);

    // 5. Guardar la ganadora (ya está en memoria, no se re-descarga).
    if (elegida) {
      const destDir = config.paths.imagesFor(slug);
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
        `FIX: añade imágenes al pool local (assets/images/_pool/) o reintenta yarn vision ${slug}`,
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
