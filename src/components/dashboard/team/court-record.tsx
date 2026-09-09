import { DayZeroShape } from "@/components/dashboard/home/day-zero-shape";
import { CardFooter } from "@/components/dashboard/shared/card-footer";
import { CourtRecordMosaic } from "@/components/dashboard/team/court-record-mosaic";
import {
  COURT_RECORD_COLS,
  EmptyCell,
} from "@/components/dashboard/team/court-record-shell";
import {
  COURT_RECORD_WINDOW,
  type CourtRecord,
} from "@/lib/data/team-court-record";

/**
 * Court record — the season's singles results as a mosaic, in Team Home's
 * rail between the Focus card and the dual history (settled 2026-09-07 on
 * the "Team Home Layouts" canvas, Grain sheet: 20px cells, 4px gutter).
 *
 * The geometry — the 20px cell, the 4px gutter, why twelve columns — is
 * `court-record-shell.tsx`'s, with its reasons.
 *
 * **Painted with the DS's own ramp.** `--viz-heatmap-3` for a win, `-1` for a
 * loss, `-0` for a court that did not play — the same three steps the
 * personal Home's Activity heatmap draws with, so the product's two grids of
 * cells are one species. Not success/danger: fifty-four saturated cells is
 * more colour than the dual card's score, and the pattern — the whole point
 * — is what disappears for a deuteranope when adjacent cells share a
 * lightness. The ramp separates on lightness.
 *
 * **One width in every state.** The grid is always `COURT_RECORD_WINDOW`
 * columns — the number that fills the rail — with the season's duals from
 * the left and empty columns after them. A four-dual season and a twelve-dual
 * one draw the same card, and day zero draws the same card with every column
 * empty: the coach learns one shape and watches it fill from the left.
 *
 * This file is the server shell — card, header, footer, the day-zero ghost.
 * The grid and its hover box are `court-record-mosaic.tsx`, the client half.
 */

export function CourtRecord({ record }: { record: CourtRecord }) {
  const { columns, dualsPlayed } = record;
  const hasResults = columns.length > 0;

  return (
    <section aria-label="Court record" className="surface-card p-5">
      {/* No header link. The Focus card directly above already says "Open
          Statistics", and the only other true destination — the schedule —
          is the history card's "All duals" directly below. A third link that
          repeats either is the rail saying one thing twice; each column is
          one click away through that card instead. */}
      <div className="flex items-center gap-2.5">
        <span className="eyebrow">Court record</span>
      </div>

      {hasResults ? (
        <CourtRecordMosaic record={record} />
      ) : (
        <DayZeroShape description="No singles result yet." className="mt-3.5">
          <GhostMosaic />
        </DayZeroShape>
      )}

      <CardFooter
        className="mt-3"
        left={
          hasResults ? (
            <>
              {dualsPlayed > columns.length ? "Last " : ""}
              <span className="tabular">{columns.length}</span>{" "}
              {columns.length === 1 ? "dual" : "duals"} · singles only
            </>
          ) : (
            "Fills in court by court after the first dual"
          )
        }
      />
    </section>
  );
}

/** The populated grid's exact shape with nothing in it: six rows of the window's empty columns. */
function GhostMosaic() {
  return (
    <div className="flex flex-col gap-[5px] pt-[19px]">
      {Array.from({ length: 6 }, (_, row) => (
        <div
          key={row}
          className="grid items-center gap-1"
          style={{ gridTemplateColumns: COURT_RECORD_COLS }}
        >
          <span className="text-[11px] text-[var(--ink-500)]">S{row + 1}</span>
          {Array.from({ length: COURT_RECORD_WINDOW }, (_, col) => (
            <EmptyCell key={col} />
          ))}
          <span className="h-1.5 w-5 justify-self-end rounded-[1px] bg-[var(--ink-100)]" />
        </div>
      ))}
    </div>
  );
}
