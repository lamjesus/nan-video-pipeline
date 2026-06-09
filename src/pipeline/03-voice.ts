// PASO 3 · Generación de voz con el modelo TTS del cluster (kokoro).
// Concatena la narración de todas las escenas, genera el audio en español,
// lo re-codifica a estéreo (requisito del motor de render) y mide su duración.
// Uso: yarn voice caso-ejemplo
//
// ESTADO: stub. Falta confirmar con la doc el endpoint exacto de kokoro
// (puede ser nan.audio.speech.create o un fetch a /audio/speech).
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import type { Scene } from '../lib/types.js';

const exec = promisify(execFile);

async function main() {
  const storyboard = await loadStoryboard();
  const slug = currentCaseSlug();
  const text = storyboard.scenes.map((s: Scene) => s.voiceover).join(' ');

  // Mostrar el texto antes de generar (revisar tildes / pronunciación).
  console.log('\n--- TEXTO A NARRAR ---\n' + text + '\n--- fin ---\n');

  // --- Llamada a kokoro -----------------------------------------------------
  // TODO (Adrián): confirmar el endpoint y el formato de respuesta.
  // Ejemplo aproximado con fetch directo (ajustar a la doc real):
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
  const buffer = Buffer.from(await res.arrayBuffer());
  // --------------------------------------------------------------------------

  const rawPath = `${config.paths.audio}/${slug}-raw.mp3`;
  const finalPath = `${config.paths.audio}/${slug}.mp3`;
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
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', finalPath,
    ]);
    console.log(`Duración real: ${parseFloat(stdout).toFixed(1)}s`);
  } catch {
    console.log('Instala ffmpeg para medir la duración automáticamente.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
