// Selector de proveedores de media.
// Lee MEDIA_PROVIDERS del env (csv, default "wikimedia,local").
// Pexels es opt-in: solo se incluye si tiene PEXELS_API_KEY.

import type { MediaProvider } from './provider.js';
import { WikimediaProvider } from './wikimedia.js';
import { LocalProvider } from './local.js';
import { config } from '../../config/index.js';

export async function selectProvider(mode: 'auto' | 'local' = 'auto'): Promise<MediaProvider[]> {
  // Modo local: cero red — solo el pool de imágenes colocadas a mano,
  // da igual lo que diga MEDIA_PROVIDERS (ver AGENTS.md > Imágenes locales).
  if (mode === 'local') {
    return [new LocalProvider()];
  }

  // Default desde config.yml; override puntual con la env MEDIA_PROVIDERS (csv).
  const envProviders = (process.env.MEDIA_PROVIDERS ?? config.media.providers.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const providers: MediaProvider[] = [];

  for (const name of envProviders) {
    switch (name) {
      case 'wikimedia':
        providers.push(new WikimediaProvider());
        break;
      case 'local':
        providers.push(new LocalProvider());
        break;
      case 'pexels':
        if (process.env.PEXELS_API_KEY) {
          const { PexelsProvider } = await import('./pexels.js');
          providers.push(new PexelsProvider());
        }
        break;
    }
  }

  return providers;
}