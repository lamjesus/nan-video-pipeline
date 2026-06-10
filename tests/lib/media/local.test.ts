import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalProvider } from '../../../src/lib/media/local.ts';

describe('LocalProvider', () => {
  let tmpDir: string;
  let provider: LocalProvider;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `nan-test-local-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
    provider = new LocalProvider(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('tiene name = "local"', () => {
    expect(provider.name).toBe('local');
  });

  it('devuelve candidatas del pool local', async () => {
    await writeFile(join(tmpDir, 'test1.jpg'), 'fake-image-data');
    await writeFile(join(tmpDir, 'test2.png'), 'fake-image-data');

    const results = await provider.search('test', 5);
    expect(results).toHaveLength(2);
    expect(results[0].url).toMatch(/^file:\/\//);
    expect(results[0].source).toBe('local');
  });

  it('respeta el límite', async () => {
    await writeFile(join(tmpDir, 'a.jpg'), 'data');
    await writeFile(join(tmpDir, 'b.jpg'), 'data');
    await writeFile(join(tmpDir, 'c.jpg'), 'data');

    const results = await provider.search('', 2);
    expect(results).toHaveLength(2);
  });

  it('devuelve array vacío si el pool está vacío', async () => {
    const results = await provider.search('anything', 5);
    expect(results).toEqual([]);
  });

  it('solo incluye archivos de imagen', async () => {
    await writeFile(join(tmpDir, 'img.jpg'), 'data');
    await writeFile(join(tmpDir, 'notes.txt'), 'not an image');
    await writeFile(join(tmpDir, 'script.js'), 'not an image');

    const results = await provider.search('', 5);
    expect(results).toHaveLength(1);
    expect(results[0].url).toContain('img.jpg');
  });
});