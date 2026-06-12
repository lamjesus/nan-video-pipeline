import { describe, it, expect } from 'vitest';
import { parse, stringify } from 'yaml';
import {
  extractJson,
  validateStoryboard,
  REQUIRED_SCENES,
} from '../../src/pipeline/storyboard-validation.ts';
import type { Storyboard, Scene } from '../../src/lib/types.ts';

// --- Fixtures ---------------------------------------------------------------

function makeScene(i: number, overrides: Partial<Scene> = {}): Scene {
  return {
    id: `scene-${String(i + 1).padStart(2, '0')}`,
    block: i === 0 ? 'GANCHO' : 'DESARROLLO',
    start: i * 6,
    end: (i + 1) * 6,
    voiceover: `Narración de la escena ${i + 1}.`,
    onScreenText: [],
    imagePrompt: `wide shot of ancient city, scene ${i + 1}`,
    motion: 'zoom-in lento',
    ...overrides,
  };
}

function makeStoryboard(overrides: Partial<Storyboard> = {}): Storyboard {
  return {
    channel: 'Casos Históricos',
    caseNumber: 1,
    title: 'La erupción del Vesubio',
    totalDuration: 60,
    artDirection: {
      medium: 'ilustración estilo novela gráfica',
      lineWork: 'trazo grueso',
      palette: 'ocres y grises',
      lighting: 'contraluz dramático',
      texture: 'grano de carboncillo',
      mood: 'tensión creciente',
      composition: 'planos amplios',
      humanTreatment: 'siluetas, sin rostros detallados',
      constraints: 'sin texto en imagen, sin gore',
    },
    scenes: Array.from({ length: REQUIRED_SCENES }, (_, i) => makeScene(i)),
    ...overrides,
  };
}

// --- extractJson ------------------------------------------------------------

describe('extractJson', () => {
  it('returns plain JSON untouched', () => {
    const raw = '{"title": "x"}';
    expect(extractJson(raw)).toBe('{"title": "x"}');
  });

  it('strips ```json code fences', () => {
    const raw = '```json\n{"title": "x"}\n```';
    expect(JSON.parse(extractJson(raw))).toEqual({ title: 'x' });
  });

  it('strips bare ``` code fences', () => {
    const raw = '```\n{"title": "x"}\n```';
    expect(JSON.parse(extractJson(raw))).toEqual({ title: 'x' });
  });

  it('ignores prose around the JSON object', () => {
    const raw = 'Aquí tienes el guion:\n{"title": "x"}\nEspero que te sirva.';
    expect(JSON.parse(extractJson(raw))).toEqual({ title: 'x' });
  });

  it('strips <think> reasoning blocks before the JSON', () => {
    const raw =
      '<think>\nEl usuario quiere 10 escenas... {"borrador": true}\n</think>\n{"title": "x"}';
    expect(JSON.parse(extractJson(raw))).toEqual({ title: 'x' });
  });

  it('returns trimmed input when no JSON object is present', () => {
    expect(extractJson('  no hay json aquí  ')).toBe('no hay json aquí');
  });
});

// --- validateStoryboard -----------------------------------------------------

describe('validateStoryboard', () => {
  it('accepts a complete storyboard', () => {
    const result = validateStoryboard(makeStoryboard());
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects non-object input', () => {
    expect(validateStoryboard(null).valid).toBe(false);
    expect(validateStoryboard('texto').valid).toBe(false);
    expect(validateStoryboard([]).valid).toBe(false);
  });

  it('rejects missing or empty top-level fields', () => {
    const result = validateStoryboard(makeStoryboard({ title: '' }));
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('title');
  });

  it('rejects wrong scene count when a count is required (modo generación)', () => {
    const sb = makeStoryboard();
    sb.scenes = sb.scenes.slice(0, 3);
    const result = validateStoryboard(sb, { sceneCount: REQUIRED_SCENES });
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain(`${REQUIRED_SCENES}`);
  });

  it('honours a custom scene count (casos golden con recuentos distintos)', () => {
    const sb = makeStoryboard();
    sb.scenes = sb.scenes.slice(0, 9);
    expect(validateStoryboard(sb, { sceneCount: 9 }).valid).toBe(true);
    expect(validateStoryboard(sb, { sceneCount: 12 }).valid).toBe(false);
  });

  it('rejects a scene with missing voiceover, with the scene index in the error', () => {
    const sb = makeStoryboard();
    sb.scenes[3] = makeScene(3, { voiceover: '' });
    const result = validateStoryboard(sb);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('scenes[3]');
    expect(result.errors.join('\n')).toContain('voiceover');
  });

  it('rejects a scene whose end is not after its start', () => {
    const sb = makeStoryboard();
    sb.scenes[5] = makeScene(5, { start: 30, end: 30 });
    const result = validateStoryboard(sb);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('scenes[5]');
  });

  it('rejects onScreenText that is not an array of strings', () => {
    const sb = makeStoryboard();
    // Forzamos un valor inválido como lo haría un JSON del modelo.
    (sb.scenes[0] as unknown as Record<string, unknown>).onScreenText = 'texto suelto';
    const result = validateStoryboard(sb);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('onScreenText');
  });

  it('rejects an incomplete artDirection, naming the missing field', () => {
    const sb = makeStoryboard();
    delete (sb.artDirection as unknown as Record<string, unknown>).palette;
    const result = validateStoryboard(sb);
    expect(result.valid).toBe(false);
    expect(result.errors.join('\n')).toContain('artDirection.palette');
  });

  it('accepts any scene count by default (modo cargador)', () => {
    const sb = makeStoryboard();
    sb.scenes = sb.scenes.slice(0, 9); // caso-ejemplo tiene 9 escenas
    expect(validateStoryboard(sb).valid).toBe(true);
    expect(validateStoryboard(sb, { sceneCount: REQUIRED_SCENES }).valid).toBe(false);
  });

  it('still rejects empty scenes in loader mode', () => {
    const sb = makeStoryboard({ scenes: [] });
    expect(validateStoryboard(sb).valid).toBe(false);
  });

  it('survives a YAML round-trip (formato de content/<slug>.yml)', () => {
    const sb = makeStoryboard();
    const round = parse(stringify(sb)) as unknown;
    expect(validateStoryboard(round, { sceneCount: REQUIRED_SCENES }).valid).toBe(true);
    expect(round).toEqual(sb);
  });
});
