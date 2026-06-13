import { describe, it, expect } from 'vitest';
import { getAudioDuration } from '../../src/lib/ffprobe.ts';

// El happy path (duración real de un audio) no se testea aquí: exigiría un
// fixture binario y ffprobe instalado — se cubre en el e2e manual (yarn voice).
describe('getAudioDuration', () => {
  it('returns null for a missing file (graceful fallback)', async () => {
    const duration = await getAudioDuration('/nonexistent/file.mp3');
    expect(duration).toBeNull();
  });

  it('returns null when ffprobe is not available or file does not exist', async () => {
    const duration = await getAudioDuration('/tmp/this-file-does-not-exist.mp3');
    expect(duration).toBeNull();
  });
});
