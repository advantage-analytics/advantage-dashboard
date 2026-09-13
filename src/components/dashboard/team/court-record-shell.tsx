import { COURT_RECORD_WINDOW } from "@/lib/data/team-court-record";

/**
 * The court record's geometry — the server-safe half, on the pattern
 * `shared/kpi-tile.tsx` and `home/kpi-strip-empty.tsx` set: what both the
 * populated grid (`court-record-mosaic.tsx`, a client component) and the ghost
 * (`court-record.tsx`, a server component) draw from, so neither reaches
 * through the other's module for a constant.
 *
 * **Why twelve columns, and why 20/4.** A column carries a 9px date — the
 * type scale's floor — and "3/14" at 9px is ~23px wide, so every column is
 * 24px: a 20px cell and a 4px gutter. The gutter is a fifth of the cell,
 * which is what keeps a column reading as one surface — a lost Saturday is a
 * band down the grid, and that band is the reason this is a mosaic rather
 * than six bars; at 6px the cells came apart into dots. Twelve is what fills
 * the rail: a 400px card less its padding is 360px, the slot and record
 * tracks take 64, and twelve 24px columns take 292 (settled 2026-09-07 on
 * the "Team Home Layouts" canvas, Grain sheet).
 */
export const COURT_RECORD_COLS = `26px repeat(${COURT_RECORD_WINDOW}, 20px) 38px`;

/** A column the season has not reached — the same cell a sat-out court draws. */
export function EmptyCell() {
  return (
    <span
      aria-hidden="true"
      className="size-5 rounded-[var(--radius-cell)]"
      style={{ background: "var(--viz-heatmap-0)" }}
    />
  );
}
