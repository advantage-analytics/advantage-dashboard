"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  Link as LinkIcon,
  Link2,
  Loader2,
  Users,
  X,
} from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { advButton } from "@/lib/ui/adv-button";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  inviteMember,
  setPlayersCanUpload,
} from "@/components/dashboard/settings/team-actions";
import {
  DialogInfoRow,
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import {
  InviteTargetPicker,
  type ManagedPlayer,
} from "@/components/dashboard/team/invite-target-picker";
import type { SeatUsage } from "@/lib/data/team-roster-server";

/**
 * Designs 6b, 7a and 7b — one dialog, not three.
 *
 * They are frames of the same object, and every difference between them is
 * DERIVED from two pieces of state rather than stored:
 *
 *   6b  no target chosen, picker closed   — email + role, the plain invitation
 *   7a  picker open                       — "who is this for"
 *   7b  a profile chosen                  — email prefilled, role fixed, the
 *                                           note about what stays put
 *   7c  a typed address matches a profile — the tripwire, proposing the link
 *
 * 9b is the same object again, and settles the two lines above the fields: the
 * title names the program this invitation is into, and one description covers
 * every frame rather than one per branch.
 *
 * There is deliberately no `mode` enum and no frame counter. Adding one is how
 * the four drift apart: the picker and the tripwire would each get their own
 * idea of whether an invitation is "linked", and one of them would be wrong.
 * It is also what keeps "Link to P. Sharma" from being a second code path — it
 * fires exactly the same `pick()` the picker does.
 *
 * ── The tripwire costs no round trip ────────────────────────────────────────
 * The picker already has every coach-managed player and their address loaded,
 * so matching a typed address is a lookup over an array that is already here.
 * The authority is still `create_program_invite`, which refuses the duplicate
 * in SQL whatever the client believes; this panel is an echo that saves the
 * coach from finding out after pressing send.
 *
 * ── What a linked invitation does ───────────────────────────────────────────
 * It binds a login to a roster row that already exists. Her matches, video and
 * stats stay exactly where they are — `accept_program_invite` sets
 * `claimed_by_user_id` and writes no match rows at all — and a seat starts
 * counting only when she accepts.
 *
 * ── The pasted list is a fifth frame, not a second dialog ───────────────────
 * A coach in August has the squad's addresses in a spreadsheet, not in their
 * head, so the field takes a whole block and splits it. That used to live in a
 * separate bulk dialog on Team Home; it is here now because two invite controls
 * on one product are two answers to one question, and this is the page where a
 * coach notices somebody is missing.
 *
 * It stays derived like the rest: **a list is "the field has parsed a chip"**,
 * and that turns off the two things that are single-person questions by nature
 * — the target picker and the tripwire, both of which propose binding ONE login
 * to ONE roster row. Going the other way, a linked invitation keeps a plain
 * single-address field, because that is what it is. No mode, no counter.
 *
 * `linked` and `listed` are therefore never both true, and `submit` depends on
 * it: a target belongs to at most one address per run. The refusal path that
 * selects a row on the coach's behalf is held to the same rule — see the
 * comment on it in `submit`, which is where it was once broken.
 */

/** Whitespace, commas and semicolons all separate addresses in a pasted list. */
const SEPARATORS = /[\s,;]+/;

/** Deliberately loose. The database and the mail server are the real checks. */
const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function RosterInviteDialog({
  open,
  onOpenChange,
  managedPlayers,
  seats,
  playersCanUpload,
  /** Preselect a row, e.g. from a roster row's "invite to claim" affordance. */
  initialTarget = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managedPlayers: ManagedPlayer[];
  seats: SeatUsage;
  /**
   * The program's current upload permission. The dialog states the rule at the
   * moment it becomes true for somebody, so the switch beside that sentence has
   * to be the real setting rather than a copy Settings could contradict later.
   */
  playersCanUpload: boolean;
  initialTarget?: ManagedPlayer | null;
}) {
  const [target, setTarget] = useState<ManagedPlayer | null>(initialTarget);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [email, setEmail] = useState(initialTarget?.email ?? "");
  /**
   * Addresses that have already parsed, held apart from the one being typed.
   * Anything that did NOT parse stays in the field instead — a typo'd roster
   * entry that vanishes is worse than one that stays visible.
   */
  const [emails, setEmails] = useState<string[]>([]);
  const [emailEdited, setEmailEdited] = useState(false);
  const [role, setRole] = useState<"player" | "staff">("player");
  const [canUpload, setCanUpload] = useState(playersCanUpload);
  /**
   * The address the coach said to leave alone. Suppresses the tripwire for
   * that address only — typing a different one re-arms it, which is right:
   * "keep separate" was an answer about one person, not a setting.
   */
  const [keptSeparate, setKeptSeparate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /**
   * The outcome, once there is one. Delivered and undelivered kept apart, not
   * summed: a run that saved four invitations and mailed three is not "4 sent",
   * and a coach told it was would wait for a reply that cannot come.
   * `inviteMember` returns `{ok: true, warning}` on exactly that case so the
   * caller can say so.
   */
  const [sent, setSent] = useState<{
    delivered: string[];
    problems: string[];
  } | null>(null);
  const [pending, start] = useTransition();
  /**
   * The program this invitation is into, named in the title (9b: "Invite to
   * Meridian State"). It is read from the shell's workspace context rather
   * than fetched or prop-drilled — `dashboard/layout.tsx` already resolved it
   * once for this request, and the Roster page only renders this dialog inside
   * a team workspace, so `active.name` is the school.
   */
  const { active } = useWorkspace();

  const linked = target !== null;

  const draft = email.trim();
  /**
   * Everything this send would invite: the parsed chips plus a finished address
   * still sitting in the field. That last part matters — nobody expects to
   * press a separator key before pressing Send.
   */
  const addresses = [
    ...new Set([...emails, ...(LOOKS_LIKE_EMAIL.test(draft) ? [draft] : [])]),
  ];
  /**
   * The field is holding a list rather than an address. This is what turns the
   * single-person questions off, and it goes true at the FIRST chip rather than
   * the second: at one chip the picker would still be offering to bind a link
   * that the next paste could contradict, and there is no honest way to carry a
   * chosen profile across a list.
   */
  const listed = emails.length > 0;

  // Which makes a typed address the only thing the tripwire can ask about.
  const normalized = listed ? "" : draft.toLowerCase();
  const emailMatch =
    linked || normalized === ""
      ? null
      : (managedPlayers.find(
          (p) => p.email && p.email.trim().toLowerCase() === normalized
        ) ?? null);
  const showTripwire = emailMatch !== null && normalized !== keptSeparate;

  function reset() {
    setTarget(initialTarget);
    setPickerOpen(false);
    setEmail(initialTarget?.email ?? "");
    setEmails([]);
    setEmailEdited(false);
    setRole("player");
    setCanUpload(playersCanUpload);
    setKeptSeparate(null);
    setError(null);
    setSent(null);
  }

  /**
   * The one close path. Escape, the overlay click and the shell's own X all
   * reach this through `RosterDialog`'s `onOpenChange`; Cancel and Done call
   * it directly so there is exactly one place that resets — not four callers
   * each remembering to. Reset before telling the parent, so nothing renders
   * an in-between frame with the dialog still mounted and already cleared.
   */
  function close() {
    reset();
    onOpenChange(false);
  }

  /**
   * Pull every complete address out of what was typed or pasted and leave the
   * rest in the field. Deduped against the chips already there AND within the
   * paste itself — a roster copied out of a spreadsheet routinely carries the
   * same address twice, and two chips would spend two seats on one player.
   */
  function absorb(text: string, keepTrailing: boolean) {
    const parts = text.split(SEPARATORS);
    // Mid-typing, the last fragment is not finished being typed; on paste and
    // on Enter, everything in the box is fair game.
    const trailing = keepTrailing ? (parts.pop() ?? "") : "";
    const found = parts.filter((part) => LOOKS_LIKE_EMAIL.test(part));
    const rejected = parts.filter(
      (part) => part.length > 0 && !LOOKS_LIKE_EMAIL.test(part)
    );

    if (found.length > 0) {
      setEmails((current) => [...new Set([...current, ...found])]);
    }
    setEmail([...rejected, trailing].filter(Boolean).join(" "));
    setEmailEdited(true);
  }

  function pick(player: ManagedPlayer | null) {
    setTarget(player);
    setError(null);
    setKeptSeparate(null);
    if (player) {
      // The address comes off the profile. A coach who recorded a school
      // address gets it back rather than typing it again — and it stays
      // editable, because addresses change between August and September.
      setEmail(player.email ?? "");
      setEmailEdited(false);
      // A roster row is a player. `create_program_invite` refuses any other
      // role for a targeted invitation, so the control states the rule rather
      // than offering a choice that would be rejected.
      setRole("player");
    }
  }

  function submit() {
    if (addresses.length === 0) return;
    setError(null);
    start(async () => {
      // The permission first, because it is the rule the invitations are about
      // to be sent under. A failure here stops the run: sending a squad an
      // invitation on terms the coach just declined is worse than sending none.
      if (role === "player" && canUpload !== playersCanUpload) {
        const permission = await setPlayersCanUpload(canUpload);
        if (!permission.ok) {
          setError(permission.error);
          return;
        }
      }

      // Sequential, not parallel: `create_program_invite` upserts on the
      // one-open-invite index, and a pasted list that survived dedupe with two
      // spellings of one address would otherwise race itself for that row.
      const delivered: string[] = [];
      const problems: string[] = [];

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        const result = await inviteMember({
          email: address,
          role,
          playerId: target?.profileId ?? null,
        });

        // A refusal is a question to answer, not a hiccup to log, so it stops
        // the run either way. Where it is REPORTED depends on whether anything
        // has happened yet.
        if (!result.ok) {
          // The tripwire named the row this should have attached to. Select it
          // and let the coach press send again, rather than making them find it.
          //
          // Only where this send is ONE address, though — `!listed` is what
          // keeps that true. This `pick()` is the only one not already behind
          // that condition: the picker is unmounted while a list is in the
          // field and the on-screen tripwire is suppressed with it, so calling
          // it here on a pasted list is the one way to reach a state the
          // dialog has no frame for — `linked` and `listed` both true, a
          // footer offering "Send 12 invites" under a description that says
          // this invitation binds one login to one profile. Pressing send
          // there would carry that one `profileId` to all twelve, and nothing
          // downstream refuses it: `create_program_invite`'s one-open-invite
          // index is on the ADDRESS, so twelve open invitations may name the
          // same roster row, and `accept_program_invite` then binds it to
          // whoever clicks first and answers the other eleven with
          // `already_claimed` — a wall none of them can do anything about,
          // holding eleven seats.
          //
          // So against a list the refusal stays a refusal, and the coach's
          // move is to take that address out and invite that player on their
          // own. Which makes the address the thing the message has to name.
          if (result.linkTo && !listed) {
            const match = managedPlayers.find(
              (p) => p.profileId === result.linkTo?.profileId
            );
            if (match) pick(match);
          }

          // Nothing has gone out: keep the coach in the form, which is where
          // the answer is — the tripwire has just selected a row, and pressing
          // send again is the next move. With a list in the field nothing was
          // selected, so the address is named instead: "already on this roster
          // without an account" beside twelve chips does not say which one.
          if (delivered.length === 0 && problems.length === 0) {
            setError(listed ? `${address} — ${result.error}` : result.error);
            return;
          }

          // Otherwise part of the list is already real, so the dialog owes a
          // receipt — and the refusal has to be a line ON it, because the form
          // that would have shown it is no longer the thing being rendered.
          const untried = addresses.slice(i + 1);
          problems.push(
            `${address} — ${result.error}${
              untried.length > 0
                ? ` Nothing was sent to ${untried.join(", ")}.`
                : ""
            }`
          );
          setEmails([]);
          setEmail("");
          setSent({ delivered, problems });
          return;
        }

        // The warning describes the failure, not who it happened to, and in a
        // list of nine that is the only part a coach needs. Named here.
        if (result.warning) problems.push(`${address} — ${result.warning}`);
        else delivered.push(address);
      }

      setEmails([]);
      setEmail("");
      setSent({ delivered, problems });
    });
  }

  const remaining = Math.max(0, seats.seats - seats.used - seats.pending);
  const ready = addresses.length > 0 && !pending;

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(next) : close())}
      title={`Invite to ${active.name}`}
      description="Link the invite to a player you've added, or start fresh."
      footer={
        sent ? (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("primary")}
              onClick={close}
            >
              Done
            </button>
          </>
        ) : (
          <>
            <CopyInviteLink />
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("outline")}
              onClick={close}
            >
              Cancel
            </button>
            <button
              type="button"
              className={advButton("primary")}
              disabled={!ready}
              onClick={submit}
            >
              {pending && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              )}
              {/* Counted, so the number sent is agreed before it is sent —
                  a pasted list is exactly where a coach cannot tell at a
                  glance whether the box holds nine addresses or ten. */}
              {addresses.length > 1
                ? `Send ${addresses.length} invites`
                : "Send invite"}
            </button>
          </>
        )
      }
    >
      {sent ? (
        <>
          {sent.delivered.length > 0 && (
            <p className="text-[12px] leading-[1.6] text-[var(--ink-700)]">
              {sent.delivered.length === 1
                ? `Invitation sent to ${sent.delivered[0]}. It lasts 14 days.`
                : `${sent.delivered.length} invitations sent. They last 14 days, and you can resend any of them from this page.`}
            </p>
          )}
          {/* One line per address that did not come out clean — a saved
              invitation whose mail bounced, or the refusal that stopped the
              run. Named individually, because "one of these failed" is not
              something a coach can act on. */}
          {sent.problems.map((problem) => (
            <DialogProblem key={problem} message={problem} />
          ))}
        </>
      ) : (
        <>
          {/* 7a lives here. Hidden entirely when there is nobody to target —
              a picker offering one option is a control that asks a question
              with no alternatives — and while a list is in the field, because
              a targeted invitation binds one login to one row and nine
              addresses have no one row to bind to. */}
          {managedPlayers.length > 0 && !listed && (
            <InviteTargetPicker
              players={managedPlayers}
              selected={target}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onSelect={pick}
            />
          )}

          <SettingsField
            label={listed ? "Emails" : "Email"}
            hint={
              linked && !emailEdited && target?.email
                ? "From their profile — edit if it has changed"
                : linked
                  ? undefined
                  : "One address, or paste a list"
            }
          >
            {/* The chips sit above the rule rather than inside it: this field
                is the settings underline input, not a bordered box, and a row
                of pills threaded through a 1px rule reads as debris on it. */}
            {listed && (
              <span className="flex flex-wrap gap-1.5 pb-0.5">
                {emails.map((address) => (
                  <span
                    key={address}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] py-1 pl-2.5 pr-1.5 font-mono text-[11px] text-[var(--ink-700)]"
                  >
                    {address}
                    <button
                      type="button"
                      aria-label={`Remove ${address}`}
                      onClick={(event) => {
                        // `SettingsField` is a <label>, so a click in here
                        // would otherwise also land on the input behind it.
                        event.preventDefault();
                        setEmails((current) =>
                          current.filter((item) => item !== address)
                        );
                      }}
                      className="cursor-pointer rounded-full p-0.5 text-[var(--ink-400)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
                    >
                      <X className="size-3" strokeWidth={1.5} aria-hidden />
                    </button>
                  </span>
                ))}
              </span>
            )}
            <SettingsUnderlineInput
              /* `text`, not `email`: a pasted block is several addresses and a
                 browser validating it as one would mark the field invalid for
                 the whole time it takes to split. The split is the check. */
              type="text"
              inputMode="email"
              value={email}
              emphasis={!linked}
              placeholder={listed ? "Add another" : "name@school.edu"}
              onChange={(event) => {
                // A linked invitation is one address by definition, so the
                // field stays plain there — splitting it would offer to send
                // a second invitation nothing could bind.
                if (linked) {
                  setEmail(event.target.value);
                  setEmailEdited(true);
                  return;
                }
                absorb(event.target.value, true);
              }}
              onPaste={(event) => {
                if (linked) return;
                event.preventDefault();
                absorb(
                  `${email} ${event.clipboardData.getData("text")} `,
                  false
                );
              }}
              onKeyDown={(event) => {
                if (linked) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  absorb(`${email} `, false);
                }
                // Backspace on an empty field takes the last chip back, the
                // way it does in every address field people already use.
                if (
                  event.key === "Backspace" &&
                  email === "" &&
                  emails.length > 0
                ) {
                  setEmails((current) => current.slice(0, -1));
                }
              }}
            />
          </SettingsField>

          {linked ? (
            /* 7b: the role is a fact, not a choice. */
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-[var(--ink-600)]">Role</span>
              <div className="flex items-center gap-2">
                <span className="inline-flex h-[22px] items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2.5 text-[11px] font-medium text-[var(--ink-700)]">
                  Player
                </span>
                <span className="text-[11px] text-[var(--ink-400)]">
                  set by the profile
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-[var(--ink-600)]">Role</span>
              <div
                role="radiogroup"
                aria-label="Role"
                className="flex flex-col gap-1.5"
              >
                <RoleCard
                  checked={role === "player"}
                  onSelect={() => setRole("player")}
                  title="Player"
                  detail="Joins the roster · sees their own reports and team pages"
                />
                <RoleCard
                  checked={role === "staff"}
                  onSelect={() => setRole("staff")}
                  title="Assistant coach"
                  detail="Full roster access · uploads for any player · no playing stats"
                />
              </div>
            </div>
          )}

          {/* The permission these invitations arrive under, stated at the
              moment it becomes true for somebody and settable there. Staff are
              not covered by it — they may always upload for anyone — so the
              row appears only when players are what is being invited. */}
          {role === "player" && (
            <div className="flex items-center gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[12px] text-[var(--ink-900)]">
                  Let players send their own video
                </span>
                <span className="text-[11px] leading-[1.5] text-[var(--ink-600)]">
                  {canUpload
                    ? "On. Their uploads come out of the program's hours."
                    : "Off. Their matches still appear when you send them."}
                </span>
              </span>
              <span className="ml-auto">
                <AdvSwitch
                  checked={canUpload}
                  onCheckedChange={setCanUpload}
                  label="Let players send their own video"
                />
              </span>
            </div>
          )}

          {showTripwire && emailMatch && (
            <DialogInfoRow
              tone="blue"
              icon={
                <AlertCircle className="size-3.5" strokeWidth={1.5} aria-hidden />
              }
            >
              <span className="block">
                <b className="font-medium text-[var(--ink-900)]">
                  This email is on {emailMatch.name}
                </b>{" "}
                — coach-managed,{" "}
                {emailMatch.matchesPlayed === 0 ? (
                  "no matches yet"
                ) : (
                  <>
                    <span className="tabular">{emailMatch.matchesPlayed}</span>{" "}
                    {emailMatch.matchesPlayed === 1 ? "match" : "matches"}
                  </>
                )}
                . Link the invite to that profile instead of creating a new one?
              </span>
              <span className="mt-2 flex items-center gap-3.5">
                <button
                  type="button"
                  onClick={() => pick(emailMatch)}
                  className="cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
                >
                  Link to {emailMatch.name}
                </button>
                <button
                  type="button"
                  onClick={() => setKeptSeparate(normalized)}
                  className="cursor-pointer text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--ink-900)]"
                >
                  Keep separate
                </button>
              </span>
            </DialogInfoRow>
          )}

          <DialogProblem message={error} />

          {linked ? (
            <DialogInfoRow
              icon={<Link2 className="size-3.5" strokeWidth={1.5} aria-hidden />}
            >
              No new profile.{" "}
              {target.matchesPlayed > 0 ? (
                <>
                  Their{" "}
                  <span className="tabular">{target.matchesPlayed}</span>{" "}
                  {target.matchesPlayed === 1 ? "match" : "matches"}, video and
                  stats stay on this row
                </>
              ) : (
                <>This row stays exactly as it is</>
              )}{" "}
              — the login binds to it when they accept. A seat starts counting
              then.
            </DialogInfoRow>
          ) : (
            <DialogInfoRow
              icon={<Users className="size-3.5" strokeWidth={1.5} aria-hidden />}
            >
              {addresses.length > 1 ? (
                <>
                  Uses <span className="tabular">{addresses.length}</span> team
                  seats when they accept
                </>
              ) : (
                "Uses a team seat when they accept"
              )}{" "}
              ·{" "}
              <span className="tabular">
                {seats.used} of {seats.seats}
              </span>{" "}
              used
              {seats.pending > 0 && (
                <>
                  , <span className="tabular">{seats.pending}</span> reserved by
                  open invitations
                </>
              )}
              {remaining === 0 && " — none free"}
            </DialogInfoRow>
          )}
        </>
      )}
    </RosterDialog>
  );
}

