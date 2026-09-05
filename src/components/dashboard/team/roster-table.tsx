"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, GitMerge } from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { cn } from "@/lib/utils";
import { getInitials } from "@/lib/data/match-utils";
import {
  inviteMember,
  revokeInvite,
  type InviteResult,
} from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import {
  ClaimedTodayPill,
  InviteRing,
  InvitedLine,
  RESEND_CLASS,
  RESEND_LABEL,
  REVOKE_LABEL,
  resendRole,
} from "@/components/dashboard/team/roster-vocabulary";
import type {
  RosterInvite,
  RosterMember,
} from "@/lib/data/team-roster-server";

/**
 * Everyone on the program, distilled to what you compare.
 *
 * Platform Audit `Tb4` / `Tb4c` (Updated Design System `20b`): with a drawer
 * one click away, the row's job narrows to ranking players against each other,
 * so every column has to be comparable down the list at a glance — `#`,
 * Player, Form, Record, Last match. What left, and why:
 *
 * - **1st serve goes.** It was one stat picked from four, and a single-stat
 *   column silently claims to be the stat that matters. The drawer shows all
 *   four, with deltas.
 * - **Record comes in** (4–1). It is the number coaches rank by, and it was
 *   already counted.
 * - **Last match loses the score**, keeps mark + opponent + date. The score
 *   lives in the drawer's recent matches, where it can be read rather than
 *   compared.
 * - **The action gutter is gone.** Upload moved into the drawer, the row menu
 *   with it; the row is a pure peek row with nothing else to aim at. Rows
 *   return to 52px.
 * - **The sub-line under the name is gone** too — class year and lineup spot
 *   are the drawer's identity line now, and a 52px row has one line in it.
 *
 * ── Click, never hover ──────────────────────────────────────────────────────
 * Click opens the drawer and selects the row; clicking the selected row again
 * closes it. `↑`/`↓` walk to the next player without closing and `Esc` closes
 * — those live on the window, in `RosterView`, because they have to work
 * wherever focus is. The name is a link straight to the profile (hover turns
 * it blue) and `⌘`-click anywhere on the row does the same, so "I already know
 * I want the page" stays one click.
 *
 * This component draws and reports clicks. Which row is selected, and what
 * the drawer shows for it, is `RosterView`'s state.
 *
 * ── Widths ──────────────────────────────────────────────────────────────────
 * Fixed for the four compared columns, `flex:1` for Last match — the one cell
 * that absorbs the drawer opening (20f: "columns keep their order, the
 * flexible name column absorbs the loss"). Below ~640px the card scrolls
 * sideways rather than reflowing: a run of form ticks stops meaning anything
 * once it wraps.
 */

const COL = {
  /** 24px: a two-digit line, or the em dash that stands in for one. */
  spot: "w-6 shrink-0",
  player: "w-[220px] shrink-0",
  form: "w-[80px] shrink-0",
  record: "w-[56px] shrink-0",
  last: "min-w-0 flex-1",
} as const;

/** 16px between columns — `Tb4`'s `gap:16px`, header and rows alike. */
const ROW = "flex items-center gap-4";

/**
 * Horizontal padding belongs to the CARD (24px), and each row pulls 16px of it
 * back with a negative margin so a wash reads as a rounded panel inset from
 * the card's edge rather than a band running wall to wall. No hairlines
 * between rows: the wash is the row boundary.
 */
const ROW_BOX = "-mx-4 h-[52px] rounded-[var(--radius-element)] px-4";

/** The id `RosterView` focuses when a keyboard close returns focus to a row. */
export function rosterRowId(playerId: string): string {
  return `roster-row-${playerId}`;
}

