// Manifest types and pure builder logic for the compose stage.
// Pure functions: no fs, no side effects — fully testable.
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Scene, Storyboard } from './types.js';

// --- Types ---

export interface ManifestScene {
  id: string;
  block: string;
  start: number;
  end: number;
  voiceover: string;
  onScreenText: string[];
  imagePrompt: string;
  motion: string;
  image: string | null; // absolute path or null
}

export interface Manifest {
  slug: string;
  title: string;
  audio: { path: string; duration: number | null };
  subtitle: { path: string | null };
  scenes: ManifestScene[];
  generatedAt: string; // ISO timestamp
}

// --- Pure functions ---

/**
 * Globs assets/images/<scene.id>.*, returns Map<sceneId, absolutePath | null>.
 * Accepts first match per scene (extension is dynamic from vision stage).
 */
export async function discoverImages(
  imagesDir: string,
  scenes: Scene[],
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  for (const scene of scenes) {
    result.set(scene.id, null);
  }

  try {
    const files = await readdir(imagesDir);
    for (const scene of scenes) {
      const match = files.find((f) => f.startsWith(scene.id + '.'));
      if (match) {
        result.set(scene.id, resolve(imagesDir, match));
      }
    }
  } catch {
    // Directory doesn't exist — all scenes get null image
  }

  return result;
}

/**
 * Pure: builds Manifest from inputs (no fs, no side effects).
 */
export function buildManifest(
  storyboard: Storyboard,
  slug: string,
  audioPath: string,
  audioDuration: number | null,
  subtitlePath: string | null,
  imageMap: Map<string, string | null>,
): Manifest {
  const scenes: ManifestScene[] = storyboard.scenes.map((s) => ({
    id: s.id,
    block: s.block,
    start: s.start,
    end: s.end,
    voiceover: s.voiceover,
    onScreenText: s.onScreenText,
    imagePrompt: s.imagePrompt,
    motion: s.motion,
    image: imageMap.get(s.id) ?? null,
  }));

  return {
    slug,
    title: storyboard.title,
    audio: { path: audioPath, duration: audioDuration },
    subtitle: { path: subtitlePath },
    scenes,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Pure: validates scene ordering and returns structured errors.
 */
export function validateManifest(
  manifest: Manifest,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (manifest.scenes.length === 0) {
    errors.push('Manifest has no scenes');
  }

  for (const scene of manifest.scenes) {
    if (scene.start >= scene.end) {
      errors.push(
        `Scene ${scene.id}: start (${scene.start}) must be < end (${scene.end})`,
      );
    }
  }

  for (let i = 1; i < manifest.scenes.length; i++) {
    const prev = manifest.scenes[i - 1];
    const curr = manifest.scenes[i];
    if (prev.end > curr.start) {
      errors.push(
        `Overlap: ${prev.id} ends at ${prev.end} but ${curr.id} starts at ${curr.start}`,
      );
    }
  }

  // Warnings for missing assets
  for (const scene of manifest.scenes) {
    if (scene.image === null) {
      warnings.push(`WARN: No image found for ${scene.id}`);
    }
  }
  if (manifest.subtitle.path === null) {
    warnings.push('WARN: Subtitle file not found');
  }

  return { valid: errors.length === 0, errors, warnings };
}
