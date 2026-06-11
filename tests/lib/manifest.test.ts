import { describe, it, expect } from 'vitest';
import {
  buildManifest,
  validateManifest,
  discoverImages,
  type Manifest,
} from '../../src/lib/manifest.ts';
import type { Storyboard } from '../../src/lib/types.ts';

// --- Test fixtures ---

function makeStoryboard(overrides?: Partial<Storyboard>): Storyboard {
  return {
    channel: 'test',
    caseNumber: 1,
    title: 'Test Video',
    totalDuration: 30,
    artDirection: {
      medium: 'illustration',
      lineWork: 'bold',
      palette: 'dark',
      lighting: 'dramatic',
      texture: 'grain',
      mood: 'tense',
      composition: 'centered',
      humanTreatment: 'realistic',
      constraints: 'no text',
    },
    scenes: [
      {
        id: 'scene-01',
        block: 'GANCHO',
        start: 0,
        end: 5,
        voiceover: 'Bienvenidos',
        onScreenText: [],
        imagePrompt: 'A dark illustration',
        motion: 'slow zoom',
      },
      {
        id: 'scene-02',
        block: 'DESARROLLO',
        start: 5,
        end: 12,
        voiceover: 'El故事 continua',
        onScreenText: [],
        imagePrompt: 'Mountain landscape',
        motion: 'pan right',
      },
    ],
    ...overrides,
  };
}

describe('buildManifest', () => {
  it('produces a valid manifest with all fields', () => {
    const sb = makeStoryboard();
    const imageMap = new Map<string, string | null>([
      ['scene-01', '/abs/images/scene-01.jpg'],
      ['scene-02', '/abs/images/scene-02.png'],
    ]);

    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      62.4,
      '/abs/output/test-case.srt',
      imageMap,
    );

    expect(manifest.slug).toBe('test-case');
    expect(manifest.title).toBe('Test Video');
    expect(manifest.audio.path).toBe('/abs/audio/test-case.mp3');
    expect(manifest.audio.duration).toBe(62.4);
    expect(manifest.subtitle.path).toBe('/abs/output/test-case.srt');
    expect(manifest.scenes).toHaveLength(2);
    expect(manifest.scenes[0].id).toBe('scene-01');
    expect(manifest.scenes[0].image).toBe('/abs/images/scene-01.jpg');
    expect(manifest.scenes[0].block).toBe('GANCHO');
    expect(manifest.scenes[0].start).toBe(0);
    expect(manifest.scenes[0].end).toBe(5);
    expect(manifest.scenes[0].voiceover).toBe('Bienvenidos');
    expect(manifest.scenes[0].onScreenText).toEqual([]);
    expect(manifest.scenes[0].imagePrompt).toBe('A dark illustration');
    expect(manifest.scenes[0].motion).toBe('slow zoom');
    expect(manifest.scenes[1].image).toBe('/abs/images/scene-02.png');
    expect(manifest.generatedAt).toBeDefined();
  });

  it('sets image to null when not found in imageMap', () => {
    const sb = makeStoryboard();
    const imageMap = new Map<string, string | null>([
      ['scene-01', '/abs/images/scene-01.jpg'],
      ['scene-02', null],
    ]);

    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      null,
      null,
      imageMap,
    );

    expect(manifest.scenes[0].image).toBe('/abs/images/scene-01.jpg');
    expect(manifest.scenes[1].image).toBeNull();
  });

  it('sets subtitle.path to null when subtitlePath is null', () => {
    const sb = makeStoryboard();
    const imageMap = new Map<string, string | null>([
      ['scene-01', '/abs/images/scene-01.jpg'],
      ['scene-02', '/abs/images/scene-02.jpg'],
    ]);

    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      30.0,
      null,
      imageMap,
    );

    expect(manifest.subtitle.path).toBeNull();
  });

  it('sets audio.duration to null when ffprobe unavailable', () => {
    const sb = makeStoryboard();
    const imageMap = new Map<string, string | null>([
      ['scene-01', '/abs/images/scene-01.jpg'],
      ['scene-02', '/abs/images/scene-02.jpg'],
    ]);

    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      null,
      '/abs/output/test-case.srt',
      imageMap,
    );

    expect(manifest.audio.duration).toBeNull();
  });
});

