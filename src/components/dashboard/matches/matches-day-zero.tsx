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
 * zero, the toolbar, and the table card carrying its six column labels over
 * five ghost rows. The labels are the honest payload — Result · Opponent ·
 * Score · Event · Analysis · Date says what a report becomes — and the rows
 * are the shape of one, values replaced by rules.
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

const COLUMNS = ["Result", "Opponent", "Score", "Event", "Analysis", "Date", ""] as const;

/** Proportional rules per column, in `LIST_GRID_COLS` order. */
const ROW_RULES: readonly { w: string; tone: "200" | "100" }[] = [
  { w: "34px", tone: "100" },
  { w: "60%", tone: "200" },
  { w: "70%", tone: "100" },
  { w: "55%", tone: "100" },
  { w: "40%", tone: "100" },
  { w: "100%", tone: "100" },
];

const ROW_OPACITY = [1, 0.8, 0.6, 0.45, 0.3] as const;

function GhostRow({ opacity }: { opacity: number }) {
  return (
    <div className={`${LIST_ROW_FRAME} h-[52px]`} style={{ ...LIST_GRID_COLS, opacity }} aria-hidden="true">
      {ROW_RULES.map((rule, i) => (
        <span
          key={i}
          className={`h-2 rounded-[2px] ${rule.tone === "200" ? "bg-[var(--ink-200)]" : "bg-[var(--ink-100)]"}${
            i === 1 ? " h-[9px]" : ""
          }`}
          style={{ width: rule.w, justifySelf: i === 5 ? "end" : undefined }}
        />
      ))}
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
          <LifecycleChips active="all" counts={{ all: 0, new: 0, inProgress: 0 }} onSelect={() => {}} />
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

        {/* The populated table's own card: surface-card, 8px 24px 12px, a
            hairline under the header only (`MatchesGrid`). */}
        <div className="surface-card" style={{ padding: "8px 24px 12px" }}>
          <div
            className={`${LIST_ROW_FRAME} border-b border-[var(--border-hairline)] pb-2 pt-3`}
            style={LIST_GRID_COLS}
          >
            {COLUMNS.map((label, i) => (
              <span key={label || `col-${i}`} className={`eyebrow-sm min-w-0${label === "Date" ? " text-right" : ""}`}>
                {label}
              </span>
            ))}
          </div>
          <div className="pt-1">
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
