import { describe, it, expect } from 'vitest';
import {
  deriveSearchTerms,
  buildSearchQueriesPrompt,
  parseSearchQueries,
  cosineSimilarity,
  shortlistByCosine,
  resolveMediaMode,
  findSceneOverride,
  extFromUrl,
  mimeFromExt,
  bestByScore,
  generifyQuery,
} from '../../src/pipeline/image-search.ts';

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

describe('buildSearchQueriesPrompt', () => {
  const scenes = [
    { id: 'scene-01', imagePrompt: 'Wide aerial shot of a hilltop city' },
    { id: 'scene-02', imagePrompt: 'Roman general overlooking an army camp' },
  ];

  it('incluye cada escena (id + imagePrompt) y el tema', () => {
    const prompt = buildSearchQueriesPrompt(scenes, 'Numancia');
    expect(prompt).toContain('scene-01');
    expect(prompt).toContain('Wide aerial shot of a hilltop city');
    expect(prompt).toContain('scene-02');
    expect(prompt).toContain('Numancia');
  });

  it('pide JSON y prohíbe vocabulario de cámara/estilo', () => {
    const prompt = buildSearchQueriesPrompt(scenes, 'Numancia');
    expect(prompt.toLowerCase()).toContain('json');
    // La regla clave: las queries son de SUJETO, no de encuadre.
    expect(prompt.toLowerCase()).toMatch(/aerial|cinematic|wide/);
  });
});

