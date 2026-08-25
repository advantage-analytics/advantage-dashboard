"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowUp,
  ChevronRight,
  GitMerge,
  MoreHorizontal,
  Upload,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { capitalize } from "@/lib/utils";
import { formatDelta, getInitials } from "@/lib/data/match-utils";
import {
  archiveProgramPlayer,
  setMemberUploadEnabled,
} from "@/components/dashboard/team/roster-actions";
import {
  inviteMember,
  removeMember,
  revokeInvite,
  type InviteResult,
} from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import { MergeProfilesDialog } from "@/components/dashboard/team/merge-profiles-dialog";
import type {
  RosterInvite,
  RosterMember,
} from "@/lib/data/team-roster-server";

/**
 * Everyone on the program, and how each of them is playing.
 *
 * Design 9a. Two audiences on one component, because they are looking at the
 * same list. Staff get the controls; a player gets the list, and the database
 * has already decided what they see — `program_roster_full` carries the
 * membership check, and the match policy gives a player the squad's results
 * only where the program has `roster_visible` set.
 *
 * ── Two kinds of row, one shape ─────────────────────────────────────────────
 * A coach-managed player has no login and no seat. They are not a lesser row:
 * they carry matches, form and a first-serve rate exactly like anyone else,
 * because their profile id is what those matches were recorded against. The
 * only thing they cannot have is permission to spend the program's budget,
 * since there is nobody to sign in and spend it.
 *
 * ── The columns ─────────────────────────────────────────────────────────────
 * Lineup #, player, form, last match, first serve. No match count: it belongs
 * on the profile, and a coach scanning the roster is asking who is playing
 * well, not how many times.
 *
 * The leading # is a label for an order the list is already in — `getRosterData`
 * sorts staff first, then players by lineup spot — not a sort this table
 * applies. The header's arrow says which way that reads; nothing here reorders
 * anything, so the column costs one field already on the row and no query.
 *
 * "Can send" lives in the row's overflow menu rather than as a column. It is a
 * permission — consulted rarely, changed more rarely still — and this page is
 * the only caller `set_member_upload_enabled` has ever had, so it could not
 * simply go.
 *
 * ── Widths ──────────────────────────────────────────────────────────────────
 * Fixed, and the whole grid scrolls sideways under ~880px rather than
 * reflowing. A run of form ticks and a set score stop meaning anything once
 * they wrap, so a narrow screen gets the same table moved, not a different one.
 */

const COL = {
  /** Just wide enough for a two-digit line and the em dash that replaces it. */
  spot: "w-6 shrink-0",
  player: "w-[220px] shrink-0",
  form: "w-[80px] shrink-0",
  last: "min-w-0 flex-1",
  serve: "w-[110px] shrink-0 text-right",
  actions: "w-[64px] shrink-0",
} as const;

/**
 * Horizontal padding belongs to the CARD, and each row pulls its own back out
 * again with a negative margin (design 9a, row treatment from 8a). That is what
 * makes a hover a rounded panel inset from the card's edge rather than a band
 * running wall to wall — which is also why the rows need no hairline between
 * them: the wash itself is the row boundary.
 */
const ROW = "flex items-center gap-3";

/** 12/16 padding, pulled back 16px so the wash sits inside the card's 24px. */
const ROW_INSET = "-mx-4 rounded-[var(--radius-element)] px-4 py-3";

/**
 * 9d's "Claimed today" marker. Both branches of the last-match cell draw it,
 * so it is named once — the two copies were byte-identical and a single edit
 * could have left them disagreeing.
 */
const CLAIM_PILL =
  "inline-flex h-5 shrink-0 items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[10px] font-medium text-[var(--ink-700)]";

/** The trailing controls, so both read as one class of thing. */
const ROW_ICON =
  "flex size-6 items-center justify-center rounded-[var(--radius-button)] text-[var(--ink-400)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/**
 * The identifying line under a name.
 *
 * A coach-managed player may have no email at all, so the old fallback — render
 * the address when there is no lineup spot — could produce an empty string
 * where an address used to be. Class year is the next most useful true thing,
 * and "No email on file" states the gap rather than hiding it.
 */
