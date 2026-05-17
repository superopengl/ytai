// Fixed palette of named colors Brain picks from when calling
// draw_annotation. Named (not hex) so Brain can naturally narrate
// "highlighted in yellow" and so the server can dedupe usage across a
// session by name. The hex values are kid-friendly highlighter tones,
// readable over a white worksheet without overwhelming the printed text.

const ANNOTATION_PALETTE = Object.freeze({
  yellow: '#ffd60a',
  pink: '#ec4899',
  green: '#22c55e',
  blue: '#3aa0ff',
  orange: '#f97316',
  purple: '#a855f7',
  cyan: '#06b6d4',
  red: '#ef4444'
});

export const ANNOTATION_COLOR_NAMES = Object.freeze(Object.keys(ANNOTATION_PALETTE));

export function resolveAnnotationColor(name) {
  if (!name || typeof name !== 'string') return null;
  return ANNOTATION_PALETTE[name.toLowerCase()] || null;
}

export default ANNOTATION_PALETTE;
