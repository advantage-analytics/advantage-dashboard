import Link from "next/link";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import {
  DayZeroShape,
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_COLUMNS,
  OPPONENTS_GRID_COLS,
  OPPONENTS_MIN_WIDTH,
  OPPONENTS_PAGE_COLUMN,
  OPPONENTS_PAGE_FRAME,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
} from "./opponents-table-layout";
import { OpponentsToolbarStatic } from "./opponents-toolbar";

/**
 * Opponents on the day the account holds nobody to list: the shared offer,
 * over the page this will become — `matches-day-zero.tsx`'s composition
 * (`reference/tables.md` → Table page states).
 *
 * One sentence and one action. An opponent is not something a player adds;
 * they arrive with a match, so the action is "New match" and nothing else.
 * Below it the page's own shape at 0.32 and `inert`: the toolbar at rest and
 * the table card carrying its eight real column labels over five ghost rows.
 * The labels are the honest payload — Hand · Backhand · Record · Form says
 * what an opponent's row becomes with no figure invented — and the rows are
 * the shape of one, each value replaced by a rule.
 *
 * No title row: the offer carries the page's one primary, and the title
 * returns with the first opponent.
 *
 * The grid, the labels and the row box come from `opponents-table-layout` by
 * import, so a moved track cannot leave the ghost table standing in for an
 * earlier one.
 */

type Rule = React.ComponentProps<typeof GhostRule>;

/**
 * One rule per track, in `OPPONENTS_COLUMNS` order. Opponent is the fluid
 * track, so its rule is a fixed width — a percentage of a column that takes
 * the page's slack would draw a name 300px long on a wide screen. Form is the
 * five-tick strip's footprint; Result is `ResultMark`'s 14px dot.
 */
const ROW_RULES: readonly Rule[] = [
  { width: "128px", tone: "200", shape: "tall" }, // Opponent — the name
  { width: "76%" }, // Hand
  { width: "72%" }, // Backhand
  { width: "46%" }, // Record
  { width: "25px" }, // Form
  { width: "58%" }, // Last match
  { width: "14px", shape: "dot" }, // Result
  { width: "62%" }, // Score
];

function GhostRow({ opacity }: { opacity: number }) {
  return (
    <div
      className={cn(OPPONENTS_ROW_FRAME, OPPONENTS_ROW_BOX)}
      style={{ ...OPPONENTS_GRID_COLS, opacity }}
      aria-hidden="true"
    >
      {ROW_RULES.map((rule, i) => (
        <GhostRule key={i} {...rule} />
      ))}
    </div>
  );
}

export function OpponentsDayZero() {
  return (
    <div className={OPPONENTS_PAGE_FRAME}>
      <div className={OPPONENTS_PAGE_COLUMN}>
        <div className="flex flex-1 flex-col gap-4">
          <DayZeroOffer
            headline="Everyone you play is kept here."
            headlineMeasure="30ch"
            actions={
              <Link
                href="/dashboard/matches/new"
                className={advButton("primary")}
              >
                New match
              </Link>
            }
          />

          <DayZeroShape
            description="Once you have a match against a named opponent this page lists each one with their hand, backhand, your record against them, recent form and your last match. Nothing below is real data yet."
            className="flex flex-col gap-3"
          >
            <OpponentsToolbarStatic />

            {/* The populated table's own card, holding nothing: the same
                inset, a hairline under the header only, none between rows. */}
            <div
              className="surface-card overflow-x-auto"
              style={{ padding: OPPONENTS_CARD_PADDING }}
            >
              <div className={OPPONENTS_MIN_WIDTH}>
                <div
                  className={cn(
                    OPPONENTS_ROW_FRAME,
                    "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
                  )}
                  style={OPPONENTS_GRID_COLS}
                >
                  {OPPONENTS_COLUMNS.map((label) => (
                    <span key={label} className="eyebrow-sm min-w-0 truncate">
                      {label}
                    </span>
                  ))}
                </div>
                <div>
                  {GHOST_OPACITY.map((opacity) => (
                    <GhostRow key={opacity} opacity={opacity} />
                  ))}
                </div>
              </div>
            </div>
          </DayZeroShape>
        </div>
      </div>
    </div>
  );
}
