import { describe, it, expect } from 'vitest';
import { alignSegments } from '../../src/pipeline/subtitle-util.ts';
import type { VoiceoverSegment, TranscriptionSegment } from '../../src/pipeline/subtitle-util.ts';

// Regresión del hallazgo P1-A de la auditoría (2026-06-11): las palabras sin
// match en Whisper se pegaban TODAS al final de su escena, rompiendo el orden
// y generando solapes. Deben quedar en su posición, entre sus vecinos con timing.

describe('alignSegments — colocación de palabras sin match', () => {
  it('keeps unmatched middle words between their matched neighbours, preserving order', () => {
    const voiceover: VoiceoverSegment[] = [
      { text: 'uno dos tres cuatro cinco seis', start: 0, end: 12 },
    ];
    // Whisper no reconoció "tres cuatro" (palabras 3-4)
    const transcription: TranscriptionSegment[] = [
      { text: 'uno dos', start: 0, end: 4 },
      { text: 'cinco seis', start: 8, end: 12 },
    ];

    const result = alignSegments(voiceover, transcription);
    const rebuilt = result.map((s) => s.text).join(' ');
    expect(rebuilt).toBe('uno dos tres cuatro cinco seis');

    // "tres cuatro" vive en el hueco [4, 8], no al final de la escena
    const middle = result.find((s) => s.text.includes('tres'));
    expect(middle).toBeDefined();
    expect(middle!.start).toBeGreaterThanOrEqual(4);
    expect(middle!.end).toBeLessThanOrEqual(8);
  });

  it('produces no overlapping or zero-length segments', () => {
    const voiceover: VoiceoverSegment[] = [
      { text: 'el rápido zorro marrón salta sobre el perro perezoso', start: 0, end: 10 },
      { text: 'y después se va corriendo al bosque oscuro', start: 10, end: 20 },
    ];
    const transcription: TranscriptionSegment[] = [
      { text: 'el rapido zorro salta sobre el perro', start: 0.5, end: 8 },
      { text: 'y despues se va al bosque', start: 10.5, end: 18 },
    ];

    const result = alignSegments(voiceover, transcription);
    for (const s of result) {
      expect(s.end).toBeGreaterThan(s.start);
    }
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].end - 0.001);
    }
  });

  it('merges unmatched words into the neighbour segment when there is no time gap', () => {
    const voiceover: VoiceoverSegment[] = [
      { text: 'hola mundo cruel adiós', start: 0, end: 8 },
    ];
    // "cruel" sin match y SIN hueco entre "mundo" (end 4) y "adiós" (start 4)
    const transcription: TranscriptionSegment[] = [
      { text: 'hola mundo', start: 0, end: 4 },
      { text: 'adios', start: 4, end: 8 },
    ];

    const result = alignSegments(voiceover, transcription);
    const rebuilt = result.map((s) => s.text).join(' ');
    expect(rebuilt).toBe('hola mundo cruel adiós');
    for (const s of result) {
      expect(s.end).toBeGreaterThan(s.start);
    }
  });

  it('places unmatched words at the start before the first matched word', () => {
    const voiceover: VoiceoverSegment[] = [
      { text: 'érase una vez un reino lejano', start: 0, end: 12 },
    ];
    // Whisper se perdió el arranque "érase una vez"
    const transcription: TranscriptionSegment[] = [
      { text: 'un reino lejano', start: 6, end: 12 },
    ];

    const result = alignSegments(voiceover, transcription);
    const rebuilt = result.map((s) => s.text).join(' ');
    expect(rebuilt).toBe('érase una vez un reino lejano');
    const first = result[0];
    expect(first.text).toContain('érase');
    expect(first.start).toBeGreaterThanOrEqual(0);
    expect(first.end).toBeLessThanOrEqual(6.001);
  });
});
