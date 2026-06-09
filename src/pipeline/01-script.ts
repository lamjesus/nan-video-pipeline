// PASO 1 · Generación de guion con un modelo de texto del cluster (qwen3.6).
// Recibe un tema y produce un Storyboard tipado en JSON.
// Uso: yarn script "La erupción del Vesubio"
//
// ESTADO: stub funcional. El prompt y la validación se deben afinar.
import { writeFile } from 'node:fs/promises';
import { nan } from '../lib/nan-client.js';
import { config } from '../config/index.js';
import type { Storyboard } from '../lib/types.js';

const tema = process.argv[2];
if (!tema) {
  console.error('Uso: yarn script "<tema del video>"');
  process.exit(1);
}

// Prompt base. Pide JSON puro para poder parsearlo directamente.
const SYSTEM = `Eres un guionista de documentales cortos. Devuelves SOLO JSON válido,
sin texto adicional ni markdown. El JSON debe seguir esta forma:
{
  "channel": string, "caseNumber": number, "title": string,
  "totalDuration": number,
  "artDirection": { "medium","lineWork","palette","lighting","texture","mood","composition","humanTreatment","constraints" },
  "scenes": [ { "id","block","start","end","voiceover","onScreenText":[],"imagePrompt","motion" } ]
}
Genera 10 escenas. La narración (voiceover) va en español, con tildes correctas.
Los imagePrompt van en inglés. Sin gore ni contenido explícito.`;

async function main() {
  console.log(`Generando guion para: "${tema}"...`);

  const res = await nan.chat.completions.create({
    model: config.models.text,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `Tema del video: ${tema}` },
    ],
    // Nota: para qwen3.6 el razonamiento puede desactivarse para ir más rápido.
    // Revisar en la doc cómo se pasa reasoning_config en esta API.
  });

  const raw = res.choices[0]?.message?.content ?? '';
  // Limpia posibles vallas de código si el modelo las añade.
  const json = raw.replace(/```json|```/g, '').trim();

  let storyboard: Storyboard;
  try {
    storyboard = JSON.parse(json);
  } catch {
    console.error('El modelo no devolvió JSON válido. Respuesta cruda:\n', raw);
    process.exit(1);
  }

  // TODO: validación de forma (que tenga 10 escenas, campos completos, etc.)

  const slug = 'caso-generado';
  const fileContent =
    `import type { Storyboard } from '../lib/types.js';\n\n` +
    `export const storyboard: Storyboard = ${JSON.stringify(storyboard, null, 2)};\n`;
  const path = `${config.paths.content}/${slug}.ts`;
  await writeFile(path, fileContent);

  console.log(`Guion guardado en ${path}`);
  console.log(`Recuerda registrar "${slug}" en load.ts para procesarlo.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
