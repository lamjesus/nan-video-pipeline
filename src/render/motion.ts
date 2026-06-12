// Pure keyword matcher: maps free-form Spanish motion strings to GSAP presets.
// No I/O, no side effects — fully testable.
//
// Order matters: "zoom-out" must be checked before "zoom" to avoid false match.

export type MotionPreset =
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'shake'
  | 'pan-slow'
  | 'static';

/**
 * Resolves a free-form Spanish motion string to a GSAP motion preset.
 * Keyword matching is case-insensitive, first match wins.
 */
export function resolveMotion(motionString: string): MotionPreset {
  const s = motionString.toLowerCase();

  // Check "zoom-out" before "zoom" — first match wins
  if (s.includes('zoom-out')) return 'zoom-out';
  if (s.includes('zoom') || s.includes('escala')) return 'zoom-in';
  if (s.includes('pan')) return 'pan-left';
  if (s.includes('shake')) return 'shake';
  if (s.includes('deriva') || s.includes('drift')) return 'pan-slow';

  return 'static';
}
