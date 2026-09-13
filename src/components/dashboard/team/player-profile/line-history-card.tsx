import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import {
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { recordLabel, type LineRow } from "@/lib/data/player-profile";

/** Exported for the day-zero ghost, which draws these columns empty. */
export const LINE_GRID = "grid-cols-[32px_1fr_76px_56px]";

export function LineHistoryHeader() {
  return (
    <div
      className={`grid ${LINE_GRID} gap-2.5 border-b border-[var(--border-hairline)] pb-2`}
    >
      <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
        #
      </span>
      <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
        Form
      </span>
      <span
        className="eyebrow-sm text-right"
        style={{ color: "var(--ink-400)" }}
      >
        Record
      </span>
      <span
        className="eyebrow-sm text-right"
        style={{ color: "var(--ink-400)" }}
      >
        Win %
      </span>
    </div>
  );
}

/**
 * The season by line — how this player does at S3, at S2, at D1.
 *
 * A match counts for the line its schedule entry names; an unscheduled
 * upload counts for none, so a player whose matches were all filed by hand
 * sees the card's own shape empty — the header over three ghost rows, the
 * way the serve card shows its empty court — with one sentence saying what
 * fills it. The frame's "Season" link is not drawn: there is no per-line
 * page for it to open.
 */
/**
 * One grey rule per column, exported with the grid and the header so the
 * page's day zero draws this card's ghost from the card's own definition.
 * They were separate lists for a week and had already drifted to two fade
 * ramps for one card.
 */
export const LINE_GHOST_RULES: readonly React.ComponentProps<
  typeof GhostRule
>[] = [
  { width: "20px" }, // #
  { width: "34px" }, // Form
  { width: "70%" }, // Record
  { width: "60%" }, // Win %
];

/** Three rows is enough to read as a table; a fourth is just more grey. */
const GHOST_ROW_COUNT = 3;

export function LineHistoryGhostRows({
  opacities,
}: {
  opacities: readonly number[];
}) {
  return (
    <>
      {opacities.map((opacity) => (
        <div
          key={opacity}
          className={`grid ${LINE_GRID} h-11 items-center gap-2.5`}
          style={{ opacity }}
          aria-hidden="true"
        >
          {LINE_GHOST_RULES.map((rule, i) => (
            <span
              key={i}
              className={`flex items-center${i >= 2 ? "justify-end" : ""}`}
            >
              <GhostRule {...rule} />
            </span>
          ))}
        </div>
      ))}
    </>
  );
}

export function LineHistoryCard({ lines }: { lines: LineRow[] }) {
  return (
    <section
      aria-label="Line history"
      className="surface-card flex flex-col gap-0.5"
      style={{ padding: 20 }}
    >
      <div className="flex items-center gap-2.5 pb-3">
        <span className="eyebrow">Line history</span>
      </div>

      <LineHistoryHeader />

      {lines.length === 0 ? (
        <>
          {/* Half the page-wide day zero's fade: this ghost sits on a page
              that is otherwise real, so it must read as one quiet region
              rather than compete with the cards beside it. */}
          <div inert>
            <LineHistoryGhostRows
              opacities={GHOST_OPACITY.slice(0, GHOST_ROW_COUNT).map(
                (o) => o * 0.5,
              )}
            />
          </div>
          <span className="text-micro pt-3" style={{ textWrap: "pretty" }}>
            Lines fill in as matches are played on the schedule — a dual&rsquo;s
            S1 to S6 and D1 to D3, or a tournament draw.
          </span>
        </>
      ) : (
        <>
          {lines.map((line) => (
            <div
              key={line.slot}
              className={`grid ${LINE_GRID} h-11 items-center gap-2.5`}
            >
              <span className="mono text-[11px] text-[var(--ink-700)]">
                {line.slot}
              </span>
              <span className="flex items-center">
                <FormTicks form={line.form} />
              </span>
              <span className="tabular text-right text-[12px] text-[var(--ink-900)]">
                {recordLabel(line.wins, line.losses)}
              </span>
              <span className="tabular text-right text-[12px] text-[var(--ink-700)]">
                {line.winPct === null ? "—" : `${line.winPct}%`}
              </span>
            </div>
          ))}
          <span className="pt-3 text-[10px] text-[var(--ink-400)]">
            Form is the last five at that line, oldest left
          </span>
        </>
      )}
    </section>
  );
}
