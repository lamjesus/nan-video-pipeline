// Lógica pura del compose stage (complementa src/lib/manifest.ts):
// - buildCopyPlan: qué assets copiar al workspace render-<slug>/ para que las
//   rutas relativas del HTML (images/, captions/, audio/) resuelvan.
// - rescaleScenesToAudio: el guion INVENTA los tiempos de escena; el audio
//   medido con ffprobe manda. Se reescalan proporcionalmente para que la
//   última escena acabe con la voz (sin cola muda ni corte).
// Cero I/O: testeable en aislamiento.
import { basename } from 'node:path';
import type { Manifest } from '../lib/manifest.js';

export interface CopyEntry {
  src: string;  // ruta absoluta de origen (assets/)
  dest: string; // ruta relativa dentro de render-<slug>/
}

export function buildCopyPlan(manifest: Manifest): CopyEntry[] {
  const plan: CopyEntry[] = [];
  for (const scene of manifest.scenes) {
    if (scene.image) {
      plan.push({ src: scene.image, dest: `images/${basename(scene.image)}` });
    }
  }
  if (manifest.subtitle.path) {
    plan.push({
      src: manifest.subtitle.path,
      dest: `captions/${basename(manifest.subtitle.path)}`,
    });
  }
  plan.push({ src: manifest.audio.path, dest: `audio/${basename(manifest.audio.path)}` });
  return plan;
}

export function rescaleScenesToAudio(manifest: Manifest): Manifest {
  const duration = manifest.audio.duration;
  const scenes = manifest.scenes;
  const total = scenes.length > 0 ? scenes[scenes.length - 1].end : 0;
  if (!duration || duration <= 0 || total <= 0 || duration === total) {
    return manifest;
  }
  const factor = duration / total;
  const ms = (n: number) => Math.round(n * 1000) / 1000;
  return {
    ...manifest,
    scenes: scenes.map((s) => ({ ...s, start: ms(s.start * factor), end: ms(s.end * factor) })),
  };
}
