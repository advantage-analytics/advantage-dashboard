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
  OPPONENTS_GRID_COLS,
  OPPONENTS_MIN_WIDTH,
  OPPONENTS_PAGE_COLUMN,
  OPPONENTS_PAGE_FRAME,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
  TEAM_OPPONENTS_GRID_COLS,
  TEAM_OPPONENTS_MIN_WIDTH,
  type OpponentsScope,
} from "./opponents-table-layout";
import { OpponentsTableHeader } from "./opponents-table-header";
import { OpponentsToolbarStatic } from "./opponents-toolbar";

/**
 * Opponents on the day the account holds nobody to list: the shared offer,
 * over the page this will become — `matches-day-zero.tsx`'s composition
 * (`reference/tables.md` → Table page states).
 *
 * One sentence and one action. An opponent is not something a player adds;
 * they arrive with a match, so the action is "New match" and nothing else.
 * Below it the page's own shape at 0.32 and `inert`: the toolbar at rest and
 * the table card carrying its four real column labels over five ghost rows.
 * The labels are the honest payload — Plays · Record · Last match says what
 * an opponent's row becomes with no figure invented — and the rows are the
 * shape of one, each value replaced by a rule.
 *
 * No title row: the offer carries the page's one primary, and the title
 * returns with the first opponent.
 *
 * The grid, the labels and the row box come from `opponents-table-layout` by
 * import, so a moved track cannot leave the ghost table standing in for an
 * earlier one.
 *
 * `scope="team"` is the same composition over the team table's six tracks,
 * with the team's words: the sentence is about the program, never "you", and
 * the action is still "New match".
 */

type Rule = React.ComponentProps<typeof GhostRule>;

/**
 * One rule per track, in `OPPONENTS_COLUMNS` order. Opponent is the fluid
 * track, so its rule is a fixed width — a percentage of a column that takes
 * the page's slack would draw a name 300px long on a wide screen. The other
 * three are shares of fixed tracks — the team ghost's own shares for the same
 * three cells, since the tracks are the same widths.
 */
const ROW_RULES: readonly Rule[] = [
  { width: "128px", tone: "200", shape: "tall" }, // Opponent — the name
  { width: "62%" }, // Plays
  { width: "64%" }, // Record — the figure and its ticks
  { width: "72%" }, // Last match — date, result and score
];

/**
 * One rule per track, in `TEAM_OPPONENTS_COLUMNS` order. Only Opponent is
 * fluid, so only its rule is a fixed width; the other five are shares of
 * bounded tracks.
 */
const TEAM_ROW_RULES: readonly Rule[] = [
  { width: "128px", tone: "200", shape: "tall" }, // Opponent — the name
  { width: "70%" }, // Program
  { width: "48%" }, // Faced by
  { width: "62%" }, // Plays
  { width: "64%" }, // Record — the figure and its ticks
  { width: "72%" }, // Last match — date, result and score
];

function GhostRow({
  opacity,
  scope,
}: {
  opacity: number;
  scope: OpponentsScope;
}) {
  const team = scope === "team";
  return (
    <div
      className={cn(OPPONENTS_ROW_FRAME, OPPONENTS_ROW_BOX)}
      style={{
        ...(team ? TEAM_OPPONENTS_GRID_COLS : OPPONENTS_GRID_COLS),
        opacity,
      }}
      aria-hidden="true"
    >
      {(team ? TEAM_ROW_RULES : ROW_RULES).map((rule, i) => (
        <GhostRule key={i} {...rule} />
      ))}
    </div>
  );
}

/** What the dimmed shape below the offer is, said once for a screen reader. */
const SHAPE_DESCRIPTION: Record<OpponentsScope, string> = {
  personal:
    "Once you have a match against a named opponent this page lists each one with how they play, your record against them and your last match. Nothing below is real data yet.",
  team: "Once the team has a match against a named opponent this page lists each one with their program, who on the roster faced them, how they play, the team's record against them and the last match. Nothing below is real data yet.",
};

export function OpponentsDayZero({
  unnamedMatches = 0,
  scope = "personal",
}: {
  /** Which page this is the day zero of; the team's words name the program. */
  scope?: OpponentsScope;
  /**
   * Matches the account has that name no opponent. With any, this is not an
   * empty account: the offer says what is missing instead of inviting a first
   * match, and sends the reader to the list where the names can be added.
   */
  unnamedMatches?: number;
}) {
  const team = scope === "team";
  // The team loader does not count unnamed matches, so the team offer is
  // always the invitation to a first match.
  const hasUnnamed = !team && unnamedMatches > 0;
  return (
    <div className={OPPONENTS_PAGE_FRAME}>
      <div className={OPPONENTS_PAGE_COLUMN}>
        <div className="flex flex-1 flex-col gap-4">
          <DayZeroOffer
            headline={
              hasUnnamed
                ? unnamedMatches === 1
                  ? "Your match does not name an opponent yet."
                  : `None of your ${unnamedMatches} matches name an opponent yet.`
                : team
                  ? "Everyone the team plays is kept here."
                  : "Everyone you play is kept here."
            }
            headlineMeasure="30ch"
            actions={
              hasUnnamed ? (
                <Link
                  href="/dashboard/matches"
                  className={advButton("primary")}
                >
                  View matches
                </Link>
              ) : (
                <Link
                  href="/dashboard/matches/new"
                  className={advButton("primary")}
                >
                  New match
                </Link>
              )
            }
          />

          <DayZeroShape
            description={SHAPE_DESCRIPTION[scope]}
            className="flex flex-col gap-3"
          >
            <OpponentsToolbarStatic />

            {/* The populated table's own card, holding nothing: the same
                inset, a hairline under the header only, none between rows. */}
            <div
              className="surface-card overflow-x-auto"
              style={{ padding: OPPONENTS_CARD_PADDING }}
            >
              <div
                className={
                  team ? TEAM_OPPONENTS_MIN_WIDTH : OPPONENTS_MIN_WIDTH
                }
              >
                <OpponentsTableHeader scope={scope} />
                <div>
                  {GHOST_OPACITY.map((opacity) => (
                    <GhostRow key={opacity} opacity={opacity} scope={scope} />
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
