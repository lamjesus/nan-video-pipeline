// PASO 0 · Orquestador. Ejecuta el pipeline completo de principio a fin.
// Uso: yarn produce "<tema>" [slug] [--skip-subtitles] [--skip-voice] ...
//
// Pipeline de 7 etapas:
//   1. script   — qwen3.6 → content/<slug>.yml
//   2. vision   — providers + gemma4 → assets/images/<slug>/
//   3. voice    — kokoro → assets/audio/<slug>.mp3
//   4. subtitles — whisper → assets/output/<slug>.srt
//   5. compose  — manifest + HTML + assets → renders/<slug>/
//   6. render   — HyperFrames → renders/<slug>/video-silent.mp4
//   7. mux      — ffmpeg → assets/output/<slug>.mp4
//
// Cada etapa es un script CLI independiente. El orquestador las encadena
// usando execFile (sin shell) para evitar inyección de comandos.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat, existsSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRender, muxAudio, checkRenderDeps } from './render-runner.js';

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

// --- Argument parsing ---

const tema = process.argv[2];
if (!tema) {
  console.error('Uso: yarn produce "<tema del video>" [slug] [--skip-<stage>]...');
  process.exit(1);
}

const slug = process.argv[3] ?? 'caso-generado';
const skipStages = new Set<string>();
for (const arg of process.argv.slice(4)) {
  if (arg.startsWith('--skip-')) {
    skipStages.add(arg.slice(9));
  }
}

// --- Helpers ---

/** Check if a YAML file exists in content/ for the given slug. */
function yamlExists(slug: string): boolean {
  const ymlPath = resolve(ROOT, 'content', `${slug}.yml`);
  return existsSync(ymlPath);
}

/**
 * Extrae el slug del YAML más reciente en content/.
 * Se usa como fallback cuando no se pasa slug explícito.
 */
function latestSlug(): string {
  const casesDir = resolve(ROOT, 'content');
  try {
    const files = readdirSync(casesDir);
    const ymlFiles = files.filter((f) => f.endsWith('.yml'));
    if (ymlFiles.length === 0) return 'caso-generado';

    let latest = ymlFiles[0];
    let latestMtime = statSync(resolve(casesDir, latest)).mtimeMs;

    for (const f of ymlFiles.slice(1)) {
      const mtime = statSync(resolve(casesDir, f)).mtimeMs;
      if (mtime > latestMtime) {
        latest = f;
        latestMtime = mtime;
      }
    }
    return latest.replace(/\.yml$/, '');
  } catch {
    return 'caso-generado';
  }
}

async function step(label: string, args: string[]): Promise<void> {
  console.log(`\n=== ${label} ===`);
  const { stdout, stderr } = await exec('yarn', ['tsx', ...args]);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

// --- Main ---

async function main() {
  // Pre-flight: check render dependencies
  console.log('🔍 Verificando dependencias...');
  const deps = await checkRenderDeps();
  if (!deps.hyperframes) {
    console.warn('⚠️  HyperFrames no instalado — las etapas render/mux se saltarán');
    console.warn('   Instala con: npm install -g hyperframes');
    skipStages.add('render');
    skipStages.add('mux');
  }
  if (!deps.ffmpeg) {
    console.warn('⚠️  ffmpeg no instalado — voice, subtitles y mux fallarán');
    console.warn('   Instala con: brew install ffmpeg (macOS) / apt install ffmpeg (Linux)');
  }

  // Si no se pasó slug, buscar el más reciente
  const effectiveSlug = slug === 'caso-generado' ? latestSlug() : slug;
  console.log(`\n🎬 Produciendo: "${tema}" (slug: ${effectiveSlug})\n`);

  // 1. Guion — solo si el YAML no existe (si ya existe, lo toma tal cual)
  if (skipStages.has('script')) skipStages.add('guion');
  if (skipStages.has('guion')) {
    console.log('\n⏭️  1/7 · Guion — saltado (--skip-script)');
  } else if (yamlExists(effectiveSlug)) {
    console.log(`\n📄 1/7 · Guion — YAML existente encontrado (content/${effectiveSlug}.yml)`);
  } else {
    console.log(`\n📝 1/7 · Guion — no existe YAML, generando con qwen3.6...`);
    await step('1/7 · Guion', ['src/pipeline/01-script.ts', tema, effectiveSlug]);
  }

  // 2. Selección visual
  if (!skipStages.has('vision')) {
    await step('2/7 · Visión', ['src/pipeline/02-vision.ts', effectiveSlug]);
  } else {
    console.log('\n⏭️  2/7 · Visión — saltado (--skip-vision)');
  }

  // 3. Voz
  if (!skipStages.has('voice')) {
    await step('3/7 · Voz', ['src/pipeline/03-voice.ts', effectiveSlug]);
  } else {
    console.log('\n⏭️  3/7 · Voz — saltado (--skip-voice)');
  }

  // 4. Subtítulos
  if (!skipStages.has('subtitles')) {
    await step('4/7 · Subtítulos', ['src/pipeline/05-subtitles.ts', effectiveSlug]);
  } else {
    console.log('\n⏭️  4/7 · Subtítulos — saltado (--skip-subtitles)');
  }

  // 5. Composición
  if (!skipStages.has('compose')) {
    await step('5/7 · Composición', ['src/pipeline/04-compose.ts', effectiveSlug]);
  } else {
    console.log('\n⏭️  5/7 · Composición — saltado (--skip-compose)');
  }

  // 6. Render — HyperFrames
  if (!skipStages.has('render')) {
    console.log('\n=== 6/7 · Render ===');
    await runRender(effectiveSlug);
  } else {
    console.log('\n⏭️  6/7 · Render — saltado (--skip-render)');
  }

  // 7. Mux audio
  if (!skipStages.has('mux')) {
    console.log('\n=== 7/7 · Mux audio ===');
    await muxAudio(effectiveSlug);
  } else {
    console.log('\n⏭️  7/7 · Mux — saltado (--skip-mux)');
  }

  console.log(`\n✅ Video completo: assets/output/${effectiveSlug}.mp4`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
