import { cn } from "@/lib/utils";
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
/**
 * The roster's quiet grey pill — a claim receipt, a score waiting to be
 * reviewed. One string, because it was three: the same 20px pill was typed out
 * in this file and twice in the table, already drifting on height and ink.
 * `ui/state-pill.tsx` is the system's 18px cousin and the eventual home; it is
 * two pixels shorter, so converging is a visual change rather than a tidy-up.
 */
export const SUBTLE_PILL =
  "inline-flex h-5 items-center whitespace-nowrap rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[10px] font-medium text-[var(--ink-700)]";

export function ClaimedTodayPill() {
  return (
    <span className={cn(SUBTLE_PILL, "shrink-0")}>
      Claimed today
    </span>
  );
}

/** "Invited Aug 4 as player" — what an outstanding invitation says about itself. */
export function invitedLine(invitedOn: string, role: MemberRole): string {
  return `Invited ${invitedOn} as ${role}`;
}

/**
 * The same fact as the Roster table draws it — Platform Audit `Tb4`:
 * "Invited <mono>Aug 4</mono> by you · player role".
 *
 * The date is machine text and takes the mono face; "by you" appears only when
 * `program_invites.invited_by` is the person looking, because the design draws
 * a coach reading their own invitations and the row must not claim somebody
 * else's outreach as theirs. Team Home's card keeps the string form above —
 * that page's design is still being decided, so its words are not this
 * task's to change.
 */
export function InvitedLine({
  invitedOn,
  role,
  byViewer,
}: {
  invitedOn: string;
  role: MemberRole;
  byViewer: boolean;
}) {
  return (
    <>
      Invited <span className="mono">{invitedOn}</span>
      {byViewer ? " by you" : ""} · {role} role
    </>
  );
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

/**
 * What to call somebody who has asked to join and given only an address.
 *
 * The public request form requires the email and nothing else, so a pending
 * `invite_request` routinely carries a null name. The local part is what a
 * person reads out of an address anyway, and it is printed **verbatim** —
 * never title-cased, never split on dots into a First Last. "jsharma" prettied
 * into "Jsharma" invents a name nobody has, and this list is the first thing a
 * coach sees of a stranger; a wrong name read as a real one is worse than a
 * mail handle read as a mail handle.
 *
 * Here rather than in `join-requests-card.tsx` so it can be tested without
 * loading a dialog: the fallback is a rule about what this program calls a
 * person, which is what this file is for.
 */
export function requesterName(request: {
  name: string | null;
  email: string;
}): string {
  const given = request.name?.trim();
  if (given) return given;
  // An address with no local part is not a thing the form can file, but a
  // blank name is worse than a whole address, so the address is the floor.
  return request.email.split("@")[0] || request.email;
}

/**
 * "Coached by Elena Vasquez and Jon Abara." — the roster's staff line.
 *
 * Staff left the table when it was reserved to players, and this sentence is
 * what replaced them: names rather than a count, because a count cannot tell
 * an assistant coach that they are one of the two. It sits in the page footer
 * with the way through to Settings › Team beside it.
 *
 * The serial comma is deliberate on three or more; the last separator is a
 * word because the line is a sentence, not a list.
 */
export function coachedByLine(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `Coached by ${names[0]}.`;
  if (names.length === 2) return `Coached by ${names[0]} and ${names[1]}.`;
  return `Coached by ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}.`;
}

/** "8 players" — the first clause of the Roster page's standing line. */
export function playersLabel(count: number): string {
  return `${count} ${count === 1 ? "player" : "players"}`;
}

/** "2 invites pending" — the clause that appears only when some are. */
export function invitesPendingLabel(count: number): string {
  return `${count} ${count === 1 ? "invite" : "invites"} pending`;
}

