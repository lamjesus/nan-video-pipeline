// PASO 4 · Composición: valida assets y genera render-<slug>/manifest.json.
// Uso: yarn compose caso-ejemplo
//
// Lee el storyboard y el slug, valida que existan audio/imágenes/subtítulos,
// mide la duración real del audio con ffprobe, construye el manifest puro
// y lo escribe en render-<slug>/manifest.json como contrato con el render HTML.
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import { getAudioDuration } from '../lib/ffprobe.js';
import { discoverImages, buildManifest, validateManifest } from '../lib/manifest.js';

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
  const imageMap = await discoverImages(config.paths.images, storyboard.scenes);

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

  // 7. Write manifest
  const renderDir = resolve(process.cwd(), `render-${slug}`);
  await mkdir(renderDir, { recursive: true });
  await writeFile(
    resolve(renderDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`✅ Manifest written: render-${slug}/manifest.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
