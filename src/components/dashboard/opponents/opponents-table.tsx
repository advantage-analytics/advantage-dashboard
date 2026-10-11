import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import { EmptyMark } from "@/components/ui/empty-mark";
import type { PersonalOpponent } from "@/lib/data/personal-opponents";
import { formatShortDate } from "@/lib/ui/date-format";
import { playedSets } from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";
import { opponentBackhandLabel, opponentHandLabel } from "./opponent-style";
import {
  OPPONENTS_CARD_PADDING,
  OPPONENTS_COLUMNS,
  OPPONENTS_GRID_COLS,
  OPPONENTS_MIN_WIDTH,
  OPPONENTS_ROW_BOX,
  OPPONENTS_ROW_FRAME,
} from "./opponents-table-layout";

/** How many ticks the Form cell holds — the grouping's own five-match window. */
const FORM_SLOTS = 5;

/**
 * The personal Opponents table: one card, eight tracks, a 52px row per
 * opponent (`reference/tables.md` law 9 — a hairline under the header only,
 * none between rows, and the hover wash as the row's boundary).
 *
 * An opponent is a CONTAINER row (law 3): it will peek in a drawer rather than
 * travel, so it carries no chevron. The name is the row's one control — a
 * `<button aria-pressed>` — so the selection has somewhere to live for a
 * keyboard and a screen reader; the click that sets it arrives with the
 * drawer, and until then the row draws no pointer cursor it cannot honour.
 *
 * Every cell that can be unknown draws the one `EmptyMark`, on the same x as
 * the column's real values — a hand nobody recorded, a meeting with no score,
 * an outcome nobody is yet known to have won.
 */
export function OpponentsTable({
  opponents,
  selectedKey,
}: {
  opponents: readonly PersonalOpponent[];
  /** `PersonalOpponent.key` of the row the drawer is showing, if any. */
  selectedKey: string | null;
}) {
  return (
    <section
      aria-label="Opponents"
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
          {opponents.map((opponent) => (
            <OpponentRow
              key={opponent.key}
              opponent={opponent}
              selected={opponent.key === selectedKey}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function OpponentRow({
  opponent,
  selected,
}: {
  opponent: PersonalOpponent;
  selected: boolean;
}) {
  const hand = opponentHandLabel(opponent.hand);
  const backhand = opponentBackhandLabel(opponent.backhand);
  const { lastMatch } = opponent;
  const sets = playedSets(lastMatch.sets);

  return (
    <div
      className={cn(
        OPPONENTS_ROW_FRAME,
        OPPONENTS_ROW_BOX,
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]",
        selected && "bg-[var(--surface-muted)]",
      )}
      style={OPPONENTS_GRID_COLS}
    >
      {/* Opponent — the name a reader scans for, and the row's one control. */}
      <button
        type="button"
        aria-pressed={selected}
        className="min-w-0 truncate rounded-[var(--radius-cell)] text-left text-[13px] font-medium text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        {opponent.name}
      </button>

      {/* Hand, Backhand — the noun is in the header, the qualifier in the cell. */}
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
        {hand ?? <EmptyMark label="Hand not recorded" />}
      </span>
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
        {backhand ?? <EmptyMark label="Backhand not recorded" />}
      </span>

      {/* Record — the viewer's wins, then losses. An undecided meeting is in
          neither figure, which is why the two need not sum to `played`. */}
      <span className="tabular text-[13px] text-[var(--ink-900)]">
        <span aria-hidden="true">
          {opponent.wins}-{opponent.losses}
        </span>
        <span className="sr-only">
          {opponent.wins} won, {opponent.losses} lost
        </span>
      </span>

      {/* Form — the last five meetings, oldest at the left. */}
      <span className="flex items-center">
        <FormTicks form={opponent.form} slots={FORM_SLOTS} />
      </span>

      {/* Last match — the stored date, formatted here. */}
      <span className="tabular text-[12px] whitespace-nowrap text-[var(--ink-700)]">
        {lastMatch.date ? (
          formatShortDate(lastMatch.date)
        ) : (
          <EmptyMark label="No date" />
        )}
      </span>

      {/* Result — the glyph, or the dash on the same x when nobody is yet
          known to have won. `ResultMark`'s own null means a level dual, which
          a singles match cannot be, so null never reaches it. */}
      <span className="flex items-center">
        {lastMatch.won === null ? (
          <EmptyMark label="No result yet" />
        ) : (
          <ResultMark won={lastMatch.won} />
        )}
      </span>

      {/* Score — the shared score line, tiebreaks raised. */}
      {sets.length > 0 ? (
        <ScoreLine
          sets={sets}
          className="min-w-0 truncate text-[13px] text-[var(--ink-900)]"
        />
      ) : (
        <span>
          <EmptyMark label="No score" />
        </span>
      )}
    </div>
  );
}
