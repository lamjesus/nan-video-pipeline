// Proveedor opt-in de Pexels. Requiere PEXELS_API_KEY en env.
// Si la key falta, search() devuelve [] y avisa (no rompe).
//
// ⚠️ Licencia: Pexels es mayoritariamente free-to-use, pero verificar
// licencia específica de cada imagen en producción.

import type { Candidate, MediaProvider } from './provider.js';

const PEXELS_API = 'https://api.pexels.com/v1/search';

export class PexelsProvider implements MediaProvider {
  name = 'pexels';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.PEXELS_API_KEY ?? '';
  }

  async search(query: string, limit = 5): Promise<Candidate[]> {
    if (!query.trim()) return [];
    if (!this.apiKey) {
      console.warn('[pexels] No PEXELS_API_KEY — saltando');
      return [];
    }

    const url = new URL(PEXELS_API);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', String(limit));

    const res = await fetch(url.toString(), {
      headers: { Authorization: this.apiKey },
    });

    if (!res.ok) {
      throw new Error(`Pexels API error: HTTP ${res.status}`);
    }

    const data = await res.json() as {
      photos?: Array<{
        src: { medium: string };
        alt?: string;
        photographer?: string;
      }>;
    };

    return (data.photos ?? []).map((p) => ({
      url: p.src.medium,
      title: p.alt ?? undefined,
      license: 'Pexels free-to-use',
      source: 'pexels',
    }));
  }
}