function memberLine(member: RosterMember): string {
  if (member.role !== "player") return capitalize(member.role);

  const parts: string[] = [];
  if (member.classYear) parts.push(member.classYear);
  if (member.lineupSpot !== null) parts.push(`#${member.lineupSpot} singles`);
  if (parts.length > 0) return parts.join(" · ");

  return member.email ?? "No email on file";
}

/** "W" / "L" / an en-dash for a match nobody scored. */
function outcomeLetter(won: boolean | null): string {
  if (won === null) return "–";
  return won ? "W" : "L";
}

function outcomeColor(won: boolean | null): string {
  if (won === null) return "var(--ink-400)";
  return won ? "var(--viz-good)" : "var(--viz-bad)";
}

function Problem({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
      {message}
    </p>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]"
    >
      {getInitials(name)}
    </span>
  );
}

/**
 * Where this person sits in the lineup, or an em dash where nobody has said.
 *
 * Rendering only. `getRosterData` already orders the list by this field, so the
 * column names an order the rows arrive in — it does not impose one, and there
 * is nothing to click. A null is "we have not decided", not "line zero", and it
 * is one tier quieter than a real line so a run of dashes does not read as data.
 */
function LineupSpot({ spot }: { spot: number | null }) {
  return (
    <span
      className={`${COL.spot} mono tabular text-[11px] ${
        spot === null ? "text-[var(--ink-400)]" : "text-[var(--ink-500)]"
      }`}
    >
      {spot ?? "—"}
    </span>
  );
}

/**
 * The last five results as a strip, oldest at the left.
 *
 * Colour alone would carry this to a red/green-blind reader, so the strip has
 * a text equivalent rather than an `aria-hidden` and nothing else.
 */
function FormTicks({ form }: { form: RosterMember["form"] }) {
  if (form.length === 0) {
    return <span className="text-[12px] text-[var(--ink-400)]">—</span>;
  }
  return (
    <>
      <span className="sr-only">
        Last {form.length}: {form.map((r) => (r === "win" ? "W" : "L")).join(" ")}
      </span>
      <span aria-hidden className="flex items-center gap-[3px]">
        {form.map((result, index) => (
          <span
            key={index}
            className="h-3 w-[2.5px] rounded-[1px]"
            style={{
              background:
                result === "win" ? "var(--viz-good)" : "var(--viz-bad)",
            }}
          />
        ))}
      </span>
    </>
  );
}

/**
 * The per-row menu: the permission, and the way off the roster.
 *
 * Neither is something to put a click away from a row a coach is scanning.
 * Owners are absent from the removal case: ownership moves by transfer, and a
 * roster screen is not where a program should be able to lose the only person
 * who runs it.
 */
