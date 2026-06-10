// Proveedor de imágenes de Wikimedia Commons (dominio público).
// No requiere API key. Usa la API pública de Wikimedia.
//
// Endpoint: https://en.wikipedia.org/w/api.php
//   action=query&generator=search&gsrsearch=<query>&prop=imageinfo
//   &iiprop=url|extmetadata&format=json&gsrlimit=<limit>

import type { Candidate, MediaProvider } from './provider.js';

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

export class WikimediaProvider implements MediaProvider {
  name = 'wikimedia';

  async search(query: string, limit = 5): Promise<Candidate[]> {
    if (!query.trim()) return [];

    const url = new URL(WIKI_API);
    url.searchParams.set('action', 'query');
    url.searchParams.set('generator', 'search');
    url.searchParams.set('gsrsearch', query);
    url.searchParams.set('gsrlimit', String(limit));
    url.searchParams.set('prop', 'pageimages|info');
    url.searchParams.set('piprop', 'thumbnail');
    url.searchParams.set('pithumbsize', '512');
    url.searchParams.set('inprop', 'url');
    url.searchParams.set('format', 'json');
    url.searchParams.set('origin', '*');

    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Wikimedia API error: HTTP ${res.status}`);
    }

    const data = await res.json() as {
      query?: {
        pages?: Record<string, {
          pageid: number;
          title: string;
          thumbnail?: { source: string };
          fullurl?: string;
        }>;
      };
    };

    const pages = data.query?.pages;
    if (!pages) return [];

    return Object.values(pages)
      .filter((p) => p.thumbnail?.source)
      .map((p) => ({
        url: p.thumbnail!.source,
        title: p.title,
        license: 'CC-BY-SA / dominio público',
        source: 'wikimedia',
      }));
  }
}