// Proveedor local: lee imágenes de un directorio pool para demo sin red.
// Por defecto: assets/images/_pool/

import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Candidate, MediaProvider } from './provider.js';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);

/**
 * Nombre de fichero → texto descriptivo para el matching por embeddings:
 * quita la extensión de imagen y convierte separadores ([-_.]) en espacios.
 * Un pool con nombres descriptivos ("numancia_hilltop-fog.jpg") se puede
 * emparejar por escena igual que los títulos de Wikimedia.
 */
export function filenameToText(name: string): string {
  const base = name.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, '');
  return base.replace(/[-_.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

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
        title: filenameToText(f),
        source: 'local' as const,
      }));

    return images;
  }
}