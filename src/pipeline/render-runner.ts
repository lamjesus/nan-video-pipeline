// Render runner: invokes HyperFrames for frame extraction and ffmpeg for audio mux.
// Provides checkRenderDeps(), runRender(slug), and muxAudio(slug).
// Usage: imported by 00-orchestrator.ts for stages 6/7.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const execAsync = promisify(execFile);

/**
 * Check availability of render dependencies (HyperFrames and ffmpeg).
 * Returns which tools are installed — does NOT throw on missing.
 */
export async function checkRenderDeps(): Promise<{ hyperframes: boolean; ffmpeg: boolean }> {
  let hyperframes = false;
  let ffmpeg = false;

  try {
    await execAsync('npx', ['hyperframes', '--version']);
    hyperframes = true;
  } catch {
    // not installed
  }

  try {
    await execAsync('ffmpeg', ['-version']);
    ffmpeg = true;
  } catch {
    // not installed
  }

  return { hyperframes, ffmpeg };
}

/**
 * Validate that the HyperFrames workspace exists and run the render.
 * Produces renders/<slug>/video-silent.mp4 (frames only, no audio).
 *
 * ERROR/WHY/FIX on failure:
 * - Missing index.html → compose stage hasn't run
 * - HyperFrames command fails → check installation
 */
export async function runRender(slug: string): Promise<void> {
  const renderDir = resolve(process.cwd(), 'renders', slug);

  if (!existsSync(resolve(renderDir, 'index.html'))) {
    const msg = [
      `ERROR: No se encuentra renders/${slug}/index.html`,
      'WHY: La etapa de composición no generó el workspace HTML',
      `FIX: Ejecuta: yarn compose ${slug}`,
    ].join('\n');
    throw new Error(msg);
  }

  try {
    await execAsync('npx', [
      'hyperframes',
      'render',
      renderDir,
      '--output',
      resolve(renderDir, 'video-silent.mp4'),
    ]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `ERROR: HyperFrames falló al renderizar renders/${slug}\n` +
      `WHY: ${detail}\n` +
      'FIX: Verifica que el workspace HTML sea válido; instala HyperFrames con: npm install -g hyperframes',
    );
  }
}

/**
 * Mux the silent video from HyperFrames with the audio file from the manifest.
 * Produces assets/output/<slug>.mp4 and cleans up the intermediate video-silent.mp4.
 *
 * Reads renders/<slug>/manifest.json to find the audio path.
 *
 * ERROR/WHY/FIX on failure:
 * - Missing manifest.json → compose stage hasn't run
 * - Missing video-silent.mp4 → render stage hasn't produced output
 */
export async function muxAudio(slug: string): Promise<void> {
  const renderDir = resolve(process.cwd(), 'renders', slug);
  const manifestPath = resolve(renderDir, 'manifest.json');

  if (!existsSync(manifestPath)) {
    throw new Error(
      `ERROR: No se encuentra renders/${slug}/manifest.json\n` +
      'WHY: La etapa de composición no generó el manifiesto\n' +
      `FIX: Ejecuta: yarn compose ${slug}`,
    );
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const audioPath = resolve(renderDir, manifest.audio.path);
  const videoPath = resolve(renderDir, 'video-silent.mp4');
  const outDir = resolve(process.cwd(), 'assets', 'output');
  const outputPath = resolve(outDir, `${slug}.mp4`);

  if (!existsSync(videoPath)) {
    throw new Error(
      `ERROR: renders/${slug}/video-silent.mp4 no encontrado\n` +
      'WHY: La etapa de render no produjo el video\n' +
      'FIX: Revisa que HyperFrames esté funcionando correctamente',
    );
  }

  await mkdir(outDir, { recursive: true });

  // Audio first (-i 0), silent video second (-i 1).
  // -map 1:v:0 = video from video-silent.mp4, -map 0:a:0 = audio from the audio file.
  // -c:v copy: stream-copy video (no re-encode). -c:a aac: encode audio to AAC for MP4 container.
  // -shortest: stop when the shortest input ends (handles duration mismatch).
  // -y: overwrite without prompt.
  try {
    await execAsync('ffmpeg', [
      '-i', audioPath,
      '-i', videoPath,
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-map', '1:v:0',
      '-map', '0:a:0',
      '-shortest',
      '-y',
      outputPath,
    ]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `ERROR: ffmpeg falló al mezclar audio y video\n` +
      `WHY: ${detail}\n` +
      'FIX: Verifica que ffmpeg esté instalado: brew install ffmpeg',
    );
  }

  // Cleanup intermediate silent video (NFR-03)
  await unlink(videoPath);
  console.log(`✅ Mux completado: ${outputPath}`);
}
