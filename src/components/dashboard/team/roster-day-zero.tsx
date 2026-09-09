"use client";

import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import {
  DayZeroShape,
  GHOST_OPACITY,
  GhostRule,
} from "@/components/dashboard/home/day-zero-shape";
import { RosterHeaderButtons } from "./roster-header-buttons";
import { COL, ROSTER_COLUMNS, ROW } from "./roster-table";
import type { ManagedPlayer } from "./invite-target-picker";
import type { RosterMember, SeatUsage } from "@/lib/data/team-roster-server";

/**
 * Roster before the program has a player on it.
 *
 * A real state, not a hypothetical: a program is created by its owner, the
 * owner is staff, and staff are not rows in this table (`roster/page.tsx` →
 * "the table is players only"). So every program has this screen on its first
 * day, and until this file it got the bare header row over nothing — an empty
 * state by omission, which reads as a page that failed to load.
 *
 * The composition is Matches' (`matches/matches-day-zero.tsx`, SKILL.md →
 * Table page states): the offer, centred, over the page's own anatomy at 0.32
 * and `inert` — the table card with its five column labels over five ghost
 * rows. No title row and no footer, because the offer carries the page's one
 * primary; the program's name is on the rail's workspace row, which is the
 * reason the populated page already keeps it out of its summary.
 *
 * ── The buttons are the page's own ──────────────────────────────────────────
 * `RosterHeaderButtons`, not a copy of it. Add player and Invite open dialogs
 * rather than navigating, so a hand-rolled pair here would be two buttons that
 * do nothing — and the weights are already argued where that component lives
 * (Add player creates the row now, so it is blue; Invite waits on somebody
 * else, so it is not). It sits ghost-then-primary where the offer's own pair
 * runs primary-then-ghost; that is `Tb4c`'s order and it stays, because the
 * populated page puts them in that order two inches away.
 *
 * A player sees the same shape with no pair. The roster is not theirs to fill
 * and a button that refuses on click is worse than no button.
 */

/**
 * The five columns in the real table's own order, with the spacer written
 * where it belongs rather than grown off a magic index. `flex-1` between
 * Player and Record is what the populated row has; without it the three
 * right-hand cells sit under the wrong headings.
 */
const ROW_RULES: readonly (
  { spacer: true } | ({ col: string } & React.ComponentProps<typeof GhostRule>)
)[] = [
  { col: COL.spot, width: "10px" }, // # — a line number's footprint
  { col: COL.player, width: "58%", tone: "200", shape: "tall" }, // Player — the name
  { spacer: true },
  { col: COL.record, width: "70%" }, // Record
  { col: COL.form, width: "76%" }, // Form
  { col: COL.last, width: "62%" }, // Last match
];

function GhostRow({ opacity }: { opacity: number }) {
  return (
    <div className={`${ROW} h-[52px]`} style={{ opacity }} aria-hidden="true">
      {ROW_RULES.map((rule, i) =>
        "spacer" in rule ? (
          <span key={i} className="flex-1" />
        ) : (
          <span key={i} className={`${rule.col} flex items-center`}>
            <GhostRule {...rule} />
          </span>
        ),
      )}
    </div>
  );
}

export function RosterDayZero({
  canManage,
  managedPlayers,
  seats,
  roster,
  playersCanUpload,
}: {
  canManage: boolean;
  managedPlayers: ManagedPlayer[];
  seats: SeatUsage;
  roster: RosterMember[];
  playersCanUpload: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <DayZeroOffer
        headline="Every player on the program starts here."
        headlineMeasure="30ch"
        actions={
          canManage ? (
            <RosterHeaderButtons
              managedPlayers={managedPlayers}
              seats={seats}
              roster={roster}
              playersCanUpload={playersCanUpload}
            />
          ) : null
        }
        conditions={
          canManage
            ? "Add player creates the row now and needs no account. An invitation sends email and spends a seat the moment it is accepted."
            : "Your coaching staff manage who is on the program and who can send video."
        }
      />

      <DayZeroShape description="Once the program has players this page lists each one with their line number, record, recent form and last match. Nothing below is real data yet.">
        {/* `RosterTable`'s own card, holding nothing: the same 768px intrinsic
            width, the same 24px sides, the same hairline under the header and
            none between the rows. */}
        <div className="surface-card">
          <div className="min-w-[768px] px-6 pt-0.5 pb-1.5">
            {/* The labels are the payload — # · Player · Record · Form · Last
                match says what a squad becomes, with no figure invented. They
                come from the real header by import, so a renamed column cannot
                leave the ghost saying the old word. Set lineup does not ride
                this header: it needs two players to have anything to order. */}
            <div
              className={`${ROW} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}
            >
              {ROSTER_COLUMNS.map((column) =>
                "spacer" in column ? (
                  <span key="spacer" className="flex-1" />
                ) : (
                  <span
                    key={column.label}
                    className={`${column.col} eyebrow-sm${
                      column.center ? "text-center" : ""
                    }`}
                  >
                    {column.label}
                  </span>
                ),
              )}
            </div>
            {GHOST_OPACITY.map((opacity) => (
              <GhostRow key={opacity} opacity={opacity} />
            ))}
          </div>
        </div>
      </DayZeroShape>
    </div>
  );
}
