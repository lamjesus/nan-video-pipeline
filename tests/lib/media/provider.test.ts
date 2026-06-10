import { describe, it, expect } from 'vitest';
import type { Candidate, MediaProvider } from '../../../src/lib/media/provider.ts';

describe('MediaProvider interfaces', () => {
  it('Candidate tiene los campos requeridos', () => {
    const c: Candidate = {
      url: 'https://example.com/img.jpg',
      title: 'Test image',
      license: 'CC0',
      source: 'wikimedia',
    };
    expect(c.url).toBe('https://example.com/img.jpg');
    expect(c.title).toBe('Test image');
    expect(c.license).toBe('CC0');
    expect(c.source).toBe('wikimedia');
  });

  it('Candidate permite campos opcionales', () => {
    const c: Candidate = {
      url: 'https://example.com/img.jpg',
      source: 'local',
    };
    expect(c.url).toBeDefined();
    expect(c.title).toBeUndefined();
    expect(c.license).toBeUndefined();
  });

  it('MediaProvider tiene name y search', () => {
    const provider: MediaProvider = {
      name: 'test',
      search: async () => [],
    };
    expect(provider.name).toBe('test');
    expect(typeof provider.search).toBe('function');
  });
});