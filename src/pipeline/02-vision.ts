// PASO 2 · Selección de material visual con el modelo de visión (mimo-v2.5).
// mimo NO genera imágenes: las entiende. Aquí se le pasan imágenes candidatas
// (de archivo de dominio público, p.ej. Wikimedia Commons) y evalúa cuál
// encaja mejor con cada escena.
// Uso: yarn vision caso-ejemplo
//
// ⚠️ El cluster NaN NO acepta content como array (formato OpenAI estándar).
// El proxy litellm da "Param Incorrect" con image_url.
// Solución: pasar la imagen como markdown inline en content string.
// Ver PROGRESS.md > Hallazgos críticos > mimo-v2.5 para detalles.
import { writeFile, mkdir } from 'node:fs/promises';
import { nan } from '../lib/nan-client.js';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import type { Scene } from '../lib/types.js';

// --- Media provider layer ---
import { selectProvider } from '../lib/media/index.js';

// --- Search terms ---
// Deriva 2-3 keywords del imagePrompt de la escena.
// MVP: heurística simple (quitar stopwords).
// Opcional: llamada a qwen3.6 para keywords más precisas.
const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'of', 'to', 'for', 'with', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
  'we', 'us', 'our', 'you', 'your', 'he', 'she', 'him', 'her', 'his',
  'from', 'by', 'as', 'but', 'not', 'no', 'so', 'if', 'about', 'into',
  'over', 'after', 'before', 'between', 'under', 'above', 'below',
  'very', 'just', 'also', 'more', 'some', 'any', 'each', 'every',
  'all', 'both', 'few', 'most', 'other', 'such', 'only', 'own', 'same',
]);

function deriveSearchTerms(imagePrompt: string): string[] {
  const words = imagePrompt.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const filtered = words.filter((w) => !STOPWORDS.has(w) && w.length > 2);
  // Devolver hasta 3 términos, quitando duplicados
  return [...new Set(filtered)].slice(0, 3);
}

// --- Image download ---
// Descarga una imagen de una URL y la guarda en assets/images/<sceneId>.<ext>.
// Determina la extensión del Content-Type o de la URL.
function extFromUrl(url: string): string {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i);
  if (match) return match[1].toLowerCase();
  return 'jpg'; // fallback
}

async function downloadImage(url: string, destPath: string): Promise<void> {
  // file:// — copiar localmente (fetch de Node no soporta file://)
  if (url.startsWith('file://')) {
    const { copyFile } = await import('node:fs/promises');
    const { fileURLToPath } = await import('node:url');
    await copyFile(fileURLToPath(url), destPath);
    return;
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} descargando ${url}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
}

// --- Evalúa con mimo cuál de las candidatas encaja mejor con la escena ---
// ⚠️ Formato especial: el cluster NaN NO acepta content como array.
// Usamos markdown inline: `![image](url)` dentro del content string.
// Como no podemos pasar múltiples imágenes en un content array,
// llamamos a mimo por cada candidata por separado y elegimos la mejor.
async function elegirMejor(scene: Scene, urls: string[]): Promise<string | null> {
  if (urls.length === 0) return null;
  if (urls.length === 1) return urls[0];

  // Evaluar cada candidata por separado y pedir puntuación 1-10
  const scores: { url: string; score: number }[] = [];

  for (const url of urls) {
    try {
      const res = await nan.chat.completions.create({
        model: config.models.vision,
        messages: [
          {
            role: 'user',
            content:
              `![image](${url})\n` +
              `Escena: ${scene.imagePrompt}\n` +
              `Del 1 al 10, ¿qué tan bien esta imagen ilustra la escena? ` +
              `Responde SOLO con el número.`,
          },
        ],
        max_tokens: 10,
      });

      const txt = res.choices[0]?.message?.content ?? '';
      const score = parseInt(txt.trim(), 10);
      scores.push({ url, score: isNaN(score) ? 5 : Math.max(1, Math.min(10, score)) });
    } catch {
      scores.push({ url, score: 5 }); // fallback neutral
    }
  }

  scores.sort((a, b) => b.score - a.score);
  return scores[0].url;
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

    // 2. Buscar candidatas en todos los providers
    let candidatas: string[] = [];
    for (const provider of providers) {
      try {
        const results = await provider.search(query, 5);
        const urls = results.map((c) => c.url).filter(Boolean);
        candidatas.push(...urls);
        console.log(`  ${provider.name}: ${urls.length} candidatas`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  ${provider.name}: error - ${msg}`);
      }
    }

    // 3. Elegir la mejor con mimo
    elegidas[scene.id] = await elegirMejor(scene, candidatas);
    console.log(`  Elegida: ${elegidas[scene.id] ?? '(sin imagen)'}`);

    // 4. Descargar la elegida
    if (elegidas[scene.id]) {
      const ext = extFromUrl(elegidas[scene.id]!);
      const destDir = config.paths.images;
      await mkdir(destDir, { recursive: true });
      const destPath = `${destDir}/${scene.id}.${ext}`;
      try {
        await downloadImage(elegidas[scene.id]!, destPath);
        console.log(`  Descargada: ${destPath}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`  Error descargando: ${msg}`);
      }
    }
  }

  console.log('\n✅ Selección visual completa.');
  const total = Object.values(elegidas).filter(Boolean).length;
  console.log(`Imágenes descargadas: ${total}/${storyboard.scenes.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
