import { describe, it, expect } from 'vitest';
import {
  deriveSearchTerms,
  extFromUrl,
  mimeFromExt,
  bestByScore,
} from '../../src/pipeline/vision-util.ts';

describe('deriveSearchTerms', () => {
  it('quita stopwords y palabras cortas', () => {
    const terms = deriveSearchTerms('The eruption of the Vesuvius volcano');
    expect(terms).toEqual(['eruption', 'vesuvius', 'volcano']);
  });

  it('devuelve como máximo 3 términos', () => {
    const terms = deriveSearchTerms('roman soldier marching ancient stone road');
    expect(terms.length).toBeLessThanOrEqual(3);
  });

  it('elimina duplicados', () => {
    const terms = deriveSearchTerms('volcano volcano lava lava ash');
    expect(terms).toEqual(['volcano', 'lava', 'ash']);
  });

  it('devuelve [] si todo son stopwords o ruido', () => {
    expect(deriveSearchTerms('the of in a to')).toEqual([]);
    expect(deriveSearchTerms('   ')).toEqual([]);
  });
});

describe('extFromUrl', () => {
  it('extrae la extensión y la pasa a minúsculas', () => {
    expect(extFromUrl('https://x/img.PNG')).toBe('png');
    expect(extFromUrl('https://x/photo.jpeg')).toBe('jpeg');
  });

  it('ignora la query string', () => {
    expect(extFromUrl('https://x/a.webp?width=512')).toBe('webp');
  });

  it('usa jpg por defecto si no hay extensión reconocible', () => {
    expect(extFromUrl('https://x/sin-extension')).toBe('jpg');
  });

  it('coge la última extensión en thumbnails de Wikimedia', () => {
    expect(extFromUrl('https://up.wikimedia.org/thumb/Foo.jpg/512px-Foo.jpg')).toBe('jpg');
  });
});

describe('mimeFromExt', () => {
  it('mapea las extensiones conocidas', () => {
    expect(mimeFromExt('png')).toBe('image/png');
    expect(mimeFromExt('gif')).toBe('image/gif');
    expect(mimeFromExt('webp')).toBe('image/webp');
    expect(mimeFromExt('svg')).toBe('image/svg+xml');
  });

  it('es insensible a mayúsculas', () => {
    expect(mimeFromExt('PNG')).toBe('image/png');
  });

  it('cae a image/jpeg para jpg y desconocidas', () => {
    expect(mimeFromExt('jpg')).toBe('image/jpeg');
    expect(mimeFromExt('jpeg')).toBe('image/jpeg');
    expect(mimeFromExt('xyz')).toBe('image/jpeg');
  });
});

describe('bestByScore', () => {
  it('devuelve null para lista vacía', () => {
    expect(bestByScore([])).toBeNull();
  });

  it('devuelve el item de mayor score', () => {
    const best = bestByScore([
      { item: 'a', score: 3 },
      { item: 'b', score: 9 },
      { item: 'c', score: 5 },
    ]);
    expect(best).toBe('b');
  });

  it('en empate gana el primero (orden estable)', () => {
    const best = bestByScore([
      { item: 'a', score: 7 },
      { item: 'b', score: 7 },
    ]);
    expect(best).toBe('a');
  });
});
