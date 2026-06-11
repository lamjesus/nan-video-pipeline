import { describe, it, expect } from 'vitest';
import { parseSrt, formatTimestamp, type SrtEntry } from '../../src/render/srt.ts';

// --- parseSrt ---

describe('parseSrt', () => {
  const sampleSrt = `1
00:00:01,000 --> 00:00:04,500
En el año 79, una ciudad romana entera desapareció.

2
00:00:05,000 --> 00:00:08,200
Sus habitantes no tuvieron a dónde huir.

3
00:00:09,000 --> 00:00:12,000
Pompeya quedó enterrada bajo ceniza.`;

  it('parses a valid 3-entry SRT correctly', () => {
    const entries = parseSrt(sampleSrt);
    expect(entries).toHaveLength(3);
  });

  it('entry index is correct', () => {
    const entries = parseSrt(sampleSrt);
    expect(entries[0].index).toBe(1);
    expect(entries[1].index).toBe(2);
    expect(entries[2].index).toBe(3);
  });

  it('timestamps are converted to seconds', () => {
    const entries = parseSrt(sampleSrt);
    expect(entries[0].start).toBeCloseTo(1.0);
    expect(entries[0].end).toBeCloseTo(4.5);
    expect(entries[1].start).toBeCloseTo(5.0);
    expect(entries[1].end).toBeCloseTo(8.2);
  });

  it('text content is preserved', () => {
    const entries = parseSrt(sampleSrt);
    expect(entries[0].text).toBe('En el año 79, una ciudad romana entera desapareció.');
    expect(entries[2].text).toBe('Pompeya quedó enterrada bajo ceniza.');
  });

  it('returns [] for empty string', () => {
    expect(parseSrt('')).toEqual([]);
  });

  it('returns [] for whitespace-only string', () => {
    expect(parseSrt('   ')).toEqual([]);
  });

  it('returns [] for malformed SRT', () => {
    expect(parseSrt('not an srt file at all')).toEqual([]);
  });

  it('handles multiline text within an entry', () => {
    const multiLine = `1
00:00:01,000 --> 00:00:04,500
First line
Second line`;
    const entries = parseSrt(multiLine);
    expect(entries).toHaveLength(1);
    expect(entries[0].text).toBe('First line\nSecond line');
  });
});

// --- formatTimestamp ---

describe('formatTimestamp', () => {
  it('formats zero as 00:00:00,000', () => {
    expect(formatTimestamp(0)).toBe('00:00:00,000');
  });

  it('formats 65.5 seconds as 00:01:05,500', () => {
    expect(formatTimestamp(65.5)).toBe('00:01:05,500');
  });

  it('formats 3661.123 as 01:01:01,123', () => {
    expect(formatTimestamp(3661.123)).toBe('01:01:01,123');
  });

  it('round-trips: formatTimestamp(parseSrt(...)) preserves values', () => {
    const srt = `1
00:01:05,500 --> 00:02:10,250
Test entry`;
    const entries = parseSrt(srt);
    expect(formatTimestamp(entries[0].start)).toBe('00:01:05,500');
    expect(formatTimestamp(entries[0].end)).toBe('00:02:10,250');
  });
});