/**
 * 9b's left-hand footer action — and it is disabled, deliberately.
 *
 * ── Why there is no URL to copy ─────────────────────────────────────────────
 * An invite link is `${siteUrl()}/join/<token>`, and that token exists for
 * exactly one instant in one place: `inviteMember()` (`settings/team-actions.ts`)
 * mints it with `generateToken()`, hands it to `programInviteEmail()`, and
 * passes only `hashToken(token)` to `create_program_invite` — whose signature
 * is `p_token_hash text`. Nothing but the SHA-256 digest is ever stored, and
 * the action's return type (`InviteResult`) carries no token either. That is a
 * stated rule, not an oversight: a database dump must not be a set of working
 * links into somebody's program, and a token that reaches the browser has been
 * handed to whoever is looking at the screen rather than to the person invited.
 *
 * So before Send there is no invite row and no token; after Send the row exists
 * but its token is unrecoverable — the digest is one-way. Both of the ways to
 * light this control up are worse than leaving it dark: minting an invitation
 * the coach has not asked for yet, or returning the raw token to a client
 * component. It renders as the affordance the design draws, disabled, saying
 * where the link actually goes, rather than putting a dead `/join/…` URL on
 * somebody's clipboard.
 *
 * When it can be enabled: a server action that returns a link for an invite
 * that already exists — minting a fresh token, storing the new hash through the
 * same upsert `inviteMember` uses, and handing back the one-time URL. That is a
 * new server-side capability with its own trade-off to weigh, not a copy
 * button.
 */