function RowMenu({
  member,
  isViewer,
  onError,
  run,
  pending,
}: {
  member: RosterMember;
  isViewer: boolean;
  onError: (message: string | null) => void;
  run: (action: () => Promise<ActionResult | InviteResult>) => void;
  pending: boolean;
}) {
  const [enabled, setEnabled] = useState(member.uploadEnabled);
  const [sending, startSend] = useTransition();

  // Players only, and not merely the owner. `canUploadForProgram()` answers
  // for owner, coach and staff before it reads `upload_enabled`, so on a staff
  // row this switch would move, write, and change nothing anyone could
  // observe — the position it appears to set is not a position the upload page
  // has. Staff are exempt on purpose: a program's own coaches must not be
  // lockable out of its budget by a switch. A coach-managed player has no
  // account to grant it to.
  const canToggleSend = member.userId !== null && member.role === "player";
  const canRemove = member.role !== "owner" && !isViewer;
  // Whether anything renders in the grant slot at all. Both arms of it are
  // player-only — the switch, and the "no account yet" note — so a coach or
  // staff row fills nothing, and the divider below would open the popover with
  // a rule drawn across the top of nothing.
  const grantSlotFilled = canToggleSend || member.role === "player";

  // An owner has neither control, but the slot still has to exist. Returning
  // null let the upload icon slide right into the space where the menu would
  // be, so the one row without a menu had its icon a step out of line with
  // every other row's. A column of icons that does not line up reads as a
  // rendering fault.
  if (!canToggleSend && !canRemove) {
    return <span aria-hidden className="size-6 shrink-0" />;
  }

  return (
    <Popover>
      <PopoverTrigger
        aria-label={`Options for ${member.name}`}
        title="Options"
        className={ROW_ICON}
      >
        <MoreHorizontal className="size-3.5" strokeWidth={1.5} aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-[248px] rounded-[var(--radius-dropdown)] p-2"
      >
        {canToggleSend ? (
          <div className="flex items-start gap-3 rounded-[var(--radius-element)] px-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-medium text-[var(--ink-900)]">
                Can send video
              </span>
              <span className="block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                Spends the program&apos;s analysis time
              </span>
            </span>
            <AdvSwitch
              checked={enabled}
              disabled={sending}
              label={`Let ${member.name} send video`}
              onCheckedChange={(next) => {
                // Moved before the await so the switch answers the press
                // immediately, and put back if the server refuses. A permission
                // toggle that waits on a round trip reads as broken on a slow
                // connection.
                setEnabled(next);
                onError(null);
                startSend(async () => {
                  const result = await setMemberUploadEnabled(
                    member.userId as string,
                    next
                  );
                  if (!result.ok) {
                    setEnabled(!next);
                    onError(result.error);
                  }
                });
              }}
            />
          </div>
        ) : (
          member.role === "player" && (
            <p className="px-2 py-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
              No account yet, so there is no analysis time to grant. Invite them
              to hand over their own uploads.
            </p>
          )
        )}

        {canRemove && (
          <>
            {grantSlotFilled ? (
              <span className="my-1 block h-px bg-[var(--border-hairline)]" />
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() =>
                  // A coach-managed player has no membership row to remove, so
                  // the profile is archived instead — which also keeps their
                  // matches attributable. Archiving releases the seat when the
                  // profile had been claimed, so the claimed case goes the same
                  // way rather than through `removeMember`.
                  member.profileId
                    ? archiveProgramPlayer(member.profileId)
                    : removeMember(member.userId as string)
                )
              }
              className="block w-full rounded-[var(--radius-element)] px-2 py-2 text-left text-[12px] text-[var(--ink-700)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--danger)] disabled:opacity-50"
            >
              Remove from roster
            </button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MemberRow({
  member,
  canManage,
  isViewer,
  onError,
  onMerge,
  run,
  pending,
}: {
  member: RosterMember;
  canManage: boolean;
  isViewer: boolean;
  onError: (message: string | null) => void;
  onMerge: (member: RosterMember) => void;
  run: (action: () => Promise<ActionResult | InviteResult>) => void;
  pending: boolean;
}) {
  const { lastMatch, firstServePct, firstServeDelta } = member;

  // 7d's "claimed today" is carried by the pill in the last-match cell and by
  // NOTHING else. The row used to also tint itself `--surface-muted`, which is
  // the exact token the hover state uses — so it sat there looking permanently
  // moused-over, and a row that looks stuck is a bug report, not a highlight.
  // The pill already says it in words.
  return (
    <li
      className={`${ROW} ${ROW_INSET} relative transition-colors hover:bg-[var(--surface-muted)]`}
    >
      <LineupSpot spot={member.lineupSpot} />

      <span className={`${COL.player} flex items-center gap-2.5`}>
        <Avatar name={member.name} />
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium text-[var(--ink-900)]">
            {/* Stretched rather than wrapping the row: the trailing cell holds
                controls, and a link around a button is not a thing a keyboard
                or a screen reader can take apart. */}
            <Link
              href={`/dashboard/team/roster/${member.playerId}`}
              className="rounded-[var(--radius-cell)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none after:absolute after:inset-0 after:content-['']"
            >
              {member.name}
            </Link>
            {/* ink-500, the same tier as every other piece of metadata on
                the row. At ink-400 it was the faintest thing on the page —
                the one row a person scans for first, whispering. */}
            {isViewer && (
              <span className="ml-1.5 text-[11px] font-normal text-[var(--ink-500)]">
                you
              </span>
            )}
          </span>
          {/* Titled as well as truncated. When two rows are duplicates of
              each other the address is the ONLY thing that tells them apart,
              and 220px is not always enough of it. */}
          <span
            title={memberLine(member)}
            className="block truncate text-[11px] text-[var(--ink-500)]"
          >
            {memberLine(member)}
          </span>
        </span>
      </span>

      <span className={`${COL.form} flex items-center`}>
        <FormTicks form={member.form} />
      </span>

      <span className={`${COL.last} flex items-center gap-2.5`}>
        {/* The merge repair is entered from the row, not from a menu a coach
            would have to know about: a duplicate is found by looking at the
            list. Quiet, because it is a question and not an alarm — and here
            rather than beside the name, where it was squeezing out the very
            address that tells the two rows apart. */}
        {canManage && member.duplicateOfPlayerId && (
          <button
            type="button"
            onClick={() => onMerge(member)}
            className="relative z-10 inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <GitMerge className="size-2.5" strokeWidth={1.5} aria-hidden />
            Possible duplicate
          </button>
        )}
        {lastMatch ? (
          <>
            <span
              aria-hidden
              className="w-4 shrink-0 text-center text-[11px] font-medium"
              style={{ color: outcomeColor(lastMatch.won) }}
            >
              {outcomeLetter(lastMatch.won)}
            </span>
            <span className="sr-only">
              {lastMatch.won === null
                ? "Result unrecorded against"
                : lastMatch.won
                  ? "Won against"
                  : "Lost to"}
            </span>
            <span className="w-[92px] shrink-0 truncate text-[12px] text-[var(--ink-700)]">
              {lastMatch.opponent}
            </span>
            <span className="text-scoreboard-sm tabular shrink-0">
              {lastMatch.score}
            </span>
            {member.claimedToday && (
              <span className={CLAIM_PILL}>
                Claimed today
              </span>
            )}
            <span className="text-micro tabular ml-auto shrink-0">
              {lastMatch.date}
            </span>
          </>
        ) : (
          <>
            <span className="text-[12px] text-[var(--ink-400)]">
              No matches yet
            </span>
            {member.claimedToday && (
              <span className={CLAIM_PILL}>
                Claimed today
              </span>
            )}
          </>
        )}
      </span>

      <span className={`${COL.serve} tabular text-[13px] text-[var(--ink-900)]`}>
        {firstServePct === null ? (
          <span className="text-[var(--ink-400)]">—</span>
        ) : (
          <>
            {firstServePct}%{" "}
            {firstServeDelta !== null && (
              <span
                className="text-[11px]"
                style={{ color: formatDelta(firstServeDelta).color }}
              >
                {formatDelta(firstServeDelta).label}
              </span>
            )}
          </>
        )}
      </span>

      <span
        className={`${COL.actions} relative z-10 flex items-center justify-end gap-1`}
      >
        {canManage ? (
          <>
            <Link
              href={`/dashboard/team/upload?player=${member.playerId}`}
              aria-label={`Upload a match for ${member.name}`}
              title="Upload a match for this player"
              className={ROW_ICON}
            >
              <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />
            </Link>
            <RowMenu
              member={member}
              isViewer={isViewer}
              onError={onError}
              run={run}
              pending={pending}
            />
          </>
        ) : (
          <ChevronRight
            className="size-3.5 text-[var(--ink-300)]"
            strokeWidth={1.5}
            aria-hidden
          />
        )}
      </span>
    </li>
  );
}

export function RosterTable({
  members,
  invites,
  canManage,
  viewerId,
}: {
  members: RosterMember[];
  invites: RosterInvite[];
  canManage: boolean;
  /** So the viewer's own row cannot offer to remove itself. */
  viewerId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [merging, setMerging] = useState<[RosterMember, RosterMember] | null>(
    null
  );
  const [pending, start] = useTransition();

  /**
   * Every write on this page reports the same way, so they run the same way.
   * `inviteMember` has a third outcome — saved but not delivered — and it
   * surfaces here rather than being swallowed as a success.
   */
  function run(action: () => Promise<ActionResult | InviteResult>) {
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error);
      else if ("warning" in result && result.warning) setError(result.warning);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Problem message={error} />

      {/* 9a: the card carries the horizontal padding and every row pulls its
          own back out again, which is what makes a hover a rounded panel inset
          from the card's edge rather than a band running wall to wall. */}
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-medium)] bg-[var(--surface-card)]">
        <div className="min-w-[880px] px-6 pt-0.5 pb-1.5">
          <div
            className={`${ROW} border-b border-[var(--border-hairline)] pt-3 pb-2.5`}
          >
            {/* The one hairline on the card, and the one arrow: the list is
                already in lineup order, so the header says which way it reads
                rather than offering a sort that does not exist. */}
            <span className={`${COL.spot} inline-flex items-center gap-[3px]`}>
              <span className="eyebrow-sm">#</span>
              <ArrowUp
                className="size-2.5 text-[var(--ink-700)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="sr-only">Lineup order, lowest first</span>
            </span>
            <span className={`${COL.player} eyebrow-sm`}>Player</span>
            <span className={`${COL.form} eyebrow-sm`}>Form</span>
            <span className={`${COL.last} eyebrow-sm`}>Last match</span>
            <span className={`${COL.serve} eyebrow-sm`}>1st serve</span>
            <span className={COL.actions} />
          </div>

          <ul>
            {members.map((member) => (
              <MemberRow
                key={member.playerId}
                member={member}
                canManage={canManage}
                isViewer={member.userId === viewerId}
                onError={setError}
                onMerge={(row) => {
                  const other = members.find(
                    (m) => m.playerId === row.duplicateOfPlayerId
                  );
                  if (other) setMerging([row, other]);
                }}
                run={run}
                pending={pending}
              />
            ))}

            {/* Invitations belong in this list, not under it. Someone a coach
                emailed on Monday is on the roster as far as the coach is
                concerned; a second table below the first makes them look like
                a different kind of thing. */}
            {invites.map((invite) => (
              <li key={invite.id} className={`${ROW} ${ROW_INSET}`}>
                {/* No lineup line to give somebody who has not arrived, and no
                    hairline above the first of them either: an invitation is
                    another row in this list, not a second section. */}
                <LineupSpot spot={null} />

                <span className={`${COL.player} flex items-center gap-2.5`}>
                  <span
                    aria-hidden
                    className="size-[26px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
                  />
                  <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
                    {invite.email}
                  </span>
                </span>
                <span className={`${COL.last} text-[11px] text-[var(--ink-500)]`}>
                  Invited {invite.invitedOn} as{" "}
                  {invite.role === "owner" ? "owner" : invite.role}
                </span>
                {/* The pair reads as one control: send it again, or take it
                    back. Resend is the same call as invite —
                    `create_program_invite` upserts on the one-open-invite
                    index, so it refreshes the row and mints a fresh token
                    rather than leaving two live links into one program. */}
                <span className="flex shrink-0 items-center gap-3.5">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(() =>
                        inviteMember({
                          email: invite.email,
                          role: invite.role === "owner" ? "player" : invite.role,
                        })
                      )
                    }
                    className="text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] disabled:opacity-50"
                  >
                    Resend
                  </button>
                  {/* Revoke hovers to `--danger`, not to the `--ink-900` that
                      9a's markup draws. Deliberate divergence: this is the one
                      destructive action in the row, and the tint is the only
                      thing distinguishing it from Resend beside it. Do not
                      "restore" it to ink on a later fidelity pass. */}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revokeInvite(invite.id))}
                    className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <MergeProfilesDialog
        pair={merging}
        onOpenChange={(open) => {
          if (!open) setMerging(null);
        }}
      />
    </div>
  );
}
