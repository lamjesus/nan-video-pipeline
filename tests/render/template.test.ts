import { describe, it, expect } from 'vitest';
import { generateHtml, generateCss } from '../../src/render/template.ts';
import type { Manifest } from '../../src/lib/manifest.ts';

function makeManifest(overrides?: Partial<Manifest>): Manifest {
  return {
    slug: 'test-case',
    title: 'Test Video',
    audio: { path: '/abs/audio/test-case.mp3', duration: 30 },
    subtitle: { path: '/abs/output/test-case.srt' },
    artDirection: {
      medium: 'illustration',
      lineWork: 'bold ink',
      palette: 'dark tones',
      lighting: 'dramatic',
      texture: 'grain',
      mood: 'tense',
      composition: 'centered',
      humanTreatment: 'silhouettes',
      constraints: 'no text',
    },
    scenes: [
      {
        id: 'scene-01',
        block: 'GANCHO',
        start: 0,
        end: 5,
        voiceover: 'Bienvenidos',
        onScreenText: ['Año 79 d.C.'],
        caption: 'Imagina una ciudad próspera',
        imagePrompt: 'A dark illustration',
        motion: 'zoom-in lento sobre la ciudad',
        image: '/abs/assets/images/scene-01.jpg',
      },
      {
        id: 'scene-02',
        block: 'DESARROLLO',
        start: 5,
        end: 12,
        voiceover: 'La historia continua',
        onScreenText: [],
        caption: 'El Vesubio no avisa',
        imagePrompt: 'Mountain landscape',
        motion: 'paneo sobre la calle',
        image: '/abs/assets/images/scene-02.png',
      },
    ],
    generatedAt: '2025-01-15T10:30:00.000Z',
    ...overrides,
  };
}

describe('generateHtml', () => {
  const manifest = makeManifest();
  const html = generateHtml(manifest);

  it('contains DOCTYPE and lang="es"', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('lang="es"');
  });

  it('contains GSAP CDN script in head', () => {
    expect(html).toContain('gsap/3.12.5/gsap.min.js');
  });

  it('contains stylesheet link', () => {
    expect(html).toContain('href="styles.css"');
  });

  it('contains correct title', () => {
    expect(html).toContain('<title>Test Video</title>');
  });

  it('contains artDirection JSON block', () => {
    expect(html).toContain('id="art-direction"');
    expect(html).toContain('application/json');
    expect(html).toContain('"medium":"illustration"');
    expect(html).toContain('"mood":"tense"');
  });

  it('contains scene sections with correct data-* attributes', () => {
    expect(html).toContain('data-motion="zoom-in"');
    expect(html).toContain('data-scene="scene-01"');
    expect(html).toContain('data-start="0"');
    expect(html).toContain('data-duration="5"');
    expect(html).toContain('data-motion="pan-left"');
    expect(html).toContain('data-scene="scene-02"');
  });

  it('converts absolute image paths to relative', () => {
    expect(html).toContain('src="images/scene-01.jpg"');
    expect(html).toContain('src="images/scene-02.png"');
    expect(html).not.toContain('/abs/');
  });

  it('contains overlay text', () => {
    expect(html).toContain('Año 79 d.C.');
  });

  it('contains inline caption divs per scene', () => {
    expect(html).toContain('class="caption"');
    expect(html).toContain('Imagina una ciudad próspera');
    expect(html).toContain('El Vesubio no avisa');
  });

  it('contains inline GSAP timeline script', () => {
    expect(html).toContain('gsap.timeline');
    expect(html).toContain('data-motion');
  });

  it('runs the timeline on load (HyperFrames captures a running timeline)', () => {
    expect(html).toContain('paused: false');
  });

  it('has no SRT-fetch leftovers — captions are inline static HTML', () => {
    expect(html).not.toContain('fetch(');
    expect(html).not.toContain('caption-container');
    expect(html).not.toContain('parseSrt');
  });

  it('is deterministic — same manifest produces identical output', () => {
    const html2 = generateHtml(manifest);
    expect(html).toBe(html2);
  });
});

describe('generateCss', () => {
  const manifest = makeManifest();
  const css = generateCss(manifest);

  it('contains .scene class', () => {
    expect(css).toContain('.scene');
  });

  it('contains .overlay-text class', () => {
    expect(css).toContain('.overlay-text');
  });

  it('styles the .caption class that generateHtml actually emits', () => {
    // Regresión: el CSS definía .caption-container (diseño viejo) mientras el
    // HTML emite <div class="caption"> — los captions salían sin estilo.
    expect(css).toMatch(/\.caption\s*\{/);
  });

  it('contains 9:16 aspect ratio container', () => {
    expect(css).toContain('9 / 16');
  });

  it('is deterministic', () => {
    const css2 = generateCss(manifest);
    expect(css).toBe(css2);
  });
});
