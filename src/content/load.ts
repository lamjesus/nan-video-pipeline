// Cargador de casos. Selecciona qué storyboard procesar según el primer
// argumento de la línea de comandos (p.ej. `yarn voice caso-ejemplo`).
// Para añadir un caso nuevo: impórtalo y agrégalo al mapa CASES.
import type { Storyboard } from '../lib/types.js';

const CASES: Record<string, () => Promise<{ storyboard: Storyboard }>> = {
  'caso-ejemplo': () => import('./caso-ejemplo.js'),
  // 'caso-XX': () => import('./caso-XX.js'),
};

export async function loadStoryboard(): Promise<Storyboard> {
  const arg = process.argv[2] ?? 'caso-ejemplo';
  const loader = CASES[arg];
  if (!loader) {
    const disponibles = Object.keys(CASES).join(', ');
    throw new Error(`Caso desconocido: "${arg}". Disponibles: ${disponibles}`);
  }
  const mod = await loader();
  console.log(`> Caso cargado: ${arg} (${mod.storyboard.title})`);
  return mod.storyboard;
}

/** Slug del caso actual, para nombrar archivos de salida. */
export function currentCaseSlug(): string {
  return process.argv[2] ?? 'caso-ejemplo';
}

// Permite probar el cargador directamente: `npx tsx src/content/load.ts caso-ejemplo`
if (import.meta.url === `file://${process.argv[1]}`) {
  loadStoryboard()
    .then((sb) => console.log(`OK · ${sb.scenes.length} escenas · ${sb.totalDuration}s`))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