describe('parseSearchQueries', () => {
  const IDS = ['scene-01', 'scene-02'];

  it('parsea un mapa JSON limpio y recorta espacios', () => {
    const raw = '{"scene-01": "  Numantia hilltop city ", "scene-02": "Scipio Aemilianus siege"}';
    const { queries, errors } = parseSearchQueries(raw, IDS);
    expect(errors).toEqual([]);
    expect(queries['scene-01']).toBe('Numantia hilltop city');
    expect(queries['scene-02']).toBe('Scipio Aemilianus siege');
  });

  it('tolera bloques <think> y vallas markdown alrededor', () => {
    const raw =
      '<think>pensando…</think>\nAquí tienes:\n```json\n' +
      '{"scene-01": "Numantia", "scene-02": "Roman siege"}\n```';
    const { queries, errors } = parseSearchQueries(raw, IDS);
    expect(errors).toEqual([]);
    expect(queries['scene-01']).toBe('Numantia');
  });

  it('acepta un array de palabras y lo une con espacios', () => {
    const raw = '{"scene-01": ["Numantia", "ruins"], "scene-02": "Roman siege"}';
    const { queries, errors } = parseSearchQueries(raw, IDS);
    expect(errors).toEqual([]);
    expect(queries['scene-01']).toBe('Numantia ruins');
  });

  it('nombra la escena que falta en el error (feedback de retry)', () => {
    const raw = '{"scene-01": "Numantia"}';
    const { errors } = parseSearchQueries(raw, IDS);
    expect(errors.some((e) => e.includes('scene-02'))).toBe(true);
  });

  it('rechaza valores vacíos o no-string nombrando la escena', () => {
    const raw = '{"scene-01": "", "scene-02": 42}';
    const { errors } = parseSearchQueries(raw, IDS);
    expect(errors.some((e) => e.includes('scene-01'))).toBe(true);
    expect(errors.some((e) => e.includes('scene-02'))).toBe(true);
  });

  it('rechaza queries desbocadas (>100 chars)', () => {
    const raw = `{"scene-01": "${'palabra '.repeat(20)}", "scene-02": "ok query"}`;
    const { errors } = parseSearchQueries(raw, IDS);
    expect(errors.some((e) => e.includes('scene-01'))).toBe(true);
  });

  it('ignora claves extra que no son escenas', () => {
    const raw = '{"scene-01": "Numantia", "scene-02": "Roman siege", "nota": "extra"}';
    const { queries, errors } = parseSearchQueries(raw, IDS);
    expect(errors).toEqual([]);
    expect(Object.keys(queries).sort()).toEqual(IDS);
  });

  it('JSON inválido → errores no vacíos', () => {
    const { errors } = parseSearchQueries('esto no es JSON', IDS);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('cosineSimilarity', () => {
  it('vectores idénticos → 1, ortogonales → 0', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('es invariante a la magnitud', () => {
    expect(cosineSimilarity([1, 1], [5, 5])).toBeCloseTo(1);
  });

  it('vector cero → 0 (no NaN)', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });

  it('dimensiones distintas → error claro', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(/dimensi/i);
  });
});

describe('shortlistByCosine', () => {
  const q = [1, 0];
  const items = [
    { item: 'lejos', vector: [0, 1] },
    { item: 'cerca', vector: [1, 0] },
    { item: 'medio', vector: [1, 1] },
  ];

  it('ordena por similitud descendente y corta a topK', () => {
    expect(shortlistByCosine(q, items, 2)).toEqual(['cerca', 'medio']);
  });

  it('topK mayor que la lista → todos, ordenados', () => {
    expect(shortlistByCosine(q, items, 10)).toEqual(['cerca', 'medio', 'lejos']);
  });

  it('en empate respeta el orden de entrada (estable)', () => {
    const tied = [
      { item: 'a', vector: [1, 0] },
      { item: 'b', vector: [2, 0] },
    ];
    expect(shortlistByCosine(q, tied, 2)).toEqual(['a', 'b']);
  });

  it('lista vacía → []', () => {
    expect(shortlistByCosine(q, [], 3)).toEqual([]);
  });
});

describe('resolveMediaMode', () => {
  it('sin valor → auto', () => {
    expect(resolveMediaMode(undefined)).toBe('auto');
    expect(resolveMediaMode('')).toBe('auto');
  });

  it('acepta auto y local, con espacios y mayúsculas', () => {
    expect(resolveMediaMode('auto')).toBe('auto');
    expect(resolveMediaMode('local')).toBe('local');
    expect(resolveMediaMode(' LOCAL ')).toBe('local');
  });

  it('modo desconocido → error que nombra los válidos', () => {
    expect(() => resolveMediaMode('remoto')).toThrow(/auto.*local|local.*auto/s);
  });
});

describe('findSceneOverride', () => {
  it('encuentra la imagen colocada para la escena', () => {
    expect(findSceneOverride(['scene-01.jpg', 'scene-02.png'], 'scene-01')).toBe('scene-01.jpg');
  });

  it('con varias extensiones gana la de mayor prioridad (jpg primero)', () => {
    expect(findSceneOverride(['scene-01.png', 'scene-01.jpg'], 'scene-01')).toBe('scene-01.jpg');
  });

  it('extensión insensible a mayúsculas, devuelve el nombre real', () => {
    expect(findSceneOverride(['scene-01.PNG'], 'scene-01')).toBe('scene-01.PNG');
  });

  it('no confunde scene-01 con scene-010', () => {
    expect(findSceneOverride(['scene-010.jpg'], 'scene-01')).toBeNull();
  });

  it('ignora extensiones que no son de imagen', () => {
    expect(findSceneOverride(['scene-01.txt'], 'scene-01')).toBeNull();
  });

  it('sin ficheros → null', () => {
    expect(findSceneOverride([], 'scene-01')).toBeNull();
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

describe('generifyQuery', () => {
  it('quita nombres de marcas conocidas', () => {
    expect(generifyQuery('Antropic company logo')).toBe('company logo');
  });

  it('quita nombres de marcas en el medio', () => {
    expect(generifyQuery('Claude neural interface')).toBe('neural interface');
  });

  it('mantiene el query original si todo se quita', () => {
    // "Anthropic" alone → can't generify → returns original
    expect(generifyQuery('Anthropic')).toBe('Anthropic');
  });

  it('no toca queries genéricas', () => {
    expect(generifyQuery('server room data center')).toBe('server room data center');
  });

  it('maneja múltiples marcas', () => {
    expect(generifyQuery('OpenAI Google headquarters')).toBe('headquarters');
  });
});
