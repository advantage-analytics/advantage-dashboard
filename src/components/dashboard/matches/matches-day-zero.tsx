"use client";

import { Fragment } from "react";
import { ChevronDown, Search } from "lucide-react";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import { LifecycleChips } from "./lifecycle-chips";
import { LIST_GRID_COLS, LIST_ROW_FRAME } from "./match-card-list";

/**
 * Matches on the day the account holds no match: the same offer Home makes,
 * over the list this page will become.
 *
 * One composition for both day-zero pages. A player who lands on either meets
 * one sentence, one pair of buttons and the same conditions; only the sentence
 * changes — Home's names what the product does, this one names what the page
 * holds. Below it the list's own shape at a third: the lifecycle chips at
 * zero, the toolbar, and the table card carrying its column labels over five
 * ghost rows. The labels are the honest payload — Date · Event · Opponent ·
 * Result · Score says what a report becomes — and the rows are the shape of
 * one, values replaced by rules.
 *
 * Column order and the grid template are read straight from `match-card-list`
 * and `matches-grid`, not restated — this drew the old seven-column
 * Result-first order for a while after the row itself moved to eight tracks
 * (Date leading, Result centred, a trailing lifecycle/actions/chevron group),
 * a drift that only surfaced as a type error where a sibling change dropped
 * `LifecycleChips`'s `counts` prop. Both breaks are fixed together here so the
 * ghost table matches the row it is standing in for, not an earlier one.
 *
 * Five rows, not Home's three. This card is the whole page below the offer,
 * where Home's shares a column with the activity grid, and three rows here
 * left the card a stub under 400px of white.
 *
 * The tail is `inert`, as on Home: at 0.32 its text is far below usable
 * contrast and its chips and sort controls would be invisible tab stops.
 * `inert` removes it from the tab order and the accessibility tree together;
 * the sentence above it says, for anyone not reading with their eyes, what
 * fills the page and that nothing below is real.
 *
 * No title row. This departs from the table-page rule as it stood — "title,
 * primary and footer render identically to the populated page" — and the rule
 * has been rewritten to match (SKILL.md → Table page states, and Personal Home
 * Recipes → Day zero). The one primary is the offer's; a second one top-right
 * would be two on one screen. The title row returns with the first match.
 */

const COLUMNS = ["Date", "Opponent", "Event", "Score", "Result", "", "", ""] as const;

/**
 * Proportional rules for the five columns that carry a value, in
 * `LIST_GRID_COLS` order. Result is a 14px dot — `ResultMark`'s own footprint,
 * flush left where the glyph sits; the three columns after it — lifecycle, the
 * actions lane, the chevron — draw nothing, the same as a settled real row.
 */
const ROW_RULES: readonly { w: string; tone: "200" | "100"; round?: boolean }[] = [
  { w: "70%", tone: "100" }, // Date
  { w: "55%", tone: "200" }, // Opponent — the name, so the tallest, darkest rule
  { w: "60%", tone: "100" }, // Event
  { w: "65%", tone: "100" }, // Score
  { w: "14px", tone: "100", round: true }, // Result — ResultMark's footprint
];

const ROW_OPACITY = [1, 0.8, 0.6, 0.45, 0.3] as const;

function GhostRow({ opacity }: { opacity: number }) {
  return (
    <div className={`${LIST_ROW_FRAME} h-[52px]`} style={{ ...LIST_GRID_COLS, opacity }} aria-hidden="true">
      {ROW_RULES.map((rule, i) => (
        <span
          key={i}
          className={`${rule.round ? "h-3.5 rounded-full" : "h-2 rounded-[2px]"} ${
            rule.tone === "200" ? "bg-[var(--ink-200)]" : "bg-[var(--ink-100)]"
          }${i === 1 ? " h-[9px]" : ""}`}
          style={{ width: rule.w }}
        />
      ))}
      {/* Lifecycle, actions lane, chevron — blank, the same as a settled row. */}
      <span />
      <span />
      <span />
    </div>
  );
}

export function MatchesDayZero() {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <DayZeroOffer headline="Every match you send lands here." headlineMeasure="30ch" />

      <p className="sr-only">
        Once a match is analysed this page lists every report by opponent,
        event and date. Nothing below is real data yet.
      </p>

      <div inert className="flex flex-col gap-3" style={{ opacity: 0.32 }}>
        {/* The toolbar, at rest and at zero. The chips are the real component;
            the three controls beside them are drawn, since a filter panel and
            a sort menu that cannot open have nothing to be. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <LifecycleChips active="all" onSelect={() => {}} />
          <div className="flex items-center gap-2 text-[12px] text-[var(--ink-600)]">
            <span className="flex h-7 items-center gap-1.5 px-2">
              Filters
              <ChevronDown className="size-3 text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span className="flex h-7 items-center gap-1.5 px-2">
              <Search className="size-3.5 text-[var(--ink-500)]" strokeWidth={1.5} aria-hidden="true" />
              Search
            </span>
            <span className="flex h-7 items-center gap-1.5 px-2">
              Newest
              <ChevronDown className="size-3 text-[var(--ink-400)]" strokeWidth={1.5} aria-hidden="true" />
            </span>
          </div>
        </div>

        {/* The populated table's own card: surface-card, 2px 24px 6px, a
            hairline under the header only (`MatchesGrid`). */}
        <div className="surface-card" style={{ padding: "2px 24px 6px" }}>
          <div
            className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pb-2.5 pt-3.5`}
            style={LIST_GRID_COLS}
          >
            {COLUMNS.map((label, i) => (
              <span
                key={label || `col-${i}`}
                className="eyebrow-sm min-w-0 truncate"
              >
                {label}
              </span>
            ))}
          </div>
          <div>
            {ROW_OPACITY.map((opacity, i) => (
              <Fragment key={opacity}>
                {i > 0 && <div className="h-px bg-[var(--border-hairline)]" />}
                <GhostRow opacity={opacity} />
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
