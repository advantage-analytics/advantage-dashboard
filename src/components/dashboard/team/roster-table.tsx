"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitMerge, GripVertical } from "lucide-react";
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
 * The players on the program, and the order they play in.
 *
 * Platform Audit `Tb4`/`Tb4c`, as revised in review. Four rules decide
 * everything below, and each replaced something that was there first:
 *
 * ── 1. Players only ─────────────────────────────────────────────────────────
 * Staff used to sit in this same table, told apart only by the words under
 * their name — which made a coach read as a player ranked #7. They are named
 * in a sentence under the table now, and managed in Settings › Team. The page
 * filters them out; this component never sees one.
 *
 * ── 2. The name takes the slack ─────────────────────────────────────────────
 * `#`, Player, then a spacer, then Record, Form, Last match. Every metric is
 * fixed-width and packs to the right, so the only gap in the row falls on a
 * column boundary. Before this, Last match was the flexible cell with the date
 * pinned to its far edge, which opened ~600px of nothing mid-row and left
 * "A. Castillo" and "Aug 8" — one fact — reading as two.
 *
 * Record leads Form: the number a coach ranks by first, the five-tick trail
 * that qualifies it second.
 *
 * ── 3. One trailing token ───────────────────────────────────────────────────
 * The last-match cell was answering two questions at once — what happened, and
 * what state the analysis is in — so every state grew its own trailing element
 * and the column lost its shape. Now: mark, opponent, and exactly ONE token in
 * the same place. A settled row shows its date, a running row shows Analyzing,
 * an unscored row shows Review score. The elapsed clock is gone entirely; the
 * activity tray is where a running job is tracked.
 *
 * The two token treatments are deliberately different, and the difference is
 * the rule rather than an oversight: `StatusChip` is a flat dot-and-label with
 * no container (its own note: a filled pill in a table cell "competes with the
 * number for the eye"), and it means *nothing to do*. The filled grey pill is
 * this table's existing clickable-question treatment — the same one
 * "Possible duplicate" wears — and it means *your move*.
 *
 * ── 4. Set lineup is a mode, not a column ───────────────────────────────────
 * The action rides the column-header row. Pressing it turns this table into
 * the editor: rows become draggable, the grip borrows the `#` cell of the row
 * under the pointer, and a click no longer opens the drawer — which is why it
 * is a mode with its own Cancel rather than a handle sitting there always.
 * `RosterView` owns that state and the save.
 */

/** Column widths. Only the spacer flexes. */
const COL = {
  spot: "w-6 shrink-0",
  player: "w-[230px] shrink-0",
  record: "w-14 shrink-0",
  form: "w-20 shrink-0",
  last: "w-[250px] shrink-0",
} as const;

const ROW = "flex items-center gap-4";

/**
 * Horizontal padding belongs to the card; each row pulls 16px of it back so a
 * wash reads as a rounded panel inset from the card's edge rather than a band
 * running wall to wall. No hairlines between rows — the wash is the boundary.
 */
const ROW_BOX = "-mx-4 h-[52px] rounded-[var(--radius-element)] px-4";

export function rosterRowId(playerId: string): string {
  return `roster-row-${playerId}`;
}

export function profileHref(playerId: string): string {
  return `/dashboard/team/roster/${playerId}`;
}

/** What `RosterView` hands down while Set lineup is on. */
export interface LineupDraft {
  /** Player ids in the lineup, in order. Position 0 is line 1. */
  order: string[];
  /** Player ids currently out of the lineup. */
  bench: string[];
  /** The row a keyboard user has lifted, or null. */
  lifted: string | null;
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
 * The 14px slot every last-match row opens with, so the opponent sits on the
 * same x whatever the row's state.
 */
function MarkSlot({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex w-3.5 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

/** Mark, opponent, and exactly one trailing token. See rule 3 above. */
function LastMatchCell({ member }: { member: RosterMember }) {
  const { lastMatch } = member;

  if (lastMatch === null) {
    return (
      <span className={cn(COL.last, "flex items-center")}>
        <span className="text-[12px] text-[var(--ink-400)]">No matches yet</span>
      </span>
    );
  }

  if (lastMatch.analyzing) {
    return (
      <span className={cn(COL.last, "flex items-center gap-2.5")}>
        <MarkSlot>
          <span aria-hidden className="size-[5px] rounded-full bg-[var(--ink-300)]" />
        </MarkSlot>
        <span className="truncate text-[12px] text-[var(--ink-700)]">
          {lastMatch.opponent}
        </span>
        <StatusChip tone="blue" live className="ml-auto shrink-0">
          Analyzing
        </StatusChip>
      </span>
    );
  }

  if (lastMatch.won === null) {
    return (
      <span className={cn(COL.last, "flex items-center gap-2.5")}>
        <MarkSlot>
          <span aria-hidden className="text-[11px] text-[var(--ink-400)]">
            –
          </span>
          <span className="sr-only">Result unrecorded against</span>
        </MarkSlot>
        <span className="truncate text-[12px] text-[var(--ink-700)]">
          {lastMatch.opponent}
        </span>
        <span className="ml-auto inline-flex h-5 shrink-0 items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[10px] font-medium text-[var(--ink-700)]">
          Review score
        </span>
      </span>
    );
  }

  return (
    <span className={cn(COL.last, "flex items-center gap-2.5")}>
      <MarkSlot>
        <ResultMark won={lastMatch.won} />
      </MarkSlot>
      <span className="truncate text-[12px] text-[var(--ink-700)]">
        {lastMatch.opponent}
      </span>
      <span className="text-micro tabular ml-auto shrink-0 whitespace-nowrap">
        {lastMatch.date}
      </span>
    </span>
  );
}

/**
 * The leading cell: a line number at rest, the drag grip while a lineup is
 * being set and this row is the one under the pointer or holding focus.
 *
 * The grip swaps in rather than taking a column of its own, so entering the
 * mode moves nothing — and it swaps in for ONE row at a time, so every other
 * line keeps the number that says what the order currently is.
 */
function SpotCell({
  spot,
  draggable,
  lifted,
}: {
  spot: number | null;
  draggable: boolean;
  lifted: boolean;
}) {
  if (draggable) {
    return (
      <span className={cn(COL.spot, "flex items-center justify-center")}>
        <GripVertical
          aria-hidden
          strokeWidth={1.5}
          className={cn(
            "size-3.5",
            lifted
              ? "text-[var(--ink-900)]"
              : "text-[var(--ink-400)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        />
        {!lifted && (
          <span
            aria-hidden
            className="mono tabular absolute text-[11px] text-[var(--ink-500)] transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
          >
            {spot ?? "—"}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        COL.spot,
        "mono tabular text-center text-[11px]",
        spot === null ? "text-[var(--ink-400)]" : "text-[var(--ink-500)]"
      )}
    >
      {spot ?? "—"}
    </span>
  );
}

function MemberRow({
  member,
  spot,
  canManage,
  isViewer,
  selected,
  onToggle,
  onMerge,
  lineup,
  onLift,
  onMove,
  onDragStartRow,
  onDragOverRow,
  onDragEndRow,
}: {
  member: RosterMember;
  /** The line this row currently holds — live while dragging. */
  spot: number | null;
  canManage: boolean;
  isViewer: boolean;
  selected: boolean;
  onToggle: (member: RosterMember, viaKeyboard: boolean) => void;
  onMerge: (member: RosterMember) => void;
  lineup: LineupDraft | null;
  onLift: (playerId: string | null) => void;
  onMove: (playerId: string, direction: 1 | -1) => void;
  onDragStartRow: (playerId: string) => void;
  onDragOverRow: (playerId: string) => void;
  onDragEndRow: () => void;
}) {
  const router = useRouter();
  const href = profileHref(member.playerId);
  const inLineupMode = lineup !== null;
  const lifted = lineup?.lifted === member.playerId;

  return (
    <li
      id={rosterRowId(member.playerId)}
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      draggable={inLineupMode}
      onDragStart={(event) => {
        if (!inLineupMode) return;
        // Firefox refuses to start a drag without data on the transfer.
        event.dataTransfer.setData("text/plain", member.playerId);
        event.dataTransfer.effectAllowed = "move";
        onDragStartRow(member.playerId);
      }}
      onDragOver={(event) => {
        if (!inLineupMode) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        onDragOverRow(member.playerId);
      }}
      onDrop={(event) => {
        if (!inLineupMode) return;
        event.preventDefault();
        onDragEndRow();
      }}
      onDragEnd={onDragEndRow}
      onClick={(event) => {
        // In lineup mode the row is a handle, not a link. Without this the
        // drawer would open every time a drag ended a pixel from where it
        // started.
        if (inLineupMode) return;
        if (event.metaKey || event.ctrlKey) {
          router.push(href);
          return;
        }
        onToggle(member, false);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;

        if (inLineupMode) {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onLift(lifted ? null : member.playerId);
            return;
          }
          if (lifted && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
            event.preventDefault();
            onMove(member.playerId, event.key === "ArrowDown" ? 1 : -1);
            // Focus follows the row it moved to.
            requestAnimationFrame(() => {
              document.getElementById(rosterRowId(member.playerId))?.focus();
            });
          }
          return;
        }

        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(member, true);
        }
      }}
      className={cn(
        ROW,
        ROW_BOX,
        "group relative transition-colors duration-[var(--duration-hover)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none has-[:focus-visible]:bg-[var(--surface-muted)]",
        inLineupMode
          ? "cursor-grab active:cursor-grabbing hover:bg-[var(--surface-muted)]"
          : "cursor-pointer hover:bg-[var(--surface-muted)]",
        selected && !inLineupMode && "bg-[var(--surface-muted)]",
        lifted &&
          "bg-[var(--surface-card)] shadow-[var(--shadow-card-emphasis)] ring-1 ring-[var(--border-medium)]"
      )}
    >
      <SpotCell spot={spot} draggable={inLineupMode} lifted={lifted} />

      <span className={cn(COL.player, "flex min-w-0 items-center gap-2.5")}>
        <Avatar name={member.name} />
        <span className="flex min-w-0 items-baseline gap-1.5">
          {inLineupMode ? (
            <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
              {member.name}
            </span>
          ) : (
            <Link
              href={href}
              title="Open profile"
              onClick={(event) => event.stopPropagation()}
              className="block truncate rounded-[var(--radius-cell)] text-[13px] font-medium text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              {member.name}
            </Link>
          )}
          {isViewer && (
            <span className="shrink-0 text-[11px] text-[var(--ink-500)]">you</span>
          )}
        </span>
      </span>

      {/* The slack. Everything after it packs to the right. */}
      <span className="flex-1" />

      {/* The merge repair is entered from the row, because a duplicate is
          found by looking at the list. Quiet — a question, not an alarm. */}
      {canManage && !inLineupMode && member.duplicateOfPlayerId && (
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

      <Record wins={member.wins} losses={member.losses} />
      <span className={cn(COL.form, "flex items-center gap-[3px]")}>
        <FormTicks form={member.form} />
      </span>
      <LastMatchCell member={member} />
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
  lineup,
  onStartLineup,
  onLift,
  onMove,
  onDragStartRow,
  onDragOverRow,
  onDragEndRow,
  onDropOnBench,
}: {
  /** Players only — the page keeps staff out of this list entirely. */
  members: RosterMember[];
  invites: RosterInvite[];
  canManage: boolean;
  viewerId: string;
  selectedId: string | null;
  onToggle: (member: RosterMember, viaKeyboard: boolean) => void;
  onMerge: (member: RosterMember) => void;
  run: (action: () => Promise<ActionResult | InviteResult>) => void;
  pending: boolean;
  /** Non-null while Set lineup is on. */
  lineup: LineupDraft | null;
  onStartLineup: () => void;
  onLift: (playerId: string | null) => void;
  onMove: (playerId: string, direction: 1 | -1) => void;
  onDragStartRow: (playerId: string) => void;
  onDragOverRow: (playerId: string) => void;
  onDragEndRow: () => void;
  onDropOnBench: () => void;
}) {
  const byId = new Map(members.map((member) => [member.playerId, member]));

  // At rest the server's order is the order. In lineup mode the draft is,
  // so rows renumber live as they are dragged.
  const inLine = lineup
    ? lineup.order.flatMap((id) => byId.get(id) ?? [])
    : members.filter((member) => member.lineupSpot !== null);
  const benched = lineup
    ? lineup.bench.flatMap((id) => byId.get(id) ?? [])
    : members.filter((member) => member.lineupSpot === null);

  const rowFor = (member: RosterMember, spot: number | null) => (
    <MemberRow
      key={member.playerId}
      member={member}
      spot={spot}
      canManage={canManage}
      isViewer={member.userId === viewerId}
      selected={member.playerId === selectedId}
      onToggle={onToggle}
      onMerge={onMerge}
      lineup={lineup}
      onLift={onLift}
      onMove={onMove}
      onDragStartRow={onDragStartRow}
      onDragOverRow={onDragOverRow}
      onDragEndRow={onDragEndRow}
    />
  );

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
      <div className="min-w-[760px] px-6 pt-0.5 pb-1.5">
        {/* Set lineup rides this row rather than a card header of its own —
            the eyebrow row already spans the table. */}
        <div
          className={cn(
            ROW,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5"
          )}
        >
          <span className={cn(COL.spot, "eyebrow-sm text-center")}>#</span>
          <span className={cn(COL.player, "eyebrow-sm")}>Player</span>
          <span className="flex-1" />
          <span className={cn(COL.record, "eyebrow-sm")}>Record</span>
          <span className={cn(COL.form, "eyebrow-sm")}>Form</span>
          <span className={cn(COL.last, "eyebrow-sm")}>Last match</span>
          {canManage && !lineup && members.length > 1 && (
            <button
              type="button"
              onClick={onStartLineup}
              className="ml-4 inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-cell)] text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <GripVertical className="size-3" strokeWidth={1.5} aria-hidden />
              Set lineup
            </button>
          )}
        </div>

        <ul>
          {inLine.map((member, index) => rowFor(member, index + 1))}

          {/* Out of the lineup. A drop target in its own right, so somebody
              can be dragged off the ladder as well as onto it. */}
          {(benched.length > 0 || lineup) && (
            <li
              onDragOver={(event) => {
                if (!lineup) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                if (!lineup) return;
                event.preventDefault();
                onDropOnBench();
              }}
              className="flex items-center gap-2.5 pt-4 pb-2"
            >
              <span className="eyebrow-sm">Not in the lineup</span>
              {lineup && (
                <span className="text-[11px] text-[var(--ink-400)]">
                  — drag up to add
                </span>
              )}
            </li>
          )}
          {benched.map((member) => rowFor(member, null))}

          {/* Invitations belong in this list, not under it: somebody a coach
              emailed on Monday is on the roster as far as the coach is
              concerned. They hold no line, so a lineup ignores them. */}
          {invites.length > 0 && (
            <li className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] pt-3.5 pb-1.5">
              <span className="eyebrow-sm">Invited</span>
              {lineup && (
                <span className="text-[11px] text-[var(--ink-400)]">
                  — not part of a lineup
                </span>
              )}
            </li>
          )}
          {invites.map((invite) => (
            <li
              key={invite.id}
              className={cn(ROW, ROW_BOX, lineup && "opacity-40")}
            >
              <span className={cn(COL.spot, "mono text-center text-[11px] text-[var(--ink-400)]")}>
                —
              </span>
              <span className={cn(COL.player, "flex min-w-0 items-center gap-2.5")}>
                <InviteRing />
                <span className="min-w-0 truncate text-[12px] text-[var(--ink-500)]">
                  {invite.email}
                </span>
              </span>
              <span className="ml-4 truncate text-[11px] whitespace-nowrap text-[var(--ink-500)]">
                <InvitedLine
                  invitedOn={invite.invitedOn}
                  role={invite.role}
                  byViewer={invite.invitedBy === viewerId}
                />
              </span>
              <span className="flex-1" />
              {canManage && !lineup && (
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
                  {/* Revoke hovers to `--danger`, not the ink the frame draws.
                      Deliberate: it is the one destructive action in the row,
                      and the tint is all that separates it from Resend. Do not
                      "restore" it on a later fidelity pass. */}
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => revokeInvite(invite.id))}
                    className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--danger)] disabled:opacity-50"
                  >
                    {REVOKE_LABEL}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
