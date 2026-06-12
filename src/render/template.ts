// Pure string builders: generate HTML and CSS from a Manifest.
// No I/O, no side effects — deterministic, fully testable.
import { basename } from 'node:path';
import { resolveMotion } from './motion.js';
import type { Manifest } from '../lib/manifest.js';

// El título y los onScreenText vienen de un LLM: sin escapar pueden romper el
// HTML (o colarse un "</body>" que confunda al postprocesado del preview).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generates a complete HTML string from a Manifest.
 * Deterministic: same manifest → byte-identical output.
 */
export function generateHtml(manifest: Manifest): string {
  const { title, artDirection, scenes } = manifest;

  const sceneSections = scenes
    .map((scene) => {
      const motion = resolveMotion(scene.motion);
      const imgSrc = scene.image ? `images/${basename(scene.image)}` : '';
      const overlays = scene.onScreenText
        .map((text) => `    <div class="overlay-text">${escapeHtml(text)}</div>`)
        .join('\n');

      return `  <section class="scene" data-motion="${motion}" data-scene="${scene.id}" data-start="${scene.start}" data-end="${scene.end}">
    <img src="${imgSrc}" alt="${scene.id}" loading="lazy">
${overlays}
  </section>`;
    })
    .join('\n');

  const srtHref = manifest.subtitle?.path ? `captions/${basename(manifest.subtitle.path)}` : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="styles.css">
  ${srtHref ? `<link rel="preload" href="${srtHref}" as="fetch" crossorigin>` : ''}
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt" crossorigin="anonymous"></script>
</head>
<body>
  <script type="application/json" id="art-direction">
${JSON.stringify(artDirection).replace(/</g, '\\u003c')}
  </script>
  <div class="container" data-composition-id="main" data-duration="${manifest.audio.duration ?? manifest.scenes[manifest.scenes.length - 1].end}">
${sceneSections}
  <div id="caption-container" class="caption-container"></div>
  </div>
  <script>
    // SRT parser (browser-side)
    function parseSrt(content) {
      if (!content || !content.trim()) return [];
      return content.split(/\\n\\n+/).filter(b => b.trim()).map(block => {
        const m = /(\\d+)\\n(\\d{2}:\\d{2}:\\d{2},\\d{3})\\s*-->\\s*(\\d{2}:\\d{2}:\\d{2},\\d{3})\\n([\\s\\S]+)/.exec(block.trim());
        if (!m) return null;
        const ts = (s) => { const p = s.replace(',','.').split(':'); return +p[0]*3600 + +p[1]*60 + +p[2]; };
        return { index: +m[1], start: ts(m[2]), end: ts(m[3]), text: m[4].trim() };
      }).filter(Boolean);
    }

    // Load captions
    let captions = [];
    ${srtHref ? `fetch('${srtHref}').then(r => r.text()).then(t => { captions = parseSrt(t); }).catch(() => {});` : ''}

    const captionEl = document.getElementById('caption-container');
    let currentCaption = '';
    function updateCaption(time) {
      const active = captions.find(c => time >= c.start && time <= c.end);
      const text = active ? active.text : '';
      if (text !== currentCaption) {
        captionEl.style.opacity = '0';
        setTimeout(() => {
          captionEl.textContent = text;
          captionEl.style.opacity = '1';
        }, 50);
        currentCaption = text;
      }
    }

    const tl = gsap.timeline({
      paused: false,
      onUpdate: () => updateCaption(tl.time()),
    });
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach((scene) => {
      const start = parseFloat(scene.dataset.start);
      const end = parseFloat(scene.dataset.end);
      const duration = end - start;
      const img = scene.querySelector('img');
      const motion = scene.dataset.motion;
      tl.to(scene, { opacity: 1, duration: 0 }, start);
      switch (motion) {
        case 'zoom-in':
          tl.fromTo(img, { scale: 1.08, xPercent: -2 }, { scale: 1, xPercent: 0, duration, ease: 'power1.out' }, start);
          break;
        case 'zoom-out':
          tl.fromTo(img, { scale: 1, xPercent: 0 }, { scale: 1.08, xPercent: 2, duration, ease: 'power1.out' }, start);
          break;
        case 'pan-left':
          tl.fromTo(img, { x: '5%', xPercent: 0 }, { x: '-5%', xPercent: 0, duration, ease: 'power1.out' }, start);
          break;
        case 'pan-right':
          tl.fromTo(img, { x: '-5%', xPercent: 0 }, { x: '5%', xPercent: 0, duration, ease: 'power1.out' }, start);
          break;
        case 'shake':
          tl.to(img, { x: '+=8', duration: 0.08, repeat: Math.floor(duration / 0.16), yoyo: true, ease: 'steps(2)' }, start);
          break;
        case 'pan-slow':
          tl.fromTo(img, { xPercent: 3 }, { xPercent: -3, duration, ease: 'none' }, start);
          break;
      }
      tl.to(scene, { opacity: 0, duration: 0.3 }, end - 0.3);
    });
  </script>
</body>
</html>`;
}

/**
 * Generates CSS for the 9:16 video composition layout.
 * Deterministic: same manifest → byte-identical output.
 */
export function generateCss(_manifest: Manifest): string {
  return `/* 9:16 video composition — auto-generated from manifest */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: #000;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  overflow: hidden;
}

.container {
  position: relative;
  width: 100vw;
  max-width: calc(100vh * 9 / 16);
  aspect-ratio: 9 / 16;
  overflow: hidden;
  background: #000;
}

.scene {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.scene img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.overlay-text {
  position: absolute;
  color: #fff;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  font-size: clamp(1.2rem, 3.5vw, 1.9rem);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-shadow:
    0 0 8px rgba(0,0,0,0.95),
    0 2px 4px rgba(0,0,0,0.9),
    3px 3px 0 rgba(0,0,0,0.5);
  padding: 0.5rem 1rem;
  pointer-events: none;
  line-height: 1.3;
}

.overlay-text:first-of-type {
  top: 6%;
  left: 4%;
  color: #ffcc00;
}
.overlay-text:nth-of-type(2) {
  top: 13%;
  left: 4%;
  font-size: clamp(0.9rem, 2.5vw, 1.3rem);
  color: #fff;
  font-weight: 600;
}

/* Captions estilo CapCut: fondo oscuro semitransparente, texto blanco,
   borde redondeado, animación suave de entrada/salida. */
.caption-container {
  position: absolute;
  bottom: 6%;
  left: 50%;
  transform: translateX(-50%);
  width: 92%;
  text-align: center;
  color: #fff;
  font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
  font-size: clamp(1.2rem, 4vw, 2rem);
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0.01em;
  padding: 0.6rem 1rem;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.75);
  text-shadow: 1px 1px 2px rgba(0,0,0,0.8);
  pointer-events: none;
  z-index: 10;
  transition: opacity 0.1s ease;
  -webkit-text-stroke: 2px rgba(0,0,0,0.6);
  paint-order: stroke fill;
}`;
}
