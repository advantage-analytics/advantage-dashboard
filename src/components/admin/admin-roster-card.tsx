"use client";

import { useState } from "react";
import {
  SettingsCard,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { EmptyMark } from "@/components/ui/empty-mark";
import { ResultMark } from "@/components/dashboard/result-mark";
import { TEXT_ACTION } from "@/components/admin/admin-people-card";
import {
  ADMIN_ROSTER_COLUMNS,
  HEADER_ROW,
  ROW,
} from "@/components/admin/admin-roster-table-layout";
import {
  AddPlayerDialog,
  type AddPlayerActions,
  type AddPlayerRosterRow,
} from "@/components/dashboard/team/add-player-dialog";
import {
  adminAddProgramPlayer,
  adminInviteMember,
} from "@/lib/services/programs/admin-team-actions";
import { getInitials, shortDate } from "@/lib/data/match-utils";
import type { AdminTeamRosterPlayer } from "@/lib/data/admin-team-roster";
import type { SeatUsage } from "@/lib/data/teams-server";
import { cn } from "@/lib/utils";

/**
 * Who is actually on somebody else's squad, from the admin console.
 *
 * `TeamPage.dc.html`'s Roster card (canvas lines 1078–1147). Six columns —
 * `# · Player · Class · Account · Matches · Last match` — whose widths live in
 * `admin-roster-table-layout.ts` beside the canvas lines they came from. The
 * two questions this card exists to answer are in the sub-line and the Account
 * column: how big is the squad, and how many of them can actually log in. An
 * admin reading this is usually working a support case where the answer to the
 * second one is the bug.
 *
 * **The People card and this one are not the same list.** People is
 * `program_members` — logins with roles, plus the invitations that will become
 * them. This is `program_players` — coach-managed profiles that hold matches
 * whether or not anybody ever signs in. An athlete can be on one, the other, or
 * both, and conflating them is how a console tells an admin a program has four
 * players when it has four accounts and eleven athletes.
 *
 * ── Add player is the dashboard's own dialog ────────────────────────────────
 * `AddPlayerDialog`, unchanged: the same fields, the same duplicate and
 * shared-spot notes, the same seat arithmetic and the same refusals out of
 * `add_program_player`. What differs is which function it calls, which is now
 * its `actions` prop — see `AddPlayerActions` for why all three writes moved
 * and why `restore` is null here. Rebuilding a second add form for the console
 * would be a second set of tripwires able to drift from the enforced ones.
 *
 * ── Two things this card deliberately does not do ───────────────────────────
 * It does not scope match counts to this program. `admin-team-roster.ts`
 * attributes on `matches.player1_id` across both id spaces and filters by
 * neither `program_id` nor season, so a claimed athlete's personal matches are
 * in the figure. That is the loader's documented decision (see its module
 * comment), and displaying something other than what it returns would put two
 * answers on the page.
 *
 * And it does not print `matches.result`. That column is free text with three
 * eras in it live — a sentence naming the winner, a lowercase word, the score
 * flow's context string — so the outcome is read off the score, by the product's
 * one authority for it, in the loader. See `AdminTeamRosterMatch.won`.
 */

/** "4 players · 2 have accounts" — the canvas' sub-line (line 1081). */
function rosterMeta(players: readonly AdminTeamRosterPlayer[]): string {
  const claimed = players.filter((player) => player.hasAccount).length;
  const squad = `${players.length} ${players.length === 1 ? "player" : "players"}`;
  const accounts =
    claimed === 1 ? "1 has an account" : `${claimed} have accounts`;
  return `${squad} · ${accounts}`;
}

/**
 * The 14px slot every Last-match row opens with, so the opponent sits at one x
 * whatever the row's state — `roster-table.tsx`'s `MarkSlot`, and the reason
 * `ResultMark` and `EmptyMark` may never be centred.
 */
function MarkSlot({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex w-3.5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

/**
 * Mark, opponent, date — or one em dash.
 *
 * The unscored branch is the dashboard Roster's own (`roster-table.tsx`): a
 * short en dash in the mark slot with the words for a screen reader, never a
 * `ResultMark`, which would claim an outcome nobody recorded. The admin console
 * has no score-entry affordance to offer beside it, so it shows the match and
 * says nothing further.
 */
function LastMatchCell({ player }: { player: AdminTeamRosterPlayer }) {
  const { lastMatch } = player;

  if (lastMatch === null) {
    // The mark alone, with the sentence kept for assistive tech — a dash reads
    // as nothing. Three dashes across a row already say "nothing yet" once.
    return (
      <span className="flex items-center">
        <EmptyMark label="No matches yet" />
      </span>
    );
  }

  const date = lastMatch.date ? shortDate(lastMatch.date) : null;

  return (
    <span className="flex items-center gap-2">
      <MarkSlot>
        {lastMatch.won === null ? (
          <>
            <span aria-hidden className="text-[11px] text-[var(--ink-400)]">
              –
            </span>
            <span className="sr-only">Result unrecorded against</span>
          </>
        ) : (
          <ResultMark won={lastMatch.won} />
        )}
      </MarkSlot>
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-700)]">
        {lastMatch.opponent ?? "Unnamed opponent"}
      </span>
      {date && (
        <span className="tabular ml-auto shrink-0 text-[12px] whitespace-nowrap text-[var(--ink-600)]">
          {date}
        </span>
      )}
    </span>
  );
}

export function AdminRosterCard({
  programId,
  roster,
  seats,
}: {
  programId: string;
  /** The live squad, in lineup order with null spots last. */
  roster: readonly AdminTeamRosterPlayer[];
  /** The program's seat ledger — the dialog opens against it. */
  seats: SeatUsage;
}) {
  const [adding, setAdding] = useState(false);

  /**
   * The console's three writes for this dialog.
   *
   * `add` and `invite` bind the program id an admin has no workspace to infer;
   * `restore` is null because there is no admin wrapper for
   * `restore_program_player` today, and a Restore button that answered with a
   * message about the caller's workspace would be worse than no button. The
   * dialog suppresses the whole offer for null — note and button both — so an
   * admin sees the add path and nothing that cannot work. `former` is `[]` for
   * the same reason: the loader reads live rows only, and there is nothing to
   * offer from.
   */
  const actions: AddPlayerActions = {
    add: (fields) => adminAddProgramPlayer({ programId, ...fields }),
    invite: (input) => adminInviteMember({ programId, ...input }),
    restore: null,
  };

  /**
   * The roster as the dialog reads it — the five fields of `RosterMember` it
   * actually looks at, and no fabrication of the rest. `role` is `"player"` by
   * construction: every row here is a `program_players` row, which is what that
   * word means on this table.
   */
  const dialogRoster: AddPlayerRosterRow[] = roster.map((player) => ({
    profileId: player.id,
    name: player.name,
    email: player.email,
    role: "player",
    lineupSpot: player.lineupSpot,
  }));

  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <>
            <span className="text-[11px] text-[var(--ink-500)]">
              {rosterMeta(roster)}
            </span>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={TEXT_ACTION}
            >
              Add player
            </button>
          </>
        }
      >
        Roster
      </SettingsCardTitle>

      {/* The column labels render whether or not there are rows under them:
          they are the card's own chrome and they are the payload of the empty
          state below — a reader learns what a roster row will say without a
          value being invented. */}
      <div className={HEADER_ROW}>
        {ADMIN_ROSTER_COLUMNS.map((column) => (
          <span
            key={column.label}
            className={cn(
              "truncate text-[12px] whitespace-nowrap text-[var(--ink-600)]",
              column.align === "right" && "text-right",
            )}
          >
            {column.label}
          </span>
        ))}
      </div>

      {roster.map((player) => (
        <div
          key={player.id}
          className={cn(ROW, "border-t border-[var(--border-hairline)]")}
        >
          {/* The lineup spot, or the absence of one. `EmptyMark` rather than a
              soft dash of this cell's own: one mark, one size, per column. */}
          {player.lineupSpot === null ? (
            <span className="flex items-center">
              <EmptyMark label="No lineup spot" />
            </span>
          ) : (
            <span className="tabular text-[12px] text-[var(--ink-600)]">
              {player.lineupSpot}
            </span>
          )}

          <span className="flex min-w-0 items-center gap-2.5">
            {/* Coach-managed is a border ring on the initials (Avatar +
                StatePill, `reference/primitives.md`) — the canvas' `.av.ring`.
                A claimed profile is unmarked. No photo: the loader reads
                `program_players`, and an avatar lives on the account. */}
            <PersonAvatar
              initials={getInitials(player.name)}
              className={cn(
                "size-[26px] text-[9px]",
                // `box-shadow`, not a border: an inset ring leaves the 26px
                // box and the initials inside it exactly where a claimed row
                // draws them, so the name column does not shift by a pixel
                // between the two states. The canvas' `.av.ring`, verbatim.
                !player.hasAccount && "shadow-[inset_0_0_0_1px_var(--ink-300)]",
              )}
            />
            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
              {player.name}
            </span>
          </span>

          {player.classYear === null ? (
            <span className="flex items-center">
              <EmptyMark label="No class year" />
            </span>
          ) : (
            <span className="truncate text-[12px] text-[var(--ink-700)]">
              {player.classYear}
            </span>
          )}

          {/* Two words, not a pill: this is every row's answer, and a pill on
              all of them marks nothing (Data Table rule 4 — a pill marks the
              exception). "Not claimed" takes the softer ink. */}
          <span
            className={cn(
              "truncate text-[12px]",
              player.hasAccount
                ? "text-[var(--ink-700)]"
                : "text-[var(--ink-600)]",
            )}
          >
            {player.hasAccount ? "Joined" : "Not claimed"}
          </span>

          {/* A zero is not a blank, but no matches is not a measured zero
              either — a profile a coach made an hour ago has not played nothing,
              it has not been uploaded. */}
          {player.matchCount === 0 ? (
            <span className="flex items-center justify-end">
              <EmptyMark label="No matches" />
            </span>
          ) : (
            <span className="tabular text-right text-[12px] text-[var(--ink-700)]">
              {player.matchCount}
            </span>
          )}

          <LastMatchCell player={player} />
        </div>
      ))}

      {/* An empty roster is a real state on this console — a program whose
          coach has claimed it and not built a squad yet — and it is the state
          an admin is most likely to be looking at. The card keeps its own
          shape above and says the one thing that is true, with the way onward
          in the sentence rather than only in the header. */}
      {roster.length === 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-[var(--border-hairline)] py-3">
          <span className="text-[12px] text-[var(--ink-500)]">
            Nobody is on this roster yet. A coach-managed profile holds an
            athlete&rsquo;s matches whether or not they ever sign in.
          </span>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={TEXT_ACTION}
          >
            Add player
          </button>
        </div>
      )}

      <AddPlayerDialog
        open={adding}
        onOpenChange={setAdding}
        seats={seats}
        roster={dialogRoster}
        former={[]}
        actions={actions}
      />
    </SettingsCard>
  );
}
