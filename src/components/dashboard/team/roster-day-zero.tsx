"use client";

import { Fragment } from "react";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import { RosterHeaderButtons } from "./roster-header-buttons";
import { COL, ROW } from "./roster-table";
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

/** Proportional rules for the five columns, in the real table's `COL` order. */
const ROW_RULES: readonly { col: string; w: string; tone: "200" | "100" }[] = [
  { col: COL.spot, w: "10px", tone: "100" }, // # — a line number's footprint
  { col: COL.player, w: "58%", tone: "200" }, // Player — the name, so the darker rule
  { col: COL.record, w: "70%", tone: "100" }, // Record
  { col: COL.form, w: "76%", tone: "100" }, // Form
  { col: COL.last, w: "62%", tone: "100" }, // Last match
];

const ROW_OPACITY = [1, 0.8, 0.6, 0.45, 0.3] as const;

function GhostRow({ opacity }: { opacity: number }) {
  return (
    <div className={`${ROW} h-[52px]`} style={{ opacity }} aria-hidden="true">
      {ROW_RULES.map((rule, i) => (
        <Fragment key={i}>
          <span className={`${rule.col} flex items-center`}>
            <span
              className={`${i === 1 ? "h-[9px]" : "h-2"} rounded-[2px] ${
                rule.tone === "200" ? "bg-[var(--ink-200)]" : "bg-[var(--ink-100)]"
              }`}
              style={{ width: rule.w }}
            />
          </span>
          {/* The real row's spacer, between Player and Record. Without it the
              three right-hand cells sit under the wrong headings — the whole
              reason `COL` is imported rather than restated. */}
          {i === 1 && <span className="flex-1" />}
        </Fragment>
      ))}
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

      <p className="sr-only">
        Once the program has players this page lists each one with their line
        number, record, recent form and last match. Nothing below is real data
        yet.
      </p>

      <div inert style={{ opacity: 0.32 }}>
        {/* `RosterTable`'s own card, holding nothing: the same 768px intrinsic
            width, the same 24px sides, the same hairline under the header and
            none between the rows. */}
        <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
          <div className="min-w-[768px] px-6 pt-0.5 pb-1.5">
            {/* The labels are the payload — # · Player · Record · Form · Last
                match says what a squad becomes, with no figure invented. Set
                lineup does not ride this header: it needs two players to have
                anything to order. */}
            <div className={`${ROW} border-b border-[var(--border-hairline)] pt-3.5 pb-2.5`}>
              <span className={`${COL.spot} eyebrow-sm text-center`}>#</span>
              <span className={`${COL.player} eyebrow-sm`}>Player</span>
              <span className="flex-1" />
              <span className={`${COL.record} eyebrow-sm`}>Record</span>
              <span className={`${COL.form} eyebrow-sm`}>Form</span>
              <span className={`${COL.last} eyebrow-sm`}>Last match</span>
            </div>
            {ROW_OPACITY.map((opacity) => (
              <GhostRow key={opacity} opacity={opacity} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
