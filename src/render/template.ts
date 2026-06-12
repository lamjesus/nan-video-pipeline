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
  const { slug, title, artDirection, scenes } = manifest;

  const sceneSections = scenes
    .map((scene) => {
      const motion = resolveMotion(scene.motion);
      const imgSrc = scene.image ? `images/${basename(scene.image)}` : '';
      const overlays = scene.onScreenText
        .map((text) => `    <div class="overlay-text">${escapeHtml(text)}</div>`)
        .join('\n');
      const caption = scene.caption
        ? `    <div class="caption">${escapeHtml(scene.caption)}</div>`
        : '';

      return `  <section class="scene clip" id="${scene.id}" data-motion="${motion}" data-scene="${scene.id}" data-start="${scene.start}" data-duration="${scene.end - scene.start}">
    <img src="${imgSrc}" alt="${scene.id}" loading="lazy">
${overlays}${caption ? '\n' + caption : ''}
  </section>`;
    })
    .join('\n');

  const totalDuration = scenes.length > 0 ? scenes[scenes.length - 1].end : 0;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="styles.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js" integrity="sha384-g4NTh/Iv5PPU4xPyhEWqPcwtNXOvdaDI8LLnyYfyNZOjKJeYQyjzQ9X5275eBjpt" crossorigin="anonymous"></script>
</head>
<body>
  <script type="application/json" id="art-direction">
${JSON.stringify(artDirection).replace(/</g, '\\u003c')}
  </script>
  <div class="container" data-composition-id="${slug}" data-duration="${totalDuration}" data-width="1080" data-height="1920" data-start="0">
${sceneSections}
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    const scenes = document.querySelectorAll('.scene');
    scenes.forEach((scene) => {
      const start = parseFloat(scene.dataset.start);
      const duration = parseFloat(scene.dataset.duration);
      const end = start + duration;
      const img = scene.querySelector('img');
      const motion = scene.dataset.motion;
      tl.to(scene, { opacity: 1, duration: 0 }, start);
      switch (motion) {
        case 'zoom-in':
          tl.fromTo(img, { scale: 1.15 }, { scale: 1, duration, ease: 'power1.out' }, start);
          break;
        case 'zoom-out':
          tl.fromTo(img, { scale: 1 }, { scale: 1.15, duration, ease: 'power1.out' }, start);
          break;
        case 'pan-left':
          tl.fromTo(img, { x: '0%' }, { x: '-15%', duration, ease: 'power1.out' }, start);
          break;
        case 'shake':
          tl.to(img, { x: '+=5', duration: 0.1, repeat: Math.floor(duration / 0.2), yoyo: true }, start);
          break;
        case 'pan-slow':
          tl.fromTo(img, { x: '0%' }, { x: '-8%', duration, ease: 'none' }, start);
          break;
      }
      tl.to(scene, { opacity: 0, duration: 0.3 }, end - 0.3);
    });

    // Register timeline for HyperFrames (must be an object, not array)
    window.__timelines = window.__timelines || {};
    window.__timelines["${slug}"] = tl;
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
}

.scene {
  position: absolute;
  inset: 0;
  opacity: 0;
}

.scene.clip {
  clip-path: inset(0);
}

.scene img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.overlay-text {
  position: absolute;
  color: #fff;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: clamp(1.1rem, 3.2vw, 1.7rem);
  font-weight: 700;
  text-shadow: 0 2px 4px rgba(0,0,0,0.9), 0 0 16px rgba(0,0,0,0.6);
  padding: 1rem;
  pointer-events: none;
}

.overlay-text:first-of-type { top: 10%; left: 5%; }
.overlay-text:nth-of-type(2) { top: 18%; left: 5%; }

/* Captions estilo CapCut: grandes, bold y con contorno para que contrasten
   sobre cualquier imagen (stroke en Chromium + sombras como fallback). */
.caption {
  position: absolute;
  bottom: 8%;
  left: 50%;
  transform: translateX(-50%);
  width: 90%;
  text-align: center;
  color: #fff;
  font-family: 'Segoe UI', system-ui, sans-serif;
  font-size: clamp(1.3rem, 4.5vw, 2.1rem);
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
  paint-order: stroke fill;
  -webkit-text-stroke: 5px rgba(0,0,0,0.85);
  text-shadow:
    0 2px 3px rgba(0,0,0,0.95),
    0 0 10px rgba(0,0,0,0.8),
    0 4px 20px rgba(0,0,0,0.6);
  pointer-events: none;
  z-index: 10;
}`;
}