describe('validateManifest', () => {
  it('returns valid for correctly ordered scenes', () => {
    const sb = makeStoryboard();
    const imageMap = new Map<string, string | null>([
      ['scene-01', '/abs/images/scene-01.jpg'],
      ['scene-02', '/abs/images/scene-02.jpg'],
    ]);
    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      30,
      '/abs/output/test-case.srt',
      imageMap,
    );

    const result = validateManifest(manifest);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects empty scenes array', () => {
    const sb = makeStoryboard({ scenes: [] });
    const imageMap = new Map<string, string | null>();
    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      30,
      null,
      imageMap,
    );

    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('scenes'))).toBe(true);
  });

  it('rejects scene where start >= end', () => {
    const sb = makeStoryboard({
      scenes: [
        {
          id: 'scene-01',
          block: 'GANCHO',
          start: 10,
          end: 5,
          voiceover: 'text',
          onScreenText: [],
          imagePrompt: 'prompt',
          motion: 'zoom',
        },
      ],
    });
    const imageMap = new Map<string, string | null>([['scene-01', null]]);
    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      30,
      null,
      imageMap,
    );

    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('start') && e.includes('end'))).toBe(true);
  });

  it('rejects overlapping consecutive scenes', () => {
    const sb = makeStoryboard({
      scenes: [
        {
          id: 'scene-01',
          block: 'GANCHO',
          start: 0,
          end: 10,
          voiceover: 'a',
          onScreenText: [],
          imagePrompt: 'p1',
          motion: 'zoom',
        },
        {
          id: 'scene-02',
          block: 'DESARROLLO',
          start: 8,
          end: 15,
          voiceover: 'b',
          onScreenText: [],
          imagePrompt: 'p2',
          motion: 'pan',
        },
      ],
    });
    const imageMap = new Map<string, string | null>([
      ['scene-01', null],
      ['scene-02', null],
    ]);
    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      30,
      null,
      imageMap,
    );

    const result = validateManifest(manifest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('overlap'))).toBe(true);
  });

  it('warns about missing images', () => {
    const sb = makeStoryboard();
    const imageMap = new Map<string, string | null>([
      ['scene-01', null],
      ['scene-02', null],
    ]);
    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      30,
      null,
      imageMap,
    );

    const result = validateManifest(manifest);
    expect(result.warnings.some((w) => w.includes('scene-01'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('scene-02'))).toBe(true);
  });

  it('warns about missing subtitle', () => {
    const sb = makeStoryboard();
    const imageMap = new Map<string, string | null>([
      ['scene-01', '/abs/images/scene-01.jpg'],
      ['scene-02', '/abs/images/scene-02.jpg'],
    ]);
    const manifest = buildManifest(
      sb,
      'test-case',
      '/abs/audio/test-case.mp3',
      30,
      null,
      imageMap,
    );

    const result = validateManifest(manifest);
    expect(result.warnings.some((w) => w.includes('subtitle') || w.includes('Subtitle'))).toBe(true);
  });
});

describe('discoverImages', () => {
  it('returns a Map with scene IDs as keys', async () => {
    const sb = makeStoryboard();
    const result = await discoverImages('/nonexistent/images', sb.scenes);
    expect(result).toBeInstanceOf(Map);
    expect(result.has('scene-01')).toBe(true);
    expect(result.has('scene-02')).toBe(true);
  });

  it('returns null for scenes without images in the directory', async () => {
    const sb = makeStoryboard();
    const result = await discoverImages('/nonexistent/images', sb.scenes);
    // Non-existent directory → all null
    expect(result.get('scene-01')).toBeNull();
    expect(result.get('scene-02')).toBeNull();
  });
});
