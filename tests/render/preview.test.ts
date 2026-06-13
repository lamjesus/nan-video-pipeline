import { describe, it, expect } from 'vitest';
import { generatePreviewHtml } from '../../src/render/preview.ts';
import { generateHtml } from '../../src/render/template.ts';
import type { Manifest } from '../../src/lib/manifest.ts';

const SRT = '1\n00:00:00,000 --> 00:00:02,000\nHola mundo\n';

function makeManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    slug: 'caso-test',
    title: 'Caso de prueba',
    audio: { path: '/repo/assets/audio/caso-test.mp3', duration: 10 },
    subtitle: { path: '/repo/assets/output/caso-test.srt' },
    artDirection: {
      medium: 'm', lineWork: 'l', palette: 'p', lighting: 'i', texture: 't',
      mood: 'o', composition: 'c', humanTreatment: 'h', constraints: 'x',
    },
    scenes: [
      {
        id: 'scene-01', block: 'GANCHO', start: 0, end: 10,
        voiceover: 'Texto', onScreenText: [], caption: 'Hola mundo',
        imagePrompt: 'p', motion: 'zoom-in',
        image: '/repo/assets/images/scene-01.jpg',
      },
    ],
    generatedAt: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('generatePreviewHtml', () => {
  it('adds the narration audio and a play overlay', () => {
    const html = generatePreviewHtml(makeManifest(), SRT);
    expect(html).toContain('<audio id="preview-audio" src="audio/caso-test.mp3"');
    expect(html).toContain('id="preview-play"');
    expect(html).toContain('tl.play()');
  });

  it('pauses the timeline until the user clicks (audio/visual sync)', () => {
    const html = generatePreviewHtml(makeManifest(), SRT);
    expect(html).toContain('paused: true');
    expect(html).not.toContain('paused: false');
  });

  it('inlines captions as static HTML (no fetch needed)', () => {
    const html = generatePreviewHtml(makeManifest(), SRT);
    expect(html).not.toContain("fetch('captions/");
    expect(html).toContain('Hola mundo');
  });

  it('escapes "<" in captions so they cannot inject tags', () => {
    // Caption with HTML-injected text — escapeHtml should neutralize it
    const manifest = makeManifest({ scenes: [{
      id: 'scene-01', block: 'GANCHO', start: 0, end: 10,
      voiceover: 'Texto', onScreenText: [], caption: 'uno </script> dos',
      imagePrompt: 'p', motion: 'zoom-in',
      image: '/repo/assets/images/scene-01.jpg',
    }] });
    const html = generatePreviewHtml(manifest, null);
    expect(html).toContain('uno &lt;/script&gt; dos');
  });

  it('still works without subtitles (audio + play, no caption divs)', () => {
    const html = generatePreviewHtml(makeManifest({ subtitle: { path: null } }), null);
    expect(html).toContain('<audio id="preview-audio"');
    expect(html).not.toContain("fetch('captions/");
  });

  it('does not alter the base composition (scenes and motion intact)', () => {
    const base = generateHtml(makeManifest());
    const html = generatePreviewHtml(makeManifest(), SRT);
    expect(html).toContain('data-scene="scene-01"');
    expect(html).toContain('data-motion="zoom-in"');
    // index.html ya no tiene fetch — los captions son inline
    expect(base).toContain('class="caption"');
  });
});
