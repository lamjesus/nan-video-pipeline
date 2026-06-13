// PASO 5 · Generación de subtítulos con Whisper STT del cluster.
// Transcribe el audio generado por la etapa de voz, alinea el texto canónico
// del voiceover con los timestamps de Whisper, y escribe un archivo SRT.
// Uso: yarn subtitles caso-nan-community
//
// La alineación usa LCS a nivel de palabras para que diferencias de puntuación
// no bloqueen el matching. Si Whisper no devuelve verbose_json, se distribuye
// el texto canónico en chunks uniformes dentro de los límites de cada escena.
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { loadStoryboard, currentCaseSlug } from '../content/load.js';
import { nan } from '../lib/nan-client.js';
import { createNanCall } from '../lib/nan-call.js';
import { alignSegments, chunkSegments, toSRT } from './subtitle-alignment.js';
import type { VoiceoverSegment, TranscriptionSegment } from './subtitle-alignment.js';

// --- Whisper call ---

// whisper tiene límite PROPIO de 10 rpm → bucket aparte del de chat.
const WHISPER_BUCKET = { bucket: 'stt', rpm: 10 } as const;

async function callWhisper(audioPath: string): Promise<unknown> {
  // Prefer SDK path
  if (typeof nan.audio?.transcriptions?.create === 'function') {
    const call = createNanCall(
      () =>
        nan.audio.transcriptions.create({
          model: config.models.stt,
          file: createReadStream(audioPath),
          response_format: 'verbose_json',
          language: 'es',
        } as any),
      WHISPER_BUCKET,
    );
    return call();
  }
  // Fallback: direct fetch (también con retry + semáforo + rpm propio)
  const call = createNanCall(async () => {
    const form = new FormData();
    form.append('model', config.models.stt);
    form.append('file', new Blob([readFileSync(audioPath)]), path.basename(audioPath));
    form.append('response_format', 'verbose_json');
    form.append('language', 'es');
    const res = await fetch(`${config.nan.baseUrl()}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.nan.apiKey()}` },
      body: form,
    });
    if (!res.ok) throw new Error(`Whisper HTTP ${res.status}: ${await res.text()}`);
    return res.json();
  }, WHISPER_BUCKET);
  return call();
}

// --- Response parser ---

function parseWhisperResponse(res: any): TranscriptionSegment[] {
  // verbose_json: res.segments exists
  if (res.segments && Array.isArray(res.segments)) {
    return res.segments.map((s: any) => ({
      text: s.text.trim(),
      start: s.start,
      end: s.end,
    }));
  }
  // Plain text: return empty — triggers fallback in alignSegments
  return [];
}

// --- Main ---

async function main() {
  const storyboard = await loadStoryboard();
  const slug = currentCaseSlug();
  const audioPath = path.resolve(config.paths.audio, `${slug}.mp3`);

  // 1. Check audio exists
  if (!existsSync(audioPath)) {
    throw new Error(
      `ERROR: Audio file not found at ${audioPath}\n` +
        `WHY: Voice stage must run first\n` +
        `FIX: Run \`yarn voice ${slug}\``,
    );
  }
  console.log(`Audio: ${audioPath}`);

  // 2. Call Whisper STT
  console.log('Llamando a Whisper STT...');
  const transcription = await callWhisper(audioPath);

  // 3. Parse response
  const rawSegments: TranscriptionSegment[] = parseWhisperResponse(transcription);
  console.log(`Transcripción: ${rawSegments.length} segmentos`);

  // 4. Build voiceover segments from storyboard scenes
  const voiceoverSegments: VoiceoverSegment[] = storyboard.scenes.map((s) => ({
    text: s.voiceover,
    start: s.start,
    end: s.end,
  }));

  // 5. Align
  const aligned = alignSegments(voiceoverSegments, rawSegments);

  // 6. Guard: empty SRT
  if (aligned.length === 0) {
    throw new Error(
      'ERROR: Transcription returned no segments\n' +
        'WHY: Whisper produced empty output\n' +
        'FIX: Check audio file quality and cluster STT endpoint',
    );
  }

  // 7. Chunk into short CapCut-style captions that refresh with the voice
  // (42 chars ≈ una línea de subtítulo; el default vive en chunkSegments)
  const chunked = chunkSegments(aligned);

  // 8. Write SRT
  const srt = toSRT(chunked);
  const srtPath = path.resolve(config.paths.output, `${slug}.srt`);
  await mkdir(config.paths.output, { recursive: true });
  await writeFile(srtPath, srt, 'utf-8');
  console.log(`✅ Subtítulos: ${srtPath} (${chunked.length} bloques cortos)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
