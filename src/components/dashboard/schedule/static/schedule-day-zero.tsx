"use client";

import Link from "next/link";
import { ChevronDown, Filter as FilterIcon } from "lucide-react";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import {
  DayZeroShape,
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { advButton } from "@/lib/ui/adv-button";
import { Chip } from "./chip";
import { SCHEDULE_COLUMNS, SCHEDULE_GRID } from "./schedule-table";

/**
 * Schedule before the season has an event in it.
 *
 * The same composition Matches draws (`matches/matches-day-zero.tsx`, and
 * SKILL.md → Table page states): the offer, centred, over the page's own
 * anatomy at 0.32 and `inert` — the lifecycle pills at zero, the toolbar, and
 * the table card carrying its seven column labels over five ghost rows.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 * `7e`'s day zero — a 24px line, one sentence, three blue words — was written
 * under the table-page rule as it then stood: title, primary and footer
 * identical to the populated page, chips and table absent. That rule has since
 * been rewritten, because it left two day-zero pages one click apart looking
 * like two products. A coach who lands on Matches and a coach who lands on
 * Schedule now meet the same screen with different words in it, which is the
 * whole argument for the rewrite.
 *
 * The title row and the season footer go with it. Not an oversight: the offer
 * carries the page's one primary, and a New event beside it would be two on
 * one screen. The program's name is not lost — the rail's workspace row
 * carries it, the same reason the Roster page keeps it out of its summary.
 *
 * ── The column labels are the payload ───────────────────────────────────────
 * Date · Event · Type · Venue · Lines · Score · Result says what a season
 * becomes, with no figure invented. They are imported from the real table
 * rather than restated here — `matches-day-zero.tsx` drew a stale column order
 * for a while precisely because it had restated one.
 *
 * ── Who gets a pair ─────────────────────────────────────────────────────────
 * `canCreate` is `isProgramStaff`. A player sees the identical shape with no
 * buttons and a sentence naming who fills it: a control that refuses on click
 * is worse than no control. `canAddOwnMatch` adds the one-off path to the
 * conditions line rather than a third button — the offer holds one pair, and
 * a one-off match is the exception a coach reads about, not the way in.
 */

/**
 * Proportional rules for the seven columns, in `SCHEDULE_GRID` order. Event is
 * the name, so it gets the darker, taller rule the way Opponent does on
 * Matches; Result is a 14px dot at `ResultMark`'s own footprint.
 */
const ROW_RULES: readonly React.ComponentProps<typeof GhostRule>[] = [
  { width: "72%" }, // Date
  { width: "40%", tone: "200", shape: "tall" }, // Event — the opponent's name
  { width: "62%" }, // Type
  { width: "68%" }, // Venue
  { width: "44%" }, // Lines
  { width: "70%" }, // Score
  { width: "14px", shape: "dot" }, // Result — ResultMark's footprint
];

function GhostRow({ opacity }: { opacity: number }) {
  return (
    <div
      className={`grid h-[52px] items-center gap-4 ${SCHEDULE_GRID}`}
      style={{ opacity }}
      aria-hidden="true"
    >
      {ROW_RULES.map((rule, i) => (
        <GhostRule key={i} {...rule} />
      ))}
    </div>
  );
}

export function ScheduleDayZero({
  canCreate,
  canAddOwnMatch,
}: {
  /** `isProgramStaff` — may schedule the program's events. */
  canCreate: boolean;
  /** `canUploadForProgram` — may add a match that belongs to no event. */
  canAddOwnMatch: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <DayZeroOffer
        headline="Every dual and tournament lands here."
        headlineMeasure="30ch"
        actions={
          canCreate ? (
            /* Two entrances, one of them primary — the offer's own shape. Each
               lands where its label says: `/new/dual` and `/new/tournament`
               are the forms themselves, not the chooser at `/new` that the
               old day zero's "New dual" actually opened. */
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard/team/schedule/new/dual"
                className={advButton("primary")}
              >
                New dual
              </Link>
              <Link
                href="/dashboard/team/schedule/new/tournament"
                className={advButton("ghost")}
              >
                New tournament
              </Link>
            </div>
          ) : null
        }
        conditions={
          canCreate ? (
            <>
              A dual builds its own lineup card — every slot becomes a real
              match the moment you set the line.
              {canAddOwnMatch && (
                <>
                  {" "}
                  <Link
                    href="/dashboard/matches/new"
                    className="font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
                  >
                    Add a one-off match
                  </Link>{" "}
                  for anything outside the season.
                </>
              )}
            </>
          ) : (
            "Your coaching staff schedule the program's duals and tournaments. Every line you play shows up here."
          )
        }
      />

      <DayZeroShape
        description="Once the season has events this page lists every dual and tournament by date, with its venue, its lines and how it finished. Nothing below is real data yet."
        className="flex flex-col gap-[18px]"
      >
        {/* The toolbar at rest and at zero. The pills are the real component;
            the filter and sort controls are drawn, since a panel and a menu
            that cannot open have nothing to be. */}
        <div className="flex items-center gap-2">
          <Chip label="All" active onClick={() => {}} />
          <Chip label="Upcoming" active={false} onClick={() => {}} />
          <Chip label="Completed" active={false} onClick={() => {}} />
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-[12px] text-[var(--ink-600)]">
            <span className="flex h-7 items-center gap-1.5 px-2">
              <FilterIcon
                className="size-[13px] text-[var(--ink-500)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              Filter
            </span>
            <span className="flex h-7 items-center gap-1.5 px-2">
              Newest first
              <ChevronDown
                className="size-3 text-[var(--ink-400)]"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
          </div>
        </div>

        {/* `ScheduleTable`'s own card: surface-card, 24px sides, a hairline
            under the header only. */}
        <div className="surface-card min-w-0 px-6 pt-0.5 pb-1.5">
          <div
            className={`grid items-center gap-4 border-b border-[var(--border-hairline)] pb-2.5 pt-3.5 ${SCHEDULE_GRID}`}
          >
            {SCHEDULE_COLUMNS.map((label) => (
              <span key={label} className="eyebrow-sm min-w-0 truncate">
                {label}
              </span>
            ))}
          </div>
          {/* No separators between rows. `ScheduleTable` draws a hairline
              under the HEADER only (8a's site-wide row treatment, SKILL.md
              law 9) — a ghost that rules between its rows is drawing a table
              the page does not have. */}
          <div>
            {GHOST_OPACITY.map((opacity) => (
              <GhostRow key={opacity} opacity={opacity} />
            ))}
          </div>
        </div>
      </DayZeroShape>
    </div>
  );
}
