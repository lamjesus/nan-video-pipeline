// PASO 4 · Composición: valida assets y genera render-<slug>/manifest.json.
// Uso: yarn compose caso-ejemplo
//
// Lee el storyboard y el slug, valida que existan audio/imágenes/subtítulos,
// mide la duración real del audio con ffprobe, construye el manifest puro
// y lo escribe en render-<slug>/manifest.json como contrato con el render HTML.
import { writeFile, mkdir, copyFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import { getAudioDuration } from '../lib/ffprobe.js';
import { discoverImages, buildManifest, validateManifest } from '../lib/manifest.js';
import { buildCopyPlan, rescaleScenesToAudio } from './compose-util.js';
import { generateHtml, generateCss } from '../render/template.js';
import { generatePreviewHtml } from '../render/preview.js';

async function main() {
  const storyboard = await loadStoryboard();
  const slug = currentCaseSlug();

  // 1. Validate audio exists (hard error)
  const audioPath = resolve(config.paths.audio, `${slug}.mp3`);
  if (!existsSync(audioPath)) {
    console.error(`ERROR: Audio file not found at ${audioPath}`);
    process.exit(1);
  }

  // 2. Measure audio duration
  const audioDuration = await getAudioDuration(audioPath);

  // 3. Validate subtitle exists (soft warning)
  const subtitlePath = resolve(config.paths.output, `${slug}.srt`);
  let subtitleFilePath: string | null = subtitlePath;
  if (!existsSync(subtitlePath)) {
    console.warn(`WARN: Subtitle file not found at ${subtitlePath}`);
    subtitleFilePath = null;
  }

  // 4. Discover images per scene
  const imageMap = await discoverImages(config.paths.imagesFor(slug), storyboard.scenes);

  // 5. Build manifest
  const manifest = buildManifest(
    storyboard,
    slug,
    audioPath,
    audioDuration,
    subtitleFilePath,
    imageMap,
  );

  // 6. Validate scene timings
  const validation = validateManifest(manifest);
  for (const w of validation.warnings) {
    console.warn(w);
  }
  if (!validation.valid) {
    console.error(`ERROR: Scene timing invalid\n${validation.errors.join('\n')}`);
    process.exit(1);
  }

  // 7. Rescale scene timings to the measured audio duration. El guion inventa
  // los tiempos; el audio real manda (evita cola muda o corte en el render).
  const finalManifest = rescaleScenesToAudio(manifest);
  if (finalManifest !== manifest) {
    const last = finalManifest.scenes[finalManifest.scenes.length - 1];
    console.log(`✅ Escenas reescaladas a la duración real del audio (${last.end}s)`);
  }

  // 8. Write manifest
  const renderDir = resolve(process.cwd(), `render-${slug}`);
  await mkdir(renderDir, { recursive: true });
  await writeFile(
    resolve(renderDir, 'manifest.json'),
    JSON.stringify(finalManifest, null, 2),
  );
  console.log(`✅ Manifest written: render-${slug}/manifest.json`);

  // 9. Generate HTML + CSS from manifest
  const html = generateHtml(finalManifest);
  const css = generateCss(finalManifest);
  await writeFile(resolve(renderDir, 'index.html'), html);
  await writeFile(resolve(renderDir, 'styles.css'), css);
  console.log(`✅ HTML/CSS written: render-${slug}/index.html, styles.css`);

  // 10. Materialize the workspace: copia los assets que el HTML referencia en
  // rutas relativas (images/, captions/, audio/) — autocontenido para el runner.
  for (const { src, dest } of buildCopyPlan(finalManifest)) {
    const target = resolve(renderDir, dest);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(src, target);
  }
  console.log(`✅ Assets copiados a render-${slug}/ (images/, captions/, audio/)`);

  // 11. preview.html: reproducible por humanos con doble click (audio + play +
  // captions incrustados). index.html queda intacto para HyperFrames.
  const srtContent = finalManifest.subtitle.path
    ? await readFile(finalManifest.subtitle.path, 'utf-8')
    : null;
  await writeFile(
    resolve(renderDir, 'preview.html'),
    generatePreviewHtml(finalManifest, srtContent),
  );
  console.log(`✅ Preview: render-${slug}/preview.html (doble click para verlo)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
