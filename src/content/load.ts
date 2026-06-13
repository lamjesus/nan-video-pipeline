// Cargador de casos. Los casos son DATOS (content/<slug>.yml), no código:
// se parsean y validan al cargar — nada generado se ejecuta jamás.
// Selecciona el caso por el primer argumento de la CLI (p.ej. `yarn voice caso-x`).
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { config } from '../config/index.js';
import { validateStoryboard } from '../pipeline/storyboard-validation.js';
import type { Storyboard } from '../lib/types.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;

export async function loadStoryboard(): Promise<Storyboard> {
  const slug = currentCaseSlug();
  if (!SLUG_RE.test(slug)) {
    throw new Error(`Caso desconocido: "${slug}". Disponibles: ${await disponibles()}`);
  }

  const file = resolve(config.paths.cases, `${slug}.yml`);
  let raw: string;
  try {
    raw = await readFile(file, 'utf-8');
  } catch {
    throw new Error(
      `Caso desconocido: "${slug}". Disponibles: ${await disponibles()} ` +
        `(o genera uno nuevo con: yarn script "<tema>" ${slug})`,
    );
  }

  const data = parse(raw) as unknown;
  // El recuento de escenas es regla de GENERACIÓN; al cargar se valida solo
  // la estructura (el recuento puede variar entre casos).
  const v = validateStoryboard(data);
  if (!v.valid) {
    throw new Error(
      `ERROR: el caso "${slug}" no es un Storyboard válido\n` +
        `WHY:\n- ${v.errors.join('\n- ')}\n` +
        `FIX: corrige content/${slug}.yml (o regenéralo: yarn script "<tema>" ${slug})`,
    );
  }

  const storyboard = data as Storyboard;
  console.log(`> Caso cargado: ${slug} (${storyboard.title})`);
  return storyboard;
}

/** Slugs de los casos disponibles en content/. */
export async function listCases(): Promise<string[]> {
  try {
    const files = await readdir(config.paths.cases);
    return files
      .filter((f) => f.endsWith('.yml'))
      .map((f) => f.replace(/\.yml$/, ''))
      .sort();
  } catch {
    return [];
  }
}

async function disponibles(): Promise<string> {
  const cases = await listCases();
  return cases.length > 0 ? cases.join(', ') : '(ninguno)';
}

/** Slug del caso actual, para nombrar archivos de salida. */
export function currentCaseSlug(): string {
  return process.argv[2] ?? 'caso-nan-community';
}

// Permite probar el cargador directamente: `npx tsx src/content/load.ts caso-nan-community`
// (pathToFileURL: en Windows `file://${argv[1]}` nunca coincide por los backslashes)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadStoryboard()
    .then((sb) => console.log(`OK · ${sb.scenes.length} escenas · ${sb.totalDuration}s`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
