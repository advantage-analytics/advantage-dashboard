/**
 * Where a cursor-following chart readout sits. Pure, so the placement rule is
 * pinned by `tests/chart-tooltip-position.spec.ts` without rendering anything.
 *
 * Every coordinate is in the bounds' own space (the card's `<section>`), with
 * `(0, 0)` at its top-left. The box's bottom-left corner sits `offset` px above
 * and `offset` px right of the pointer; when that would lift it past the top of
 * the bounds it flips below the pointer instead, and `left` is clamped so the
 * box never runs off either side of the card.
 */
export function positionReadout({
  pointer,
  size,
  bounds,
  offset,
}: {
  pointer: { x: number; y: number };
  size: { width: number; height: number };
  bounds: { width: number; height: number };
  offset: number;
}): { left: number; top: number } {
  const above = pointer.y - size.height - offset;
  const top = above < 0 ? pointer.y + offset : above;
  // Upper bound first, so a box wider than the card pins to its left edge.
  const left = Math.max(
    0,
    Math.min(pointer.x + offset, bounds.width - size.width),
  );
  return { left, top };
}
