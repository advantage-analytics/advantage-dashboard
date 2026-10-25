/**
 * How the console takes an Undo's answer (undo-session.ts): a diff, not the
 * session. `changed` points replace the console's rows of the same id — or
 * join them, for a point the rewind re-inserted — `removedPointIds` leave,
 * and the rows go back into the rail's order, `point_index` then id, the
 * order the server reads them in. Pure, so the console spec can run it over
 * the fixture; the console recomputes everything else (scores, marks, locks)
 * from the merged rows as it does after any edit.
 *
 * An undone split or combine moves strokes between two points: both come
 * back in `changed`, each rebuilt whole with the shots it now owns, so a
 * stroke never appears under two points or none.
 */

import type { LabelPoint } from "./session";

export function applyUndoDiff(
  rows: readonly LabelPoint[],
  changed: readonly LabelPoint[],
  removedPointIds: readonly string[],
): LabelPoint[] {
  const removed = new Set(removedPointIds);
  const replacement = new Map(changed.map((point) => [point.id, point]));
  const merged: LabelPoint[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (removed.has(row.id)) continue;
    merged.push(replacement.get(row.id) ?? row);
    seen.add(row.id);
  }
  for (const point of changed) {
    if (seen.has(point.id) || removed.has(point.id)) continue;
    merged.push(point);
    seen.add(point.id);
  }
  return merged.sort(
    (a, b) =>
      a.pointIndex - b.pointIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
