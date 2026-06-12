import { describe, it, expect } from 'vitest';
import { buildCopyPlan, rescaleScenesToAudio, toWorkspaceManifest } from '../../src/pipeline/render-workspace.ts';
import type { Manifest, ManifestScene } from '../../src/lib/manifest.ts';

function makeScene(i: number, overrides: Partial<ManifestScene> = {}): ManifestScene {
  return {
    id: `scene-0${i + 1}`,
    block: 'DESARROLLO',
    start: i * 10,
    end: (i + 1) * 10,
    voiceover: `Texto ${i + 1}`,
    onScreenText: [],
    imagePrompt: 'prompt',
    motion: 'zoom-in',
    image: `/repo/assets/images/scene-0${i + 1}.jpg`,
    ...overrides,
  };
}

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    slug: 'caso-test',
    title: 'Caso de prueba',
    audio: { path: '/repo/assets/audio/caso-test.mp3', duration: 58.5 },
    subtitle: { path: '/repo/assets/output/caso-test.srt' },
    artDirection: {
      medium: 'm', lineWork: 'l', palette: 'p', lighting: 'i', texture: 't',
      mood: 'o', composition: 'c', humanTreatment: 'h', constraints: 'x',
    },
    scenes: [makeScene(0), makeScene(1), makeScene(2)],
    generatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildCopyPlan', () => {
  it('copies every scene image to images/<basename>', () => {
    const plan = buildCopyPlan(makeManifest());
    expect(plan).toContainEqual({
      src: '/repo/assets/images/scene-01.jpg',
      dest: 'images/scene-01.jpg',
    });
    expect(plan.filter((e) => e.dest.startsWith('images/'))).toHaveLength(3);
  });

  it('skips scenes without image', () => {
    const m = makeManifest();
    m.scenes[1] = makeScene(1, { image: null });
    const plan = buildCopyPlan(m);
    expect(plan.filter((e) => e.dest.startsWith('images/'))).toHaveLength(2);
  });

  it('includes captions when subtitle exists and skips it when null', () => {
    const withSrt = buildCopyPlan(makeManifest());
    expect(withSrt).toContainEqual({
      src: '/repo/assets/output/caso-test.srt',
      dest: 'captions/caso-test.srt',
    });
    const without = buildCopyPlan(makeManifest({ subtitle: { path: null } }));
    expect(without.some((e) => e.dest.startsWith('captions/'))).toBe(false);
  });

  it('always includes the audio', () => {
    const plan = buildCopyPlan(makeManifest());
    expect(plan).toContainEqual({
      src: '/repo/assets/audio/caso-test.mp3',
      dest: 'audio/caso-test.mp3',
    });
  });
});

describe('rescaleScenesToAudio', () => {
  it('scales scene times so the last scene ends with the audio', () => {
    // guion: 0..30, audio real: 58.5 → factor 1.95
    const rescaled = rescaleScenesToAudio(makeManifest());
    expect(rescaled.scenes[0].start).toBe(0);
    expect(rescaled.scenes[2].end).toBeCloseTo(58.5, 3);
    expect(rescaled.scenes[1].end).toBeCloseTo(39, 3);
  });

  it('keeps scenes contiguous after rescaling', () => {
    const rescaled = rescaleScenesToAudio(makeManifest());
    for (let i = 1; i < rescaled.scenes.length; i++) {
      expect(rescaled.scenes[i].start).toBeCloseTo(rescaled.scenes[i - 1].end, 3);
    }
  });

  it('returns the manifest untouched when duration is null or already matches', () => {
    const noDuration = makeManifest({ audio: { path: '/a.mp3', duration: null } });
    expect(rescaleScenesToAudio(noDuration)).toBe(noDuration);
    const exact = makeManifest({ audio: { path: '/a.mp3', duration: 30 } });
    expect(rescaleScenesToAudio(exact)).toBe(exact);
  });

  it('does not mutate the original manifest', () => {
    const original = makeManifest();
    rescaleScenesToAudio(original);
    expect(original.scenes[2].end).toBe(30);
  });
});

describe('toWorkspaceManifest', () => {
  it('rewrites absolute source paths to workspace-relative ones', () => {
    const ws = toWorkspaceManifest(makeManifest());
    expect(ws.audio.path).toBe('audio/caso-test.mp3');
    expect(ws.subtitle.path).toBe('captions/caso-test.srt');
    expect(ws.scenes[0].image).toBe('images/scene-01.jpg');
  });

  it('preserves nulls for missing subtitle and images', () => {
    const m = makeManifest({ subtitle: { path: null } });
    m.scenes[1] = makeScene(1, { image: null });
    const ws = toWorkspaceManifest(m);
    expect(ws.subtitle.path).toBeNull();
    expect(ws.scenes[1].image).toBeNull();
  });

  it('does not mutate the original manifest', () => {
    const original = makeManifest();
    toWorkspaceManifest(original);
    expect(original.audio.path).toBe('/repo/assets/audio/caso-test.mp3');
  });
});
