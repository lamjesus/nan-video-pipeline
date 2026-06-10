// Proveedor opt-in de Freepik. Requiere FREEPIK_API_KEY en env.
// Si la key falta, search() devuelve [] y avisa (no rompe).
//
// ⚠️ Licencia: No todo el contenido de Freepik es libre para uso comercial.
// Cada Candidate incluye license para que el llamante verifique.
// Ver: https://www.freepik.com/license

import type { Candidate, MediaProvider } from './provider.js';

const FREEPIK_API = 'https://api.freepik.com/v1/resources';

export class FreepikProvider implements MediaProvider {
  name = 'freepik';
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.FREEPIK_API_KEY ?? '';
  }

  async search(query: string, limit = 5): Promise<Candidate[]> {
    if (!query.trim()) return [];
    if (!this.apiKey) {
      console.warn('[freepik] No FREEPIK_API_KEY — saltando');
      return [];
    }

    const url = new URL(FREEPIK_API);
    url.searchParams.set('term', query);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), {
      headers: {
        'X-Freepik-API-Key': this.apiKey,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Freepik API error: HTTP ${res.status}`);
    }

    const data = await res.json() as {
      data?: Array<{
        image: { source?: { url?: string } };
        title?: string;
      }>;
    };

    return (data.data ?? []).map((r) => ({
      url: r.image?.source?.url ?? '',
      title: r.title ?? undefined,
      license: 'Freepik — verificar licencia comercial',
      source: 'freepik',
    })).filter((c) => c.url);
  }
}