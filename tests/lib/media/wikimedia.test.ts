import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WikimediaProvider } from '../../../src/lib/media/wikimedia.ts';

// fetch mockeado: los tests no tocan la red (la API real es flaky y sin ella
// el matiz que importa — el mapeo y los parámetros — no se testeaba).
const WIKI_RESPONSE = {
  query: {
    pages: {
      '1': {
        pageid: 1,
        title: 'Mount Vesuvius',
        thumbnail: { source: 'https://upload.wikimedia.org/vesuvius.jpg' },
        fullurl: 'https://en.wikipedia.org/wiki/Mount_Vesuvius',
      },
      '2': {
        pageid: 2,
        title: 'Pompeii',
        thumbnail: { source: 'https://upload.wikimedia.org/pompeii.jpg' },
      },
      '3': { pageid: 3, title: 'Sin thumbnail' }, // se filtra: no hay imagen
    },
  },
};

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('WikimediaProvider', () => {
  let provider: WikimediaProvider;

  beforeEach(() => {
    provider = new WikimediaProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tiene name = "wikimedia"', () => {
    expect(provider.name).toBe('wikimedia');
  });

  it('mapea pages → candidatas y filtra las que no tienen thumbnail', async () => {
    mockFetch(WIKI_RESPONSE);
    const results = await provider.search('Vesuvius volcano', 3);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.url).toMatch(/^https?:\/\//);
      expect(r.source).toBe('wikimedia');
      expect(r.license).toBeDefined();
    }
    expect(results.map((r) => r.title)).toEqual(['Mount Vesuvius', 'Pompeii']);
  });

  it('pasa query, límite y User-Agent a la API', async () => {
    const fetchMock = mockFetch(WIKI_RESPONSE);
    await provider.search('mountain', 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('gsrsearch=mountain');
    expect(url).toContain('gsrlimit=1');
    const headers = init.headers as Record<string, string>;
    expect(headers['User-Agent']).toContain('nan-video-pipeline');
  });

  it('devuelve array vacío para query vacía, sin llamar a la red', async () => {
    const fetchMock = mockFetch(WIKI_RESPONSE);
    const results = await provider.search('');
    expect(results).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('devuelve array vacío si la respuesta no trae pages', async () => {
    mockFetch({});
    const results = await provider.search('nada');
    expect(results).toEqual([]);
  });

  it('lanza si la API responde error HTTP', async () => {
    mockFetch({}, false, 503);
    await expect(provider.search('mountain')).rejects.toThrow('HTTP 503');
  });
});
