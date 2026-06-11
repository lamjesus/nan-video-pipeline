// Cargador de casos. Selecciona qué storyboard procesar según el primer
// argumento de la línea de comandos (p.ej. `yarn voice caso-ejemplo`).
// Para añadir un caso nuevo: impórtalo y agrégalo al mapa CASES.
import { pathToFileURL } from 'node:url';
import type { Storyboard } from '../lib/types.js';

const CASES: Record<string, () => Promise<{ storyboard: Storyboard }>> = {
  'caso-ejemplo': () => import('./caso-ejemplo.js'),
  // 'caso-XX': () => import('./caso-XX.js'),
};

export async function loadStoryboard(): Promise<Storyboard> {
  const arg = process.argv[2] ?? 'caso-ejemplo';
  const loader = CASES[arg];
  const mod = loader ? await loader() : await loadGenerated(arg);
  console.log(`> Caso cargado: ${arg} (${mod.storyboard.title})`);
  return mod.storyboard;
}

// Los casos generados con `yarn script` (src/content/<slug>.ts) se cargan sin
// registro manual en CASES. La ruta se construye en runtime (tsc no la
// resuelve) y el formato del slug se valida para no salir de src/content/.
async function loadGenerated(slug: string): Promise<{ storyboard: Storyboard }> {
  const disponibles = Object.keys(CASES).join(', ');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Caso desconocido: "${slug}". Disponibles: ${disponibles}`);
  }
  try {
    return (await import(`./${slug}.js`)) as { storyboard: Storyboard };
  } catch {
    throw new Error(
      `Caso desconocido: "${slug}". Disponibles: ${disponibles} ` +
        `(o genera uno nuevo con: yarn script "<tema>" ${slug})`,
    );
  }
}

/** Slug del caso actual, para nombrar archivos de salida. */
export function currentCaseSlug(): string {
  return process.argv[2] ?? 'caso-ejemplo';
}

// Permite probar el cargador directamente: `npx tsx src/content/load.ts caso-ejemplo`
// (pathToFileURL: en Windows `file://${argv[1]}` nunca coincide por los backslashes)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loadStoryboard()
    .then((sb) => console.log(`OK · ${sb.scenes.length} escenas · ${sb.totalDuration}s`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