export function profileHref(playerId: string): string {
  return `/dashboard/team/roster/${playerId}`;
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
 * Rendering only. `getRosterData` already orders the list by this field; the
 * column names an order the rows arrive in. A null is "we have not decided",
 * not "line zero", and it is one tier quieter than a real line so a run of
 * dashes does not read as data.
 */
function LineupSpot({ spot }: { spot: number | null }) {
  return (
    <span
      className={cn(
        COL.spot,
        "mono tabular text-[11px]",
        spot === null ? "text-[var(--ink-400)]" : "text-[var(--ink-500)]"
      )}
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

/** "4–1", or a quiet dash for somebody with nothing decided yet. */
function Record({ wins, losses }: { wins: number; losses: number }) {
  return (
    <span className={cn(COL.record, "tabular text-[13px] text-[var(--ink-900)]")}>
      {wins + losses === 0 ? (
        <span className="text-[var(--ink-400)]">—</span>
      ) : (
        `${wins}–${losses}`
      )}
    </span>
  );
}

/**
 * The 14px slot every Last-match row starts with, so the opponent sits on the
 * same x whether the row has an outcome, an unscored result, or a match still
 * in analysis. Three occupants: the outcome glyph, a dash, a quiet dot.
 */
function MarkSlot({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex w-3.5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

/**
 * Mark + opponent + date. Three states, one shape — `Tb4`'s `isReady`,
 * `isProc` and `isReview`:
 *
 * - **Settled with an outcome**: the `ResultMark` glyph, the opponent, the
 *   date at the right.
 * - **Still analyzing**: a 5px dot where the mark would be, the opponent, the
 *   matches list's own live "Analyzing" chip, the date.
 * - **Settled without an outcome** — no score, or sets level: a dash where the
 *   mark would be and a "Review score" pill at the right. The pill is the
 *   design's word for a result that needs a person to look at it; the match
 *   itself is one click away in the drawer.
 */
function LastMatchCell({
  member,
  canManage,
  onMerge,
}: {
  member: RosterMember;
  canManage: boolean;
  onMerge: (member: RosterMember) => void;
}) {
  const { lastMatch } = member;

  return (
    <span className={cn(COL.last, "flex items-center gap-2.5")}>
      {/* The merge repair is entered from the row, not from a menu a coach
          would have to know about: a duplicate is found by looking at the
          list. Quiet, because it is a question and not an alarm. Stops the
          click so it does not also open the drawer. */}
      {canManage && member.duplicateOfPlayerId && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onMerge(member);
          }}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-600)] transition-colors hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <GitMerge className="size-2.5" strokeWidth={1.5} aria-hidden />
          Possible duplicate
        </button>
      )}

      {lastMatch === null ? (
        <>
          <span className="text-[12px] text-[var(--ink-400)]">No matches yet</span>
          {member.claimedToday && <ClaimedTodayPill />}
        </>
      ) : lastMatch.analyzing ? (
        <>
          <MarkSlot>
            <span aria-hidden className="size-[5px] rounded-full bg-[var(--ink-300)]" />
          </MarkSlot>
          <span className="truncate text-[12px] text-[var(--ink-700)]">
            {lastMatch.opponent}
          </span>
          <StatusChip tone="blue" live className="shrink-0">
            Analyzing
          </StatusChip>
          {member.claimedToday && <ClaimedTodayPill />}
          <span className="text-micro tabular ml-auto shrink-0 whitespace-nowrap">
            {lastMatch.date}
          </span>
        </>
      ) : lastMatch.won === null ? (
        <>
          <MarkSlot>
            <span aria-hidden className="text-[11px] text-[var(--ink-400)]">
              –
            </span>
            <span className="sr-only">Result unrecorded against</span>
          </MarkSlot>
          <span className="truncate text-[12px] text-[var(--ink-700)]">
            {lastMatch.opponent}
          </span>
          {member.claimedToday && <ClaimedTodayPill />}
          <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[10px] font-medium text-[var(--ink-700)]">
            Review score
          </span>
        </>
      ) : (
        <>
          <MarkSlot>
            <ResultMark won={lastMatch.won} />
          </MarkSlot>
          <span className="truncate text-[12px] text-[var(--ink-700)]">
            {lastMatch.opponent}
          </span>
          {member.claimedToday && <ClaimedTodayPill />}
          <span className="text-micro tabular ml-auto shrink-0 whitespace-nowrap">
            {lastMatch.date}
          </span>
        </>
      )}
    </span>
  );
}

function MemberRow({
  member,
  canManage,
  isViewer,
  selected,
  onToggle,
  onMerge,
}: {
  member: RosterMember;
  canManage: boolean;
  isViewer: boolean;
  selected: boolean;
  onToggle: (member: RosterMember, viaKeyboard: boolean) => void;
  onMerge: (member: RosterMember) => void;
}) {
  const router = useRouter();
  const href = profileHref(member.playerId);

  return (
    <li
      id={rosterRowId(member.playerId)}
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      onClick={(event) => {
        // `Tb4`: "⌘-click anywhere on the row" is the direct path to the page.
        if (event.metaKey || event.ctrlKey) {
          router.push(href);
          return;
        }
        onToggle(member, false);
      }}
      onKeyDown={(event) => {
        // The row itself, not the link inside it — Enter on the name link is
        // the link's own navigation and bubbles through here.
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(member, true);
        }
      }}
      className={cn(
        ROW,
        ROW_BOX,
        "cursor-pointer transition-colors duration-[var(--duration-hover)]",
        "hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none has-[:focus-visible]:bg-[var(--surface-muted)]",
        // The persistent wash (20f). The same token as hover on purpose: a
        // selected row looks like the row you are on, which it is.
        selected && "bg-[var(--surface-muted)]"
      )}
    >
      <LineupSpot spot={member.lineupSpot} />

      <span className={cn(COL.player, "flex min-w-0 items-center gap-2.5")}>
        <Avatar name={member.name} />
        <span className="flex min-w-0 items-baseline gap-1.5">
          <Link
            href={href}
            title="Open profile"
            onClick={(event) => event.stopPropagation()}
            className="block truncate rounded-[var(--radius-cell)] text-[13px] font-medium text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {member.name}
          </Link>
          {/* ink-500, the same tier as every other piece of metadata on the
              row. At ink-400 it was the faintest thing on the page — the one
              row a person scans for first, whispering. */}
          {isViewer && (
            <span className="shrink-0 text-[11px] text-[var(--ink-500)]">you</span>
          )}
        </span>
      </span>

      <span className={cn(COL.form, "flex items-center")}>
        <FormTicks form={member.form} />
      </span>

      <Record wins={member.wins} losses={member.losses} />

      <LastMatchCell member={member} canManage={canManage} onMerge={onMerge} />
    </li>
  );
}

