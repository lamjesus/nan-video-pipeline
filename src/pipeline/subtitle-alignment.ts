// Pure alignment logic for subtitle generation.
// Flattens canonical voiceover text, matches against Whisper transcription via
// word-level LCS, and produces aligned segments with Whisper timing.
// Zero cluster dependencies — fully deterministic, testable in isolation.

// --- Types ---

export interface VoiceoverSegment {
  text: string;   // canonical voiceover text
  start: number;  // scene start (seconds)
  end: number;    // scene end (seconds)
}

export interface TranscriptionSegment {
  text: string;   // raw Whisper output
  start: number;  // seconds
  end: number;    // seconds
}

export interface AlignedSegment {
  index: number;
  start: number;  // seconds (from Whisper timing)
  end: number;    // seconds (from Whisper timing)
  text: string;   // canonical voiceover text (aligned)
}

// --- Helpers ---

/** Strip punctuation and lowercase for word-level comparison. */
function normalize(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Split text into words, preserving original form. */
function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Longest Common Subsequence on normalized word arrays.
 * Returns indices in `canonical` that matched indices in `raw`.
 */
function lcs(
  canonical: string[],
  raw: string[],
): Array<[number, number]> {
  const m = canonical.length;
  const n = raw.length;
  // dp table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normalize(canonical[i - 1]) === normalize(raw[j - 1]) && normalize(canonical[i - 1]) !== '') {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  // Backtrack to find matching pairs
  const matches: Array<[number, number]> = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (normalize(canonical[i - 1]) === normalize(raw[j - 1]) && normalize(canonical[i - 1]) !== '') {
      matches.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return matches;
}

/**
 * Fallback: split voiceover text into ~3-word chunks distributed across
 * the scene's time range.
 */
function fallbackSegments(vo: VoiceoverSegment): AlignedSegment[] {
  const w = words(vo.text);
  if (w.length === 0) return [];
  const chunkSize = 3;
  const chunks: string[] = [];
  for (let i = 0; i < w.length; i += chunkSize) {
    chunks.push(w.slice(i, i + chunkSize).join(' '));
  }
  const duration = vo.end - vo.start;
  const step = duration / chunks.length;
  return chunks.map((text, idx) => ({
    index: 0, // will be re-indexed later
    start: vo.start + idx * step,
    end: vo.start + (idx + 1) * step,
    text,
  }));
}

// --- Exports ---

/**
 * Align canonical voiceover text onto Whisper timing segments.
 * Uses word-level LCS matching so punctuation differences don't block.
 * Falls back to distributing voiceover across scene time ranges
 * when transcriptionSegments is empty or timing is unavailable.
 */
export function alignSegments(
  voiceoverSegments: VoiceoverSegment[],
  transcriptionSegments: TranscriptionSegment[],
): AlignedSegment[] {
  if (voiceoverSegments.length === 0) return [];

  // Fallback: no transcription available
  if (transcriptionSegments.length === 0) {
    const result: AlignedSegment[] = [];
    for (const vo of voiceoverSegments) {
      result.push(...fallbackSegments(vo));
    }
    return result.map((s, i) => ({ ...s, index: i + 1 }));
  }

  // Build canonical word list with source tracking
  const canonicalWords: Array<{ word: string; voIndex: number }> = [];
  for (let vi = 0; vi < voiceoverSegments.length; vi++) {
    for (const w of words(voiceoverSegments[vi].text)) {
      canonicalWords.push({ word: w, voIndex: vi });
    }
  }

  // Build raw word list with timing
  const rawWords: Array<{ word: string; start: number; end: number }> = [];
  for (const seg of transcriptionSegments) {
    const w = words(seg.text);
    const wordDuration = (seg.end - seg.start) / Math.max(w.length, 1);
    for (let wi = 0; wi < w.length; wi++) {
      rawWords.push({
        word: w[wi],
        start: seg.start + wi * wordDuration,
        end: seg.start + (wi + 1) * wordDuration,
      });
    }
  }

  // LCS match
  const canonicalNorm = canonicalWords.map((c) => c.word);
  const rawNorm = rawWords.map((r) => r.word);
  const matches = lcs(canonicalNorm, rawNorm);

  // Build timing map: canonical word index → raw word timing
  const timingMap = new Map<number, { start: number; end: number }>();
  for (const [ci, ri] of matches) {
    timingMap.set(ci, { start: rawWords[ri].start, end: rawWords[ri].end });
  }

  // Una sola pasada en orden canónico: runs consecutivos de palabras CON y
  // SIN timing. Los runs con match toman el timing de Whisper; los runs sin
  // match se colocan EN SU POSICIÓN, en la ventana entre el final del vecino
  // anterior y el inicio del siguiente (no al final de la escena, que rompía
  // el orden y generaba solapes — hallazgo P1-A de la auditoría 2026-06-11).
  type WordRun = { indices: number[]; matched: boolean };
  const runs: WordRun[] = [];
  for (let ci = 0; ci < canonicalWords.length; ci++) {
    const matched = timingMap.has(ci);
    const prev = runs[runs.length - 1];
    if (prev && prev.matched === matched) {
      prev.indices.push(ci);
    } else {
      runs.push({ indices: [ci], matched });
    }
  }

  // Ventana mínima para que un run sin match sea su propio bloque; si no hay
  // hueco temporal, sus palabras se fusionan con el segmento vecino.
  const MIN_WINDOW = 0.2;

  const result: AlignedSegment[] = [];
  let pendingPrefix = ''; // run inicial sin hueco propio → se antepone al siguiente

  const textOf = (run: WordRun) => run.indices.map((i) => canonicalWords[i].word).join(' ');

  for (let k = 0; k < runs.length; k++) {
    const run = runs[k];
    if (run.matched) {
      const first = timingMap.get(run.indices[0])!;
      const last = timingMap.get(run.indices[run.indices.length - 1])!;
      const text = pendingPrefix ? `${pendingPrefix} ${textOf(run)}` : textOf(run);
      pendingPrefix = '';
      result.push({ index: 0, start: first.start, end: last.end, text });
    } else {
      const firstIdx = run.indices[0];
      const lastIdx = run.indices[run.indices.length - 1];
      const prevSeg = result[result.length - 1] ?? null;
      const nextMatched = runs.slice(k + 1).find((r) => r.matched);
      const windowStart = prevSeg ? prevSeg.end : voiceoverSegments[canonicalWords[firstIdx].voIndex].start;
      const windowEnd = nextMatched
        ? timingMap.get(nextMatched.indices[0])!.start
        : voiceoverSegments[canonicalWords[lastIdx].voIndex].end;

      if (windowEnd - windowStart >= MIN_WINDOW) {
        result.push({ index: 0, start: windowStart, end: windowEnd, text: textOf(run) });
      } else if (prevSeg) {
        prevSeg.text = `${prevSeg.text} ${textOf(run)}`;
      } else {
        pendingPrefix = pendingPrefix ? `${pendingPrefix} ${textOf(run)}` : textOf(run);
      }
    }
  }
  // Borde: todo sin match y sin hueco (no debería ocurrir con MIN_WINDOW bajo)
  if (pendingPrefix && result.length === 0) {
    const vo = voiceoverSegments[0];
    result.push({ index: 0, start: vo.start, end: vo.end, text: pendingPrefix });
  }

  return result.map((s, i) => ({ ...s, index: i + 1 }));
}

/**
 * Serialize aligned segments to standard SRT format.
 * Each block: index, "HH:MM:SS,mmm --> HH:MM:SS,mmm", text, blank line.
 */
export function toSRT(segments: AlignedSegment[]): string {
  return segments
    .map((s) => {
      const start = formatTimestamp(s.start);
      const end = formatTimestamp(s.end);
      return `${s.index}\n${start} --> ${end}\n${s.text}`;
    })
    .join('\n\n');
}

/** Parse an SRT string back into segments (for testing round-trips). */
export function parseSRT(srt: string): AlignedSegment[] {
  const blocks = srt.trim().split(/\r?\n\r?\n/);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const index = parseInt(lines[0], 10);
    const [startStr, endStr] = lines[1].split(' --> ');
    const start = parseTimestamp(startStr);
    const end = parseTimestamp(endStr);
    const text = lines.slice(2).join('\n');
    return { index, start, end, text };
  });
}

