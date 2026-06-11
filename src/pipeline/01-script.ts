// PASO 1 · Generación de guion con un modelo de texto del cluster (qwen3.6).
// Recibe un tema y produce un Storyboard tipado, validado y con reintentos.
// Uso: yarn script "La erupción del Vesubio" [slug]
//      (slug opcional; por defecto "caso-generado")
//
// El caso generado se carga sin registro manual: `yarn vision <slug>` etc.
// funcionan directamente (ver el fallback de load.ts).
import { writeFile } from 'node:fs/promises';
import { nan } from '../lib/nan-client.js';
import { createNanCall } from '../lib/nan-call.js';
import { config } from '../config/index.js';
import type { Storyboard } from '../lib/types.js';
import { extractJson, validateStoryboard, REQUIRED_SCENES } from './script-util.js';

const tema = process.argv[2];
const slug = process.argv[3] ?? 'caso-generado';
const MAX_ATTEMPTS = 3;

if (!tema) {
  console.error('Uso: yarn script "<tema del video>" [slug]');
  process.exit(1);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
  console.error(
    `ERROR: slug inválido: "${slug}"\n` +
      'WHY: el slug nombra el archivo en src/content/ y los assets derivados\n' +
      'FIX: usa minúsculas, dígitos y guiones (ej. caso-vesubio)',
  );
  process.exit(1);
}

// Pide JSON puro con la forma exacta del Storyboard. El vocabulario de motion
// coincide con los presets GSAP de src/render/motion.ts (zoom, paneo, shake,
// deriva, estático) para que el render los reconozca.
const SYSTEM = `Eres un guionista de documentales cortos en video vertical.
Devuelves SOLO un objeto JSON válido, sin texto adicional, sin markdown y sin comentarios.
Forma exacta:
{
  "channel": string, "caseNumber": number, "title": string,
  "totalDuration": number (segundos),
  "artDirection": {
    "medium": string, "lineWork": string, "palette": string, "lighting": string,
    "texture": string, "mood": string, "composition": string,
    "humanTreatment": string, "constraints": string
  },
  "scenes": [
    {
      "id": "scene-01", "block": "GANCHO" | "DESARROLLO" | "CIERRE",
      "start": number, "end": number,
      "voiceover": string (español, tildes correctas),
      "onScreenText": string[],
      "imagePrompt": string (EN INGLÉS, concreto y visual),
      "motion": string ("zoom-in lento", "zoom-out", "paneo lateral", "shake", "deriva", "estático")
    }
  ]
}
Reglas:
- Exactamente ${REQUIRED_SCENES} escenas, con ids "scene-01" a "scene-${REQUIRED_SCENES}".
- Tiempos contiguos: la primera escena empieza en 0, cada escena empieza donde
  acaba la anterior y el end de la última es igual a totalDuration.
- La narración (voiceover) va en español; los imagePrompt en inglés.
- Sin gore ni contenido explícito.`;

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

// El cluster documenta `reasoning_config` para desactivar el razonamiento de
// qwen3.6 (más rápido y barato para JSON estructurado). Si el servidor rechaza
// el parámetro, se reintenta sin él; extractJson tolera además los bloques
// <think> por si el razonamiento queda activo.
let reasoningOff = true;

async function complete(messages: ChatMessage[]): Promise<string> {
  const call = createNanCall(() =>
    nan.chat.completions.create({
      model: config.models.text,
      messages,
      ...(reasoningOff ? ({ reasoning_config: { enabled: false } } as object) : {}),
    }),
  );
  try {
    const res = await call();
    return res.choices[0]?.message?.content ?? '';
  } catch (err) {
    if (reasoningOff) {
      reasoningOff = false;
      console.warn('WARN: el cluster rechazó reasoning_config; reintentando sin él.');
      return complete(messages);
    }
    throw err;
  }
}

async function main() {
  console.log(`Generando guion para: "${tema}" (slug: ${slug})...`);

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `Tema del video: ${tema}` },
  ];

  let storyboard: Storyboard | null = null;
  let lastErrors: string[] = [];
  let lastRaw = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.warn(`Reintento ${attempt}/${MAX_ATTEMPTS} con feedback de validación...`);
    }
    lastRaw = await complete(messages);
    const json = extractJson(lastRaw);

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      lastErrors = ['la respuesta no es JSON parseable'];
      messages.push(
        { role: 'assistant', content: lastRaw },
        {
          role: 'user',
          content:
            'Tu respuesta no es JSON parseable. Devuelve SOLO el objeto JSON corregido, sin ningún texto adicional.',
        },
      );
      continue;
    }

    const validation = validateStoryboard(parsed);
    if (!validation.valid) {
      lastErrors = validation.errors;
      messages.push(
        { role: 'assistant', content: lastRaw },
        {
          role: 'user',
          content:
            `El JSON no pasa la validación:\n- ${validation.errors.join('\n- ')}\n` +
            'Devuelve SOLO el objeto JSON corregido, sin ningún texto adicional.',
        },
      );
      continue;
    }

    storyboard = parsed as Storyboard;
    break;
  }

  if (!storyboard) {
    console.error(
      `ERROR: no se obtuvo un Storyboard válido tras ${MAX_ATTEMPTS} intentos\n` +
        `WHY: ${lastErrors.join('; ')}\n` +
        `FIX: reintenta, ajusta el prompt en 01-script.ts o prueba models.textHeavy en config.yml\n` +
        `Última respuesta cruda:\n${lastRaw}`,
    );
    process.exit(1);
  }

  const path = `${config.paths.content}/${slug}.ts`;
  const fileContent =
    `// Generado por \`yarn script\` — tema: "${tema}". Regenerar sobrescribe este archivo.\n` +
    `import type { Storyboard } from '../lib/types.js';\n\n` +
    `export const storyboard: Storyboard = ${JSON.stringify(storyboard, null, 2)};\n`;
  await writeFile(path, fileContent);

  console.log(`Guion guardado en ${path} (${storyboard.scenes.length} escenas, ${storyboard.totalDuration}s)`);
  console.log(`Siguiente: yarn vision ${slug} · yarn voice ${slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
