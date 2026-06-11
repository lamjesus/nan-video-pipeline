// Shared audio duration utility.
// Extracted from 03-voice.ts to be reusable by compose and other stages.
// Returns null if ffprobe is not installed or the file doesn't exist (graceful fallback).
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export async function getAudioDuration(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await exec('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', filePath,
    ]);
    const duration = parseFloat(stdout);
    if (isNaN(duration)) return null;
    return duration;
  } catch {
    console.warn('WARN: ffprobe no disponible. Duración no medida.');
    return null;
  }
}
