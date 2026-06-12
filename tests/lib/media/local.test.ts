import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalProvider, filenameToText } from '../../../src/lib/media/local.ts';

describe('filenameToText', () => {
  it('quita la extensión y convierte separadores en espacios', () => {
    expect(filenameToText('roman_siege-walls.v2.png')).toBe('roman siege walls v2');
  });

  it('conserva nombres con espacios', () => {
    expect(filenameToText('IMG 1234.JPG')).toBe('IMG 1234');
  });

  it('funciona sin extensión', () => {
    expect(filenameToText('foo_bar')).toBe('foo bar');
  });
});

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

  it('el título es el nombre normalizado (para el matching por texto)', async () => {
    await writeFile(join(tmpDir, 'numancia_hilltop-fog.jpg'), 'data');

    const results = await provider.search('', 5);
    expect(results[0].title).toBe('numancia hilltop fog');
  });
});