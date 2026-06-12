// Lógica pura de la etapa de visión, extraída para poder testearla en aislamiento.
// (02-vision.ts ejecuta main() al importarse, así que no se puede importar desde
// un test sin disparar el pipeline; estas funciones sí son seguras de importar.)

import { extractJson } from './script-util.js';

const STOPWORDS = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'of', 'to', 'for', 'with', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their',
  'we', 'us', 'our', 'you', 'your', 'he', 'she', 'him', 'her', 'his',
  'from', 'by', 'as', 'but', 'not', 'no', 'so', 'if', 'about', 'into',
  'over', 'after', 'before', 'between', 'under', 'above', 'below',
  'very', 'just', 'also', 'more', 'some', 'any', 'each', 'every',
  'all', 'both', 'few', 'most', 'other', 'such', 'only', 'own', 'same',
]);

// Deriva hasta 3 keywords del imagePrompt: minúsculas, sin stopwords, sin
// palabras de <=2 letras, sin duplicados.
export function deriveSearchTerms(imagePrompt: string): string[] {
  const words = imagePrompt.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const filtered = words.filter((w) => !STOPWORDS.has(w) && w.length > 2);
  return [...new Set(filtered)].slice(0, 3);
}

// --- Search queries con el modelo de texto (sustituye a la heurística) ---
// La heurística de stopwords coge las PRIMERAS palabras del imagePrompt, que
// son dirección de cámara ("Wide aerial shot…") → queries irrelevantes para
// Wikimedia. El modelo extrae el SUJETO de cada escena en una sola llamada.

export interface SceneForQuery {
  id: string;
  imagePrompt: string;
}

// Query desbocada = el modelo se puso a redactar; dispara el retry.
const MAX_QUERY_CHARS = 100;

/**
 * Prompt para qwen3.6: una query de búsqueda por escena, en UNA llamada.
 * Pide un mapa JSON plano { "scene-id": "query" } con sujetos concretos
 * (nombres propios, lugares, objetos) y prohíbe vocabulario de cámara/estilo,
 * que es lo que envenena la búsqueda en Wikimedia.
 */
export function buildSearchQueriesPrompt(scenes: SceneForQuery[], topic: string): string {
  const lines = scenes.map((s) => `- ${s.id}: ${s.imagePrompt}`).join('\n');
  return (
    `Eres documentalista de archivo. Tema del video: "${topic}".\n` +
    `Para CADA escena, escribe UNA query de búsqueda para encontrar fotos en ` +
    `Wikipedia/Wikimedia Commons que ilustren la escena.\n\n` +
    `Reglas:\n` +
    `- 2 a 6 palabras EN INGLÉS por query.\n` +
    `- Sujetos concretos y buscables: nombres propios, lugares, objetos, épocas ` +
    `(p. ej. "Numantia Celtiberian ruins", "Scipio Aemilianus bust").\n` +
    `- PROHIBIDO vocabulario de cámara, estilo o iluminación: wide, aerial, shot, ` +
    `close up, cinematic, lighting, 8k, atmosphere y similares — describen el ` +
    `encuadre, no el contenido, y arruinan la búsqueda.\n` +
    `- Si la escena es abstracta, busca el objeto fotografiable más cercano al tema.\n\n` +
    `Escenas:\n${lines}\n\n` +
    `Responde SOLO con un objeto JSON plano: ` +
    `{"${scenes[0]?.id ?? 'scene-01'}": "query", ...} — sin prosa, sin markdown.`
  );
}

/**
 * Parsea y valida la respuesta del modelo: un mapa { scene-id: query }.
 * Tolera <think>, vallas markdown y prosa (vía extractJson). Acepta arrays de
 * palabras (los une). Los errores nombran la escena (`scene-03: …`) para
 * usarlos como feedback de retry, igual que validateStoryboard.
 */
export function parseSearchQueries(
  raw: string,
  sceneIds: string[],
): { queries: Record<string, string>; errors: string[] } {
  const errors: string[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { queries: {}, errors: ['la respuesta no contiene un objeto JSON válido'] };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { queries: {}, errors: ['la raíz debe ser un objeto JSON plano { "scene-id": "query" }'] };
  }

  const map = parsed as Record<string, unknown>;
  const queries: Record<string, string> = {};

  for (const id of sceneIds) {
    let value = map[id];
    if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
      value = value.join(' ');
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(`${id}: falta o no es una query de texto no vacía`);
      continue;
    }
    const query = value.trim();
    if (query.length > MAX_QUERY_CHARS) {
      errors.push(`${id}: query demasiado larga (${query.length} chars, máx ${MAX_QUERY_CHARS}) — usa 2-6 palabras`);
      continue;
    }
    queries[id] = query;
  }

  return { queries, errors };
}

// Extensión de imagen a partir de la URL (jpg por defecto).
export function extFromUrl(url: string): string {
  const match = url.match(/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i);
  if (match) return match[1].toLowerCase();
  return 'jpg';
}

// MIME type a partir de la extensión (image/jpeg por defecto).
export function mimeFromExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png': return 'image/png';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'svg': return 'image/svg+xml';
    default: return 'image/jpeg';
  }
}

// Devuelve el item con mayor score. En empate gana el primero (orden estable).
// Array vacío → null.
export function bestByScore<T>(scored: { item: T; score: number }[]): T | null {
  if (scored.length === 0) return null;
  let best = scored[0];
  for (const s of scored) {
    if (s.score > best.score) best = s;
  }
  return best.item;
}
