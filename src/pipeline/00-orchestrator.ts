// PASO 0 · Orquestador. Ejecuta el pipeline completo de principio a fin.
// Uso: yarn produce "La erupción del Vesubio"
//
// Pipeline de 7 etapas: script → vision → voice → subtitles → compose → render → mux.
// Stages 1-4 use `step()` (npx tsx). Stages 5-7 use direct function calls.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runRender, muxAudio } from './render-runner.js';

const exec = promisify(execFile);
const tema = process.argv[2];

if (!tema) {
  console.error('Uso: yarn produce "<tema del video>"');
  process.exit(1);
}

/**
 * Generate a URL-safe slug from a topic string.
 * "La invención de internet" → "la-invencion-de-internet"
 */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')    // keep only alphanumeric, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-')            // spaces → hyphens
    .replace(/-+/g, '-')             // collapse multiple hyphens
    .slice(0, 60);                    // cap length
}

async function step(label: string, args: string[]) {
  console.log(`\n=== ${label} ===`);
  // execFile sin shell: los argumentos (incl. el tema del usuario) van literales,
  // sin interpretación de metacaracteres → no hay inyección de comandos.
  const { stdout, stderr } = await exec('npx', ['tsx', ...args]);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

async function main() {
  const slug = slugify(tema);

  // 1. Guion
  await step('1/7 · Guion', ['src/pipeline/01-script.ts', tema, slug]);

  // 2. Selección visual
  await step('2/7 · Visión', ['src/pipeline/02-vision.ts', slug]);
  // 3. Voz
  await step('3/7 · Voz', ['src/pipeline/03-voice.ts', slug]);
  // 4. Subtítulos
  await step('4/7 · Subtítulos', ['src/pipeline/05-subtitles.ts', slug]);
  // 5. Composición — genera workspace renders/<slug>/ (manifest + HTML + assets)
  await step('5/7 · Composición', ['src/pipeline/04-compose.ts', slug]);
  // 6. Render — HyperFrames extrae frames → renders/<slug>/video-silent.mp4
  console.log('\n=== 6/7 · Render ===');
  await runRender(slug);
  // 7. Mux audio — ffmpeg combina video + audio → assets/output/<slug>.mp4
  console.log('\n=== 7/7 · Mux audio ===');
  await muxAudio(slug);

  console.log(`\n✅ Video completo: assets/output/${slug}.mp4`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
