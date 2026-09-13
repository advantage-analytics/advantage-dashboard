import type { EventTeamTotals, SideTotals } from "@/lib/data/event-team-totals";

/**
 * T6 — the rail's "Team totals" card: four rows, each a two-segment bar split
 * between the program's side and the opponent's.
 *
 * Server-renderable, same register as `TableCard`/`GroupHead`
 * (`event-page.tsx`) — an `eyebrow` label, a right-aligned `--ink-500` header,
 * then rows. This file owns no data fetch: `totals` and `coverage` arrive
 * fully computed (`sumTeamTotals` in `event-team-totals.ts`), so day one
 * (`totals: null`) and a normal weekend are the same render, not two layouts.
 *
 * Blue (`--blue`) for our segment, slate (`--ink-500` at full opacity read as
 * "theirs") for the opponent's — the only non-ink colour in the card, matching
 * `event-page.tsx`'s "one blue in the file" discipline (theirs is `#64748B`
 * per the design intent, not a token in `colors.css`; not `--ink-*`, which
 * carries no slate-blue hue).
 */
export function TeamTotalsWidget({
  totals,
  coverage,
}: {
  totals: EventTeamTotals | null;
  coverage: { analyzed: number; total: number };
}) {
  return (
    <div className="surface-card min-w-0 px-5 pt-4 pb-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">Team totals</span>
        <span className="text-[12px]" style={{ color: "var(--ink-500)" }}>
          {coverage.analyzed} of {coverage.total} lines
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <TotalRow
          label="First serve in"
          ours={totals?.ours.firstServeInPct ?? null}
          theirs={totals?.theirs.firstServeInPct ?? null}
          format={formatPct}
        />
        <TotalRow
          label="1st-serve points won"
          ours={totals?.ours.firstServeWonPct ?? null}
          theirs={totals?.theirs.firstServeWonPct ?? null}
          format={formatPct}
        />
        <BreakPointRow
          ours={totals?.ours.breakPoints ?? null}
          theirs={totals?.theirs.breakPoints ?? null}
        />
        <TotalRow
          label="Points won"
          ours={totals?.ours.pointsWonPct ?? null}
          theirs={totals?.theirs.pointsWonPct ?? null}
          format={formatPct}
        />
      </div>
    </div>
  );
}

function formatPct(value: number): string {
  return `${Math.round(value)}%`;
}

/**
 * A row's label, its two values, and the 4px bar underneath — the unit every
 * row below builds on. `ours`/`theirs` are `null` together (nothing measured)
 * or both numbers; a caller with a fraction (`BreakPointRow`) converts to a
 * comparable pair itself and hands this the numbers to draw.
 */
function TotalRow({
  label,
  ours,
  theirs,
  format,
}: {
  label: string;
  ours: number | null;
  theirs: number | null;
  format: (value: number) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span style={{ color: "var(--ink-700)" }}>{label}</span>
        <span className="tabular flex items-baseline gap-2">
          <span className="font-medium" style={{ color: "var(--ink-900)" }}>
            {ours === null ? "—" : format(ours)}
          </span>
          <span style={{ color: "var(--ink-600)" }}>
            {theirs === null ? "—" : format(theirs)}
          </span>
        </span>
      </div>
      <SplitBar ours={ours} theirs={theirs} />
    </div>
  );
}

function BreakPointRow({
  ours,
  theirs,
}: {
  ours: SideTotals["breakPoints"];
  theirs: SideTotals["breakPoints"];
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span style={{ color: "var(--ink-700)" }}>Break points</span>
        <span className="tabular flex items-baseline gap-2">
          <span className="font-medium" style={{ color: "var(--ink-900)" }}>
            {ours === null ? "—" : `${ours.converted}/${ours.opportunities}`}
          </span>
          <span style={{ color: "var(--ink-600)" }}>
            {theirs === null
              ? "—"
              : `${theirs.converted}/${theirs.opportunities}`}
          </span>
        </span>
      </div>
      <SplitBar
        ours={ours === null ? null : ours.converted}
        theirs={theirs === null ? null : theirs.converted}
      />
    </div>
  );
}

/**
 * The 4px two-segment track: blue from the left for `ours`, slate from the
 * right for `theirs`, widths proportional to the two values. Either value
 * `null`, or both zero, draws an empty hairline track — there is nothing to
 * split.
 */
function SplitBar({
  ours,
  theirs,
}: {
  ours: number | null;
  theirs: number | null;
}) {
  const total = (ours ?? 0) + (theirs ?? 0);
  const oursPct =
    ours !== null && theirs !== null && total > 0 ? (ours / total) * 100 : 0;
  const theirsPct =
    ours !== null && theirs !== null && total > 0 ? (theirs / total) * 100 : 0;

  return (
    <div
      className="flex h-[4px] w-full overflow-hidden rounded-full"
      style={{ background: "var(--ink-100)" }}
    >
      {oursPct > 0 ? (
        <span
          className="h-full"
          style={{ width: `${oursPct}%`, background: "var(--blue)" }}
        />
      ) : null}
      {theirsPct > 0 ? (
        <span
          className="h-full"
          style={{ width: `${theirsPct}%`, background: "#64748B" }}
        />
      ) : null}
    </div>
  );
}
