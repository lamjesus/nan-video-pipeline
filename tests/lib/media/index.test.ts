import { describe, it, expect, beforeEach } from 'vitest';
import { selectProvider } from '../../../src/lib/media/index.ts';

describe('selectProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.MEDIA_PROVIDERS;
    delete process.env.PEXELS_API_KEY;
  });

  it('usa wikimedia,local por defecto', async () => {
    const providers = await selectProvider();
    const names = providers.map((p) => p.name);
    expect(names).toContain('wikimedia');
    expect(names).toContain('local');
  });

  it('respeta MEDIA_PROVIDERS env', async () => {
    process.env.MEDIA_PROVIDERS = 'local';
    const providers = await selectProvider();
    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe('local');
  });

  it('incluye pexels si hay PEXELS_API_KEY', async () => {
    process.env.MEDIA_PROVIDERS = 'wikimedia,pexels';
    process.env.PEXELS_API_KEY = 'test-key';
    const providers = await selectProvider();
    const names = providers.map((p) => p.name);
    expect(names).toContain('pexels');
  });

  it('salta pexels si no hay key', async () => {
    process.env.MEDIA_PROVIDERS = 'wikimedia,pexels';
    const providers = await selectProvider();
    const names = providers.map((p) => p.name);
    expect(names).not.toContain('pexels');
  });
});