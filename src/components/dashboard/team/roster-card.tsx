import Link from "next/link";
import { ResendInvite } from "@/components/dashboard/team/resend-invite";
import {
  ClaimedTodayPill,
  InviteRing,
  invitedLine,
  invitesPendingLabel,
  playersLabel,
} from "@/components/dashboard/team/roster-vocabulary";
import type { TeamRosterCard } from "@/lib/data/team-home-server";

/**
 * 44a — the roster, from the home page.
 *
 * **Not a second roster.** It is the Roster page's own vocabulary in a 340px
 * column: the standing line it prints under its title, its dashed-ring rows for
 * people who have been emailed and have not joined, its Resend, and its
 * "Claimed today" pill. Every one of those words and marks comes from
 * `roster-vocabulary.tsx`, which both screens import — so a coach who reads "2
 * invites pending" here and then opens Roster is looking at the same two
 * people, described the same way. Inventing a synonym for any of these states
 * is the specific failure this card is written to avoid.
 *
 * What it deliberately leaves to the Roster page: form, last match, first
 * serve, the merge repair, Revoke, and everyone who has already joined. This
 * card is the *outstanding* half of the roster — who is new today, and who has
 * not answered — because that is the half with something to do about it. The
 * rest is a table, and a table does not fit here.
 *
 * **It renders or it does not.** The loader hands `null` for a program with no
 * players, no open invitations and no fresh claim, and this mounts nothing at
 * all for it — the rule the whole right column follows.
 */

/**
 * How many invitations the card lists before it stops.
 *
 * A coach who has just invited a whole squad has twenty open invitations, and
 * twenty rows would push everything under this card off the screen. Four is a
 * card's worth; the rest are counted in the line under it, which links to the
 * page that holds all of them.
 */
const INVITE_ROWS = 4;

export function RosterCard({ roster }: { roster: TeamRosterCard | null }) {
  if (!roster) return null;

  const shown = roster.invites.slice(0, INVITE_ROWS);
  const rest = roster.invites.length - shown.length;

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-medium)] px-5 pt-4 pb-[18px]">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Roster</h2>
        <Link
          href="/dashboard/team/roster"
          className="text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Open
        </Link>
      </div>

      {/* The Roster page's standing line, minus the two clauses that need its
          own query. Both numbers are counted the way that page counts them —
          see `TeamRosterCard` — so the sentence a coach reads here is the
          sentence they read there. Tabular figures: the numbers ARE the
          sentence. */}
      <p className="tabular mt-2 text-[12px] leading-[1.5] text-[var(--ink-700)]">
        {[
          playersLabel(roster.players),
          roster.invites.length > 0 &&
            invitesPendingLabel(roster.invites.length),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {(roster.claimedToday.length > 0 || shown.length > 0) && (
        <ul className="mt-3.5 flex flex-col gap-3">
          {/* Today's claims first — this is the one thing on the card that is
              news rather than an errand, and it is gone tomorrow. */}
          {roster.claimedToday.map((name) => (
            <li key={`claimed-${name}`} className="flex items-center gap-2.5">
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                {name}
              </span>
              <ClaimedTodayPill />
            </li>
          ))}

          {shown.map((invite) => (
            <li
              key={invite.id}
              className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5"
            >
              <InviteRing />
              <span className="min-w-0 flex-1">
                <span
                  title={invite.email}
                  className="block truncate text-[12px] text-[var(--ink-500)]"
                >
                  {invite.email}
                </span>
                <span className="block truncate text-[11px] text-[var(--ink-500)]">
                  {invitedLine(invite.invitedOn, invite.role)}
                </span>
              </span>
              <ResendInvite email={invite.email} role={invite.role} />
            </li>
          ))}
        </ul>
      )}

      {rest > 0 && (
        <p className="mt-3 text-[11px] text-[var(--ink-500)]">
          <span className="tabular">{rest}</span> more on{" "}
          <Link
            href="/dashboard/team/roster"
            className="text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
          >
            Roster
          </Link>
        </p>
      )}
    </section>
  );
}
