// Lógica pura de la etapa de visión, extraída para poder testearla en aislamiento.
// (02-vision.ts ejecuta main() al importarse, así que no se puede importar desde
// un test sin disparar el pipeline; estas funciones sí son seguras de importar.)

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
