import { describe, it, expect } from 'vitest';
import {
  alignSegments,
  toSRT,
  parseSRT,
} from '../../src/pipeline/subtitle-util.ts';
import type {
  VoiceoverSegment,
  TranscriptionSegment,
} from '../../src/pipeline/subtitle-util.ts';

describe('alignSegments', () => {
  it('happy path: aligns canonical text onto Whisper timing', () => {
    const voiceover: VoiceoverSegment[] = [
      { text: 'Hola mundo cruel', start: 0, end: 5 },
      { text: 'Esto es una prueba', start: 5, end: 10 },
    ];
    const transcription: TranscriptionSegment[] = [
      { text: 'Hola mundo', start: 0.5, end: 2.0 },
      { text: 'cruel esto es', start: 2.5, end: 6.0 },
      { text: 'una prueba', start: 6.5, end: 8.0 },
    ];

    const result = alignSegments(voiceover, transcription);

    // Should produce aligned segments with canonical text and Whisper timing
    expect(result.length).toBeGreaterThan(0);
    // Canonical text should be used, not raw Whisper text
    const allText = result.map((s) => s.text).join(' ');
    expect(allText).toContain('Hola mundo cruel');
    expect(allText).toContain('Esto es una prueba');
    // Timestamps should be monotonically increasing
    for (let i = 1; i < result.length; i++) {
      expect(result[i].start).toBeGreaterThanOrEqual(result[i - 1].start);
    }
  });

  it('punctuation normalization: LCS matches despite punctuation differences', () => {
    const voiceover: VoiceoverSegment[] = [
      { text: 'Hello, world!', start: 0, end: 5 },
    ];
    const transcription: TranscriptionSegment[] = [
      { text: 'hello world', start: 1.0, end: 3.0 },
    ];

    const result = alignSegments(voiceover, transcription);

    expect(result.length).toBeGreaterThan(0);
    // Canonical text wins (with punctuation), not raw transcription
    const allText = result.map((s) => s.text).join(' ');
    expect(allText).toContain('Hello, world!');
  });

  it('fallback: distributes across scene time ranges when no transcription', () => {
    const voiceover: VoiceoverSegment[] = [
      { text: 'Primera escena con texto', start: 0, end: 5 },
      { text: 'Segunda escena tambien', start: 5, end: 10 },
    ];
    const transcription: TranscriptionSegment[] = [];

    const result = alignSegments(voiceover, transcription);

    // Should produce segments distributed across scene time ranges
    expect(result.length).toBeGreaterThan(0);
    // All text should come from voiceover
    const allText = result.map((s) => s.text).join(' ');
    expect(allText).toContain('Primera escena con texto');
    expect(allText).toContain('Segunda escena tambien');
    // Timestamps should be within scene boundaries
    expect(result[0].start).toBeGreaterThanOrEqual(0);
    expect(result[result.length - 1].end).toBeLessThanOrEqual(10);
  });

  it('empty inputs: returns empty array', () => {
    const result = alignSegments([], []);
    expect(result).toEqual([]);
  });
});

describe('toSRT', () => {
  it('produces valid SRT format with index, timestamps, text, blank line', () => {
    const segments = [
      { index: 1, start: 1.5, end: 3.0, text: 'First subtitle' },
      { index: 2, start: 3.5, end: 5.2, text: 'Second subtitle' },
    ];

    const srt = toSRT(segments);

    // Should start with index 1
    expect(srt).toMatch(/^1\r?\n/);
    // Should contain HH:MM:SS,mmm --> HH:MM:SS,mmm
    expect(srt).toContain('00:00:01,500 --> 00:00:03,000');
    expect(srt).toContain('00:00:03,500 --> 00:00:05,200');
    // Should contain text
    expect(srt).toContain('First subtitle');
    expect(srt).toContain('Second subtitle');
    // Blocks should be separated by blank lines
    const blocks = srt.trim().split(/\r?\n\r?\n/);
    expect(blocks.length).toBe(2);
  });
});

describe('parseSRT', () => {
  it('round-trip: parse SRT string back into segments', () => {
    const original = [
      { index: 1, start: 1.5, end: 3.0, text: 'First subtitle' },
      { index: 2, start: 3.5, end: 5.2, text: 'Second subtitle' },
    ];

    const srt = toSRT(original);
    const parsed = parseSRT(srt);
    const regenerated = toSRT(parsed);

    // Round-trip should produce identical SRT
    expect(regenerated).toBe(srt);
  });

  it('timestamp formatting: start=1.5, end=3.0 formats correctly', () => {
    const segments = [
      { index: 1, start: 1.5, end: 3.0, text: 'Test' },
    ];

    const srt = toSRT(segments);

    expect(srt).toContain('00:00:01,500 --> 00:00:03,000');
  });
});
