// PASO 4 · Composición: valida assets y materializa el workspace renders/<slug>/
// (manifest.json + index.html + styles.css + preview.html + copia de assets).
// Uso: yarn compose caso-ejemplo
//
// Lee el storyboard y el slug, valida que existan audio/imágenes/subtítulos,
// mide la duración real del audio con ffprobe, reescala los tiempos de escena
// al audio medido y escribe el manifest (rutas relativas al workspace) como
// contrato con el render HTML y el futuro runner de HyperFrames.
import { writeFile, mkdir, copyFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import { getAudioDuration } from '../lib/ffprobe.js';
import { discoverImages, buildManifest, validateManifest } from '../lib/manifest.js';
import { buildCopyPlan, rescaleScenesToAudio, toWorkspaceManifest } from './render-workspace.js';
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
  } else if (finalManifest.audio.duration === null) {
    console.warn(
      'WARN: sin ffprobe no se mide el audio — los tiempos de escena quedan sin calibrar (instala ffmpeg).',
    );
  }

  // 8. Write manifest — en disco van rutas RELATIVAS al workspace (portable);
  // en memoria seguimos con las absolutas para la copia de assets y el preview.
  const renderDir = resolve(process.cwd(), 'renders', slug);
  await mkdir(renderDir, { recursive: true });
  await writeFile(
    resolve(renderDir, 'manifest.json'),
    JSON.stringify(toWorkspaceManifest(finalManifest), null, 2),
  );
  console.log(`✅ Manifest written: renders/${slug}/manifest.json`);

  // 9. Generate HTML + CSS from manifest
  const html = generateHtml(finalManifest);
  const css = generateCss(finalManifest);
  await writeFile(resolve(renderDir, 'index.html'), html);
  await writeFile(resolve(renderDir, 'styles.css'), css);
  console.log(`✅ HTML/CSS written: renders/${slug}/index.html, styles.css`);

  // 10. Materialize the workspace: copia los assets que el HTML referencia en
  // rutas relativas (images/, captions/, audio/) — autocontenido para el runner.
  for (const { src, dest } of buildCopyPlan(finalManifest)) {
    const target = resolve(renderDir, dest);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(src, target);
  }
  console.log(`✅ Assets copiados a renders/${slug}/ (images/, captions/, audio/)`);

  // 11. preview.html: reproducible por humanos con doble click (audio + play +
  // captions incrustados). index.html queda intacto para HyperFrames.
  const srtContent = finalManifest.subtitle.path
    ? await readFile(finalManifest.subtitle.path, 'utf-8')
    : null;
  await writeFile(
    resolve(renderDir, 'preview.html'),
    generatePreviewHtml(finalManifest, srtContent),
  );
  console.log(`✅ Preview: renders/${slug}/preview.html (doble click para verlo)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
