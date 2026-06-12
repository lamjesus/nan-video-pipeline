// Pure SRT parser: converts SRT subtitle content to structured entries.
// No I/O, no side effects — fully testable.

export interface SrtEntry {
  index: number;
  start: number; // seconds
  end: number; // seconds
  text: string;
}

const SRT_ENTRY_RE = /(\d+)\n(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})\n([\s\S]+)/;

/**
 * Parses an SRT subtitle string into an array of SrtEntry objects.
 * Returns [] for empty or malformed input (no crash).
 */
export function parseSrt(srtContent: string): SrtEntry[] {
  if (!srtContent || !srtContent.trim()) return [];

  // Split on double newlines to get individual blocks
  const blocks = srtContent.split(/\n\n+/);
  const entries: SrtEntry[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const match = SRT_ENTRY_RE.exec(trimmed);
    if (match) {
      const index = parseInt(match[1], 10);
      const start = timestampToSeconds(match[2]);
      const end = timestampToSeconds(match[3]);
      const text = match[4].trim();

      if (!Number.isNaN(index) && !Number.isNaN(start) && !Number.isNaN(end)) {
        entries.push({ index, start, end, text });
      }
    }
  }

  return entries;
}

/**
 * Converts seconds to SRT timestamp format "HH:MM:SS,mmm".
 */
export function formatTimestamp(seconds: number): string {
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

function timestampToSeconds(ts: string): number {
  const [h, m, rest] = ts.split(':');
  const [s, ms] = rest.split(',');
  return (
    parseInt(h, 10) * 3600 +
    parseInt(m, 10) * 60 +
    parseInt(s, 10) +
    parseInt(ms, 10) / 1000
  );
}
