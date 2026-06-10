// Selector de proveedores de media.
// Lee MEDIA_PROVIDERS del env (csv, default "wikimedia,local").
// Los providers opt-in (pexels, freepik) solo se incluyen si tienen API key.

import type { MediaProvider } from './provider.js';
import { WikimediaProvider } from './wikimedia.js';
import { LocalProvider } from './local.js';

export async function selectProvider(): Promise<MediaProvider[]> {
  const envProviders = (process.env.MEDIA_PROVIDERS ?? 'wikimedia,local')
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
      case 'freepik':
        if (process.env.FREEPIK_API_KEY) {
          const { FreepikProvider } = await import('./freepik.js');
          providers.push(new FreepikProvider());
        }
        break;
    }
  }

  return providers;
}