// --- Timestamp helpers ---

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return (
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0') +
    ',' +
    String(ms).padStart(3, '0')
  );
}

function parseTimestamp(ts: string): number {
  const [h, m, rest] = ts.split(':');
  const [s, ms] = rest.split(',');
  return (
    parseInt(h, 10) * 3600 +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(ms, 10) / 1000
  );
}

// --- Chunking estilo CapCut -------------------------------------------------

export interface ChunkOptions {
  maxChars?: number; // máximo de caracteres visibles por bloque de subtítulo
}

/**
 * Trocea segmentos alineados en bloques cortos que se van refrescando con la
 * voz (estilo CapCut), en vez de un párrafo largo estático. Empaqueta palabras
 * sin romperlas hasta maxChars y reparte el tiempo de cada segmento de forma
 * proporcional a la longitud de cada bloque. Reindexa 1..n (formato SRT).
 */
export function chunkSegments(
  segments: AlignedSegment[],
  options: ChunkOptions = {},
): AlignedSegment[] {
  const maxChars = options.maxChars ?? 42;
  const out: AlignedSegment[] = [];

  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const chunks: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);

    const duration = seg.end - seg.start;
    const totalChars = chunks.reduce((n, c) => n + c.length, 0);
    let t = seg.start;
    for (const chunk of chunks) {
      const dt = totalChars > 0 ? (duration * chunk.length) / totalChars : 0;
      out.push({ index: 0, start: t, end: t + dt, text: chunk });
      t += dt;
    }
  }

  return out.map((s, i) => ({ ...s, index: i + 1 }));
}
