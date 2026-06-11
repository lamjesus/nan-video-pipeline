import { describe, it, expect } from 'vitest';
import { chunkSegments } from '../../src/pipeline/subtitle-util.ts';
import type { AlignedSegment } from '../../src/pipeline/subtitle-util.ts';

const LONG_TEXT =
  'En el año 79, una ciudad romana entera desapareció bajo la ceniza ' +
  'en menos de un día. Sus habitantes no tuvieron a dónde huir.';

describe('chunkSegments', () => {
  it('splits a long segment into several short blocks', () => {
    const segments: AlignedSegment[] = [{ index: 1, start: 0, end: 10, text: LONG_TEXT }];
    const chunked = chunkSegments(segments, { maxChars: 42 });
    expect(chunked.length).toBeGreaterThan(2);
    for (const c of chunked) {
      expect(c.text.length).toBeLessThanOrEqual(42);
    }
  });

  it('never breaks words in half', () => {
    const segments: AlignedSegment[] = [{ index: 1, start: 0, end: 10, text: LONG_TEXT }];
    const chunked = chunkSegments(segments, { maxChars: 42 });
    const rebuilt = chunked.map((c) => c.text).join(' ');
    expect(rebuilt).toBe(LONG_TEXT);
  });

  it('preserves the segment time span with contiguous monotonic chunks', () => {
    const segments: AlignedSegment[] = [{ index: 1, start: 2, end: 12, text: LONG_TEXT }];
    const chunked = chunkSegments(segments, { maxChars: 42 });
    expect(chunked[0].start).toBe(2);
    expect(chunked[chunked.length - 1].end).toBeCloseTo(12, 6);
    for (let i = 1; i < chunked.length; i++) {
      expect(chunked[i].start).toBeCloseTo(chunked[i - 1].end, 6);
      expect(chunked[i].end).toBeGreaterThan(chunked[i].start);
    }
  });

  it('leaves short segments as a single block', () => {
    const segments: AlignedSegment[] = [{ index: 1, start: 0, end: 3, text: 'Hola mundo.' }];
    const chunked = chunkSegments(segments);
    expect(chunked).toHaveLength(1);
    expect(chunked[0]).toEqual({ index: 1, start: 0, end: 3, text: 'Hola mundo.' });
  });

  it('reindexes sequentially across segments', () => {
    const segments: AlignedSegment[] = [
      { index: 7, start: 0, end: 10, text: LONG_TEXT },
      { index: 9, start: 10, end: 13, text: 'Y esto es el final.' },
    ];
    const chunked = chunkSegments(segments, { maxChars: 42 });
    chunked.forEach((c, i) => expect(c.index).toBe(i + 1));
  });

  it('returns empty for empty input or blank text', () => {
    expect(chunkSegments([])).toEqual([]);
    expect(chunkSegments([{ index: 1, start: 0, end: 1, text: '   ' }])).toEqual([]);
  });
});
