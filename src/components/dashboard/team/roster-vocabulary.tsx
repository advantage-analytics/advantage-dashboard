import type { MemberRole } from "@/lib/data/team-settings-server";

/**
 * The words and marks the roster is read with — in one place, because two
 * screens read it.
 *
 * The Roster page owns this vocabulary: a person the program has emailed is a
 * dashed ring and an address with a Resend beside it, somebody who bound a
 * login today carries a "Claimed today" pill, and a squad's standing is spelled
 * "8 players · 2 invites pending". Team Home's right column shows the same
 * facts in a narrower card, and the one thing it must not do is invent a second
 * set of words for them — a coach reading "2 awaiting reply" here and "2
 * invites pending" there has to work out whether those are the same two people.
 *
 * This is the precedent `lib/schedule/line-status.ts` set for the dual sheet's
 * three line states, applied to the roster: **the words are shared, the layout
 * is not.** The Roster page's table and this card lay a row out differently and
 * should — one has five columns and a merge affordance, the other is 340px
 * wide. What they may not have is two answers to "what is this row called".
 *
 * Every class string here is the Roster table's own, moved rather than
 * rewritten, so what shipped on that page is what renders here.
 */

/** The dashed ring standing in for the avatar of somebody who has not joined. */
export const INVITE_RING =
  "size-[26px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]";

/**
 * That ring, drawn.
 *
 * `aria-hidden`, because it is the absence of a face and says nothing a screen
 * reader needs: the row's own text already says the person was invited.
 */
export function InviteRing() {
  return <span aria-hidden className={INVITE_RING} />;
}

/**
 * "Claimed today" — 7d's pill, and the only thing that marks a fresh claim.
 *
 * The row deliberately does not tint itself as well: `--surface-muted` is the
 * hover token, so a tinted row sat there looking permanently moused-over. The
 * pill says it in words instead.
 */
export function ClaimedTodayPill() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[10px] font-medium text-[var(--ink-700)]">
      Claimed today
    </span>
  );
}

/** "Invited Aug 4 as player" — what an outstanding invitation says about itself. */
export function invitedLine(invitedOn: string, role: MemberRole): string {
  return `Invited ${invitedOn} as ${role}`;
}

/**
 * The role a resend sends under.
 *
 * `create_program_invite` will not mint an owner invitation — a program has one
 * owner and it is transferred, not invited — so an owner row resends as a
 * player, which is what both surfaces have always done. The rule lives here so
 * they cannot start disagreeing about it.
 */
export function resendRole(role: MemberRole): Exclude<MemberRole, "owner"> {
  return role === "owner" ? "player" : role;
}

/**
 * Resend, as a word and as a look.
 *
 * The action itself is not shared: the Roster table runs it through the
 * transition that disables its whole list while a write is in flight, and the
 * home page's card owns its own. Only what a coach sees is the same.
 */
export const RESEND_LABEL = "Resend";

/**
 * The other thing a coach can do to an open invitation.
 *
 * "Revoke", and the server action has said so all along — `revokeInvite` in
 * `settings/team-actions.ts`. 9a renamed the Roster button to match it; the
 * error that same action returns still said "withdraw", so pressing **Revoke**
 * printed "Couldn't withdraw that invite", and Settings › Team called it
 * "Withdraw" besides. One action, three words, across two screens. This is the
 * word; the two strays were corrected alongside it.
 */
export const REVOKE_LABEL = "Revoke";

export const RESEND_CLASS =
  "text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] disabled:opacity-50";

/** "8 players" — the first clause of the Roster page's standing line. */
export function playersLabel(count: number): string {
  return `${count} ${count === 1 ? "player" : "players"}`;
}

/** "2 invites pending" — the clause that appears only when some are. */
export function invitesPendingLabel(count: number): string {
  return `${count} ${count === 1 ? "invite" : "invites"} pending`;
}

/**
 * Who may read this program's match results — `programs.roster_visible`, in
 * words.
 *
 * The Roster page has said this since 9a, in its standing line and in the
 * sentence a player reads instead of it. It is here now because Team Home has
 * to say the same thing: the dual sheet withholds a tally it cannot compute
 * honestly for a player on a closed program, and a second phrase for the same
 * flag would leave that player deciding whether "coaches only" on one screen
 * and something else on another are the same rule. They are one rule —
 * `resultsScope()` in `lib/data/results-visibility.ts` — so they are one
 * phrase.
 */
export function resultsVisibilityPhrase(rosterVisible: boolean): string {
  return rosterVisible
    ? "visible to everyone on the team"
    : "visible to coaches only";
}

/** That phrase as its own sentence — "Match results are visible to coaches only." */
export function resultsVisibilitySentence(rosterVisible: boolean): string {
  return `Match results are ${resultsVisibilityPhrase(rosterVisible)}.`;
}

/**
 * The sentence a surface prints when it is withholding rather than reporting.
 *
 * The `false` case above, named — a card that has decided it cannot count
 * honestly holds no `roster_visible` flag to re-ask, and `resultsVisibilitySentence(false)` at
 * the call site reads as a coin toss rather than as the one case that gets
 * here.
 */
export const RESULTS_WITHHELD_SENTENCE = resultsVisibilitySentence(false);

/**
 * What a single withheld line says about itself.
 *
 * Short enough for the dual sheet's 104px trailing column, and the sentence
 * above is what explains it — the chip is the row's share of one claim, not a
 * second one. Never "Not played": that is a fact about the court, and this is a
 * fact about the reader.
 */
export const RESULTS_WITHHELD_LABEL = "Coaches only";
