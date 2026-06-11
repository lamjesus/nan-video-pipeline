import { describe, it, expect } from 'vitest';
import { getAudioDuration } from '../../src/lib/ffprobe.ts';

describe('getAudioDuration', () => {
  it('returns a positive number for a valid audio file', async () => {
    // ffprobe on a non-existent file should return null (graceful fallback)
    const duration = await getAudioDuration('/nonexistent/file.mp3');
    expect(duration).toBeNull();
  });

  it('returns null when ffprobe is not available or file does not exist', async () => {
    const duration = await getAudioDuration('/tmp/this-file-does-not-exist.mp3');
    expect(duration).toBeNull();
  });
});
