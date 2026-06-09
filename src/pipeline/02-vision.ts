// PASO 2 · Selección de material visual con el modelo de visión (mimo-v2.5).
// mimo NO genera imágenes: las entiende. Aquí se le pasan imágenes candidatas
// (de archivo de dominio público, p.ej. Wikimedia Commons) y evalúa cuál
// encaja mejor con cada escena.
// Uso: yarn vision caso-ejemplo
//
// ESTADO: stub. Falta: (1) función que busque candidatas en Wikimedia,
// (2) confirmar con la doc cómo se pasa la imagen a mimo (base64 vs URL).
import { nan } from '../lib/nan-client.js';
import { config } from '../config/index.js';
import { loadStoryboard } from '../content/load.js';
import type { Scene } from '../lib/types.js';

// TODO (Manu): implementar búsqueda de imágenes candidatas de dominio público.
async function buscarCandidatas(scene: Scene): Promise<string[]> {
  // Debe devolver una lista de URLs de imágenes relevantes al tema de la escena.
  // Fuente sugerida: API de Wikimedia Commons.
  console.warn(`  [pendiente] buscarCandidatas para ${scene.id}`);
  return [];
}

// Evalúa con mimo cuál de las candidatas encaja mejor con la escena.
async function elegirMejor(scene: Scene, urls: string[]): Promise<string | null> {
  if (urls.length === 0) return null;

  const res = await nan.chat.completions.create({
    model: config.models.vision,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Escena: ${scene.imagePrompt}\n` +
              `De las imágenes mostradas, responde SOLO con el número (empezando en 1) ` +
              `de la que mejor ilustra esta escena.`,
          },
          // TODO: confirmar el formato exacto de imagen para esta API.
          ...urls.map((url) => ({
            type: 'image_url' as const,
            image_url: { url },
          })),
        ],
      },
    ],
  });

  const txt = res.choices[0]?.message?.content ?? '';
  const idx = parseInt(txt.trim(), 10) - 1;
  return urls[idx] ?? urls[0];
}

async function main() {
  const storyboard = await loadStoryboard();
  const elegidas: Record<string, string | null> = {};

  for (const scene of storyboard.scenes) {
    const candidatas = await buscarCandidatas(scene);
    elegidas[scene.id] = await elegirMejor(scene, candidatas);
    console.log(`  ${scene.id}: ${elegidas[scene.id] ?? '(sin imagen)'}`);
  }

  console.log('\nSelección visual completa.');
  // TODO: descargar las elegidas a assets/images/ con el nombre de cada escena.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