function CopyInviteLink() {
  const reason = "The link is emailed to them — it is never shown here.";
  return (
    <button
      type="button"
      disabled
      title={reason}
      className="inline-flex cursor-not-allowed items-center gap-1.5 text-[11px] font-medium text-[var(--ink-400)]"
    >
      <LinkIcon className="size-3.5" strokeWidth={1.5} aria-hidden />
      Copy invite link
      <span className="sr-only"> — unavailable. {reason}</span>
    </button>
  );
}

/** One of the two role options, drawn as a card so its explanation fits. */
function RoleCard({
  checked,
  onSelect,
  title,
  detail,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-element)] border px-3 py-2.5 text-left transition-colors focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none ${
        checked
          ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
          : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]"
      }`}
    >
      <span
        aria-hidden
        className={`mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full ${
          checked
            ? "bg-[var(--blue)]"
            : "border border-[var(--ink-300)]"
        }`}
      >
        {checked && (
          <Check className="size-2 text-white" strokeWidth={3} aria-hidden />
        )}
      </span>
      <span>
        <span className="block text-[12px] font-medium text-[var(--ink-900)]">
          {title}
        </span>
        <span className="mt-px block text-[11px] leading-[1.5] text-[var(--ink-600)]">
          {detail}
        </span>
      </span>
    </button>
  );
}
