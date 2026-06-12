// Genera render-<slug>/preview.html: la MISMA composición que index.html pero
// reproducible por un humano con doble click, sin servidor ni HyperFrames:
// - audio de la narración + overlay de play (el autoplay con sonido lo
//   bloquea el navegador, hace falta un click),
// - captions SRT incrustados en el HTML (file:// bloquea fetch por CORS).
// index.html queda intacto como fuente de frames determinista para el runner.
import { basename } from 'node:path';
import { generateHtml } from './template.js';
import type { Manifest } from '../lib/manifest.js';

const PREVIEW_STYLE = `  <style>
    #preview-play { position: fixed; inset: 0; z-index: 100; display: flex;
      justify-content: center; align-items: center; background: rgba(0,0,0,0.6);
      color: #fff; cursor: pointer; font: 2rem 'Segoe UI', system-ui, sans-serif; }
  </style>
</head>`;

export function generatePreviewHtml(manifest: Manifest, srtContent: string | null): string {
  let html = generateHtml(manifest);

  // 1. Captions incrustados en vez de fetch (file:// lo bloquea).
  if (manifest.subtitle.path && srtContent !== null) {
    const srtHref = `captions/${basename(manifest.subtitle.path)}`;
    const fetchLine = `fetch('${srtHref}').then(r => r.text()).then(t => { captions = parseSrt(t); }).catch(() => {});`;
    // < evita cerrar el <script> si un subtítulo contuviera "</".
    const inlined = JSON.stringify(srtContent).replace(/</g, '\\u003c');
    html = html.replace(fetchLine, `captions = parseSrt(${inlined});`);
  }

  // 2. Audio + overlay de play que arranca audio y timeline a la vez.
  const audioSrc = `audio/${basename(manifest.audio.path)}`;
  html = html.replace('</head>', PREVIEW_STYLE);
  html = html.replace(
    '<body>',
    `<body>\n  <div id="preview-play">▶ Preview</div>\n  <audio id="preview-audio" src="${audioSrc}" preload="auto"></audio>`,
  );
  html = html.replace(
    '</body>',
    `  <script>
    document.getElementById('preview-play').addEventListener('click', () => {
      document.getElementById('preview-play').remove();
      document.getElementById('preview-audio').play();
      tl.play();
    });
  </script>
</body>`,
  );
  return html;
}
