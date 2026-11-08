/**
 * A segment's fill as diagonal stripes of `color` over a lighter wash of
 * itself — the related-segment mark the Statistics tab's stacked bars share
 * (`point-endings-card.tsx`, `net-game-card.tsx`). Solid where a segment
 * stands alone.
 */
export function hatch(color: string): string {
  return `repeating-linear-gradient(135deg, ${color} 0 2px, color-mix(in srgb, ${color} 40%, transparent) 2px 4px)`;
}
