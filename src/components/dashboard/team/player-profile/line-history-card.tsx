import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import {
  DayZeroShape,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { recordLabel, type LineRow } from "@/lib/data/player-profile";
import {
  CARD_GHOST_ROWS,
  WidgetEmptyBand,
  type WidgetEmptyCopy,
} from "./widget-empty";

const LINE_GRID = "grid-cols-[32px_1fr_76px_56px]";

function LineHistoryHeader() {
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
 * sees the card's own shape empty — the header over grey rows, then the
 * page's band saying what fills it (`WidgetEmptyBand`). The frame's "Season"
 * link is not drawn: there is no per-line page for it to open.
 */
export function LineHistoryCard({
  lines,
  empty,
}: {
  lines: LineRow[];
  empty: WidgetEmptyCopy;
}) {
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
          <DayZeroShape description="No lines yet: this card lists each line this player has played, with recent form, record and win rate.">
            {CARD_GHOST_ROWS.map((opacity) => (
              <div
                key={opacity}
                className={`grid ${LINE_GRID} h-11 items-center gap-2.5`}
                style={{ opacity }}
              >
                <GhostRule width="20px" />
                <GhostRule width="34px" />
                <span className="flex justify-end">
                  <GhostRule width="70%" tone="200" shape="tall" />
                </span>
                <span className="flex justify-end">
                  <GhostRule width="60%" />
                </span>
              </div>
            ))}
          </DayZeroShape>
          <WidgetEmptyBand {...empty} />
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
