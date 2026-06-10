// Proveedor local: lee imágenes de un directorio pool para demo sin red.
// Por defecto: assets/images/_pool/

import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Candidate, MediaProvider } from './provider.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

export class LocalProvider implements MediaProvider {
  name = 'local';
  private poolDir: string;

  constructor(poolDir?: string) {
    this.poolDir = poolDir ?? join(process.cwd(), 'assets', 'images', '_pool');
  }

  async search(_query: string, limit = 5): Promise<Candidate[]> {
    let files: string[];
    try {
      files = await readdir(this.poolDir);
    } catch {
      return [];
    }

    const images = files
      .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
      .slice(0, limit)
      .map((f) => ({
        url: pathToFileURL(join(this.poolDir, f)).href,
        title: f,
        source: 'local' as const,
      }));

    return images;
  }
}