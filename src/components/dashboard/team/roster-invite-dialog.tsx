"use client";

import { useState, useTransition } from "react";
import {
  AlertCircle,
  Check,
  Link as LinkIcon,
  Link2,
  Loader2,
  Users,
} from "lucide-react";
import {
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { advButton } from "@/lib/ui/adv-button";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { inviteMember } from "@/components/dashboard/settings/team-actions";
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
 */
export function RosterInviteDialog({
  open,
  onOpenChange,
  managedPlayers,
  seats,
  /** Preselect a row, e.g. from a roster row's "invite to claim" affordance. */
  initialTarget = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  managedPlayers: ManagedPlayer[];
  seats: SeatUsage;
  initialTarget?: ManagedPlayer | null;
}) {
  const [target, setTarget] = useState<ManagedPlayer | null>(initialTarget);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [email, setEmail] = useState(initialTarget?.email ?? "");
  const [emailEdited, setEmailEdited] = useState(false);
  const [role, setRole] = useState<"player" | "staff">("player");
  /**
   * The address the coach said to leave alone. Suppresses the tripwire for
   * that address only — typing a different one re-arms it, which is right:
   * "keep separate" was an answer about one person, not a setting.
   */
  const [keptSeparate, setKeptSeparate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
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

  const normalized = email.trim().toLowerCase();
  const emailMatch = linked
    ? null
    : (managedPlayers.find(
        (p) => p.email && p.email.trim().toLowerCase() === normalized
      ) ?? null);
  const showTripwire = emailMatch !== null && normalized !== keptSeparate;

  function reset() {
    setTarget(initialTarget);
    setPickerOpen(false);
    setEmail(initialTarget?.email ?? "");
    setEmailEdited(false);
    setRole("player");
    setKeptSeparate(null);
    setError(null);
    setSent(null);
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
    setError(null);
    start(async () => {
      const result = await inviteMember({
        email: email.trim(),
        role,
        playerId: target?.profileId ?? null,
      });

      if (!result.ok) {
        // The tripwire named the row this should have attached to. Select it
        // and let the coach press send again, rather than making them find it.
        if (result.linkTo) {
          const match = managedPlayers.find(
            (p) => p.profileId === result.linkTo?.profileId
          );
          if (match) pick(match);
        }
        setError(result.error);
        return;
      }

      setSent(
        result.warning ??
          `Invitation sent to ${email.trim()}. It lasts 14 days.`
      );
    });
  }

  const remaining = Math.max(0, seats.seats - seats.used - seats.pending);
  const ready = email.trim() !== "" && !pending;

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title={`Invite to ${active.name}`}
      description="Link the invite to a player you've added, or start fresh."
      footer={
        sent ? (
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("primary")}
              onClick={() => onOpenChange(false)}
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
              onClick={() => onOpenChange(false)}
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
              Send invite
            </button>
          </>
        )
      }
    >
      {sent ? (
        <p className="text-[12px] leading-[1.6] text-[var(--ink-700)]">{sent}</p>
      ) : (
        <>
          {/* 7a lives here. Hidden entirely when there is nobody to target —
              a picker offering one option is a control that asks a question
              with no alternatives. */}
          {managedPlayers.length > 0 && (
            <InviteTargetPicker
              players={managedPlayers}
              selected={target}
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              onSelect={pick}
            />
          )}

          <SettingsField
            label="Email"
            hint={
              linked && !emailEdited && target?.email
                ? "From their profile — edit if it has changed"
                : undefined
            }
          >
            <SettingsUnderlineInput
              type="email"
              value={email}
              emphasis={!linked}
              placeholder="name@school.edu"
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailEdited(true);
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
              Uses a team seat when they accept ·{" "}
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
