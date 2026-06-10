import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WikimediaProvider } from '../../../src/lib/media/wikimedia.ts';

describe('WikimediaProvider', () => {
  let provider: WikimediaProvider;

  beforeEach(() => {
    provider = new WikimediaProvider();
  });

  it('tiene name = "wikimedia"', () => {
    expect(provider.name).toBe('wikimedia');
  });

  it('devuelve candidatas para una búsqueda', async () => {
    const results = await provider.search('Vesuvius volcano', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);
    for (const r of results) {
      expect(r.url).toMatch(/^https?:\/\//);
      expect(r.source).toBe('wikimedia');
      expect(r.license).toBeDefined();
    }
  });

  it('respeta el límite de resultados', async () => {
    const results = await provider.search('mountain', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('devuelve array vacío para query vacía', async () => {
    const results = await provider.search('');
    expect(results).toEqual([]);
  });
});