export function RosterTable({
  members,
  invites,
  canManage,
  viewerId,
  selectedId,
  onToggle,
  onMerge,
  run,
  pending,
}: {
  members: RosterMember[];
  invites: RosterInvite[];
  canManage: boolean;
  /** So the viewer's own row can say so, and "by you" can mean them. */
  viewerId: string;
  /** The row wearing the persistent wash, or null with the drawer closed. */
  selectedId: string | null;
  onToggle: (member: RosterMember, viaKeyboard: boolean) => void;
  onMerge: (member: RosterMember) => void;
  /** The page's one transition — every invite write runs through it. */
  run: (action: () => Promise<ActionResult | InviteResult>) => void;
  pending: boolean;
}) {
  return (
    /* `Tb4`: one white table card at full width — `.surface-card` with
       `padding:2px 24px 6px`. Hairline border (`--border-card`), not the
       medium one the previous round drew. */
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[640px] px-6 pt-0.5 pb-1.5">
        <div
          className={cn(ROW, "border-b border-[var(--border-hairline)] pt-3 pb-2.5")}
        >
          {/* The list is already in lineup order; the arrow says which way
              that reads. It is a label, not a control — nothing here sorts. */}
          <span className={cn(COL.spot, "inline-flex items-center gap-[3px]")}>
            <span className="eyebrow-sm">#</span>
            <ArrowUp
              className="size-2.5 text-[var(--ink-700)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <span className="sr-only">Lineup order, lowest first</span>
          </span>
          <span className={cn(COL.player, "eyebrow-sm")}>Player</span>
          <span className={cn(COL.form, "eyebrow-sm")}>Form</span>
          <span className={cn(COL.record, "eyebrow-sm")}>Record</span>
          <span className={cn(COL.last, "eyebrow-sm")}>Last match</span>
        </div>

        <ul>
          {members.map((member) => (
            <MemberRow
              key={member.playerId}
              member={member}
              canManage={canManage}
              isViewer={member.userId === viewerId}
              selected={member.playerId === selectedId}
              onToggle={onToggle}
              onMerge={onMerge}
            />
          ))}

          {/* Invitations belong in this list, not under it. Someone a coach
              emailed on Monday is on the roster as far as the coach is
              concerned; a second table below the first makes them look like
              a different kind of thing. Same 52px row, no wash, no cursor —
              there is no drawer for somebody who has not arrived. */}
          {invites.map((invite) => (
            <li key={invite.id} className={cn(ROW, ROW_BOX)}>
              <LineupSpot spot={null} />

              <span className={cn(COL.player, "flex min-w-0 items-center gap-2.5")}>
                <InviteRing />
                <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
                  {invite.email}
                </span>
              </span>

              <span className="truncate text-[11px] whitespace-nowrap text-[var(--ink-500)]">
                <InvitedLine
                  invitedOn={invite.invitedOn}
                  role={invite.role}
                  byViewer={invite.invitedBy === viewerId}
                />
              </span>

              <span className="flex-1" />

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
                        role: resendRole(invite.role),
                      })
                    )
                  }
                  className={RESEND_CLASS}
                >
                  {RESEND_LABEL}
                </button>
                {/* Revoke hovers to `--danger`, not to the `--ink-900` the
                    frame draws. Deliberate divergence, carried forward: this
                    is the one destructive action in the row, and the tint is
                    the only thing distinguishing it from Resend beside it.
                    Do not "restore" it to ink on a later fidelity pass. */}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => revokeInvite(invite.id))}
                  className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
                >
                  {REVOKE_LABEL}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
