// PASO 3 · Generación de voz con el modelo TTS del cluster (kokoro).
// Concatena la narración de todas las escenas, genera el audio en español,
// lo re-codifica a estéreo (requisito del motor de render) y mide su duración.
// Uso: yarn voice caso-nan-community
import { writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import type { Scene } from '../lib/types.js';
import { createNanCall } from '../lib/nan-call.js';
import { getAudioDuration } from '../lib/ffprobe.js';

const exec = promisify(execFile);

async function main() {
  const storyboard = await loadStoryboard();
  const slug = currentCaseSlug();
  // Para el TTS usamos voiceoverTTS (respeleo fonético) si existe; si no,
  // el voiceover normal. Los subtítulos SIEMPRE usan voiceover (grafía correcta).
  const text = storyboard.scenes.map((s: Scene) => s.voiceoverTTS ?? s.voiceover).join(' ');

  // Mostrar el texto antes de generar (revisar tildes / pronunciación).
  console.log('\n--- TEXTO A NARRAR ---\n' + text + '\n--- fin ---\n');

  // --- Llamada a kokoro -----------------------------------------------------
  // El SDK OpenAI no cubre /audio/speech del cluster: fetch directo, pero vía
  // nan-call (retry + semáforo). kokoro tiene límite PROPIO de 15 rpm → bucket
  // aparte del de chat.
  const call = createNanCall(
    async () => {
      const res = await fetch(`${config.nan.baseUrl()}/audio/speech`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.nan.apiKey()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.models.tts,
          voice: config.voice.id(),  // em_alex (m) / ef_dora (f)
          input: text,
        }),
      });
      if (!res.ok) {
        throw new Error(`kokoro respondió ${res.status}: ${await res.text()}`);
      }
      return Buffer.from(await res.arrayBuffer());
    },
    { bucket: 'tts', rpm: 15 },
  );
  const buffer = await call();
  // --------------------------------------------------------------------------

  const rawPath = `${config.paths.audio}/${slug}-raw.mp3`;
  const finalPath = `${config.paths.audio}/${slug}.mp3`;
  // En un clone limpio assets/audio/ puede no existir (sólo viaja el .gitkeep).
  await mkdir(config.paths.audio, { recursive: true });
  await writeFile(rawPath, buffer);

  // Re-encode a estéreo estándar (el motor de render lo necesita).
  try {
    await exec('ffmpeg', [
      '-y', '-i', rawPath,
      '-codec:a', 'libmp3lame', '-b:a', '192k', '-ac', '2', '-ar', '44100',
      finalPath,
    ]);
    console.log(`Voz estéreo lista: ${finalPath}`);
  } catch {
    await writeFile(finalPath, buffer);
    console.warn('ffmpeg falló; se guardó el audio crudo. Re-encodea a mano.');
  }

  // Medir duración real (necesaria para sincronizar el montaje).
  const duration = await getAudioDuration(finalPath);
  if (duration !== null) {
    console.log(`Duración real: ${duration.toFixed(1)}s`);
  } else {
    console.log('Instala ffmpeg para medir la duración automáticamente.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
