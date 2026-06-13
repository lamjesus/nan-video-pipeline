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
  <div class="container" data-composition-id="main" data-duration="${manifest.audio.duration ?? manifest.scenes[manifest.scenes.length - 1].end}">
${sceneSections}
  </div>
  <script>
    // Los captions van inline por escena (div.caption): no hay fetch de SRT
    // ni sincronización en runtime. El timeline nace corriendo porque
    // HyperFrames lo exige; el preview lo pausa hasta el click.
    const tl = gsap.timeline({ paused: false });
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

.scene.clip {
  clip-path: inset(0);
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
