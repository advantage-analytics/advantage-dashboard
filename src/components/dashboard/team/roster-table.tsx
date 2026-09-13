"use client";

import Link from "next/link";
import { useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, Reorder, useReducedMotion } from "framer-motion";
import { GitMerge, GripVertical } from "lucide-react";
import { BENCH, sequenceFrom } from "@/lib/data/lineup-draft";
import { StatusChip } from "@/components/ui/status-chip";
import { ResultMark } from "@/components/dashboard/result-mark";
import { EmptyMark } from "@/components/ui/empty-mark";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import { recordLabel } from "@/lib/data/player-profile";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { cn } from "@/lib/utils";
import {
  inviteMember,
  revokeInvite,
  type InviteResult,
} from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import {
  InviteRing,
  InvitedLine,
  SUBTLE_PILL,
  RESEND_CLASS,
  RESEND_LABEL,
  REVOKE_LABEL,
  resendRole,
} from "@/components/dashboard/team/roster-vocabulary";
import type { RosterInvite, RosterMember } from "@/lib/data/team-roster-server";

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
 *
 * ── 5. The row in hand carries its own marks ────────────────────────────────
 * A blue outline says WHICH row; a blue disc in the gutter beside it says
 * WHERE it lands. Nothing is drawn between the rows: an earlier cut drew a
 * blue rule at the destination slot, but the held row already sits at that
 * slot under the pointer, so rule and row overlapped and it read as a cut
 * through the card. The gap the siblings slide open is a better indicator than
 * a line, and it costs nothing to draw. See `SpotBadge`.
 *
 * ── How the drag moves ──────────────────────────────────────────────────────
 * Pointer-driven, via framer-motion's `Reorder`, not HTML5 drag-and-drop. The
 * first cut used the native drag events and could not be made smooth: they
 * fire at a throttled rate, the held row only ever jumps between slots, and a
 * displaced row sliding under the cursor re-fires `dragover` mid-slide and
 * swaps straight back — a flicker loop no easing curve can fix. With
 * `Reorder` the held row follows the pointer as a transform, siblings slide
 * aside on `--ease-out-expo`, and touch comes for free.
 *
 * The lineup and the bench are ONE reorderable sequence with a sentinel
 * (`BENCH`) between them: everything above it holds a line, everything below
 * does not. Dragging a row across the sentinel is how it enters or leaves the
 * lineup — one gesture, no second control, and the keyboard's ↑/↓ cross it the
 * same way.
 */

/**
 * The system's confident arrival: `--ease-out-expo`. Rows displaced by a drag
 * slide on it; the held row's shadow eases on `--duration-fast`. Nothing here
 * bounces — the design system bans it, and a lineup is not a toy.
 */
const EASE_OUT_EXPO = [0.23, 1, 0.32, 1] as const;
const ROW_SLIDE = { duration: 0.22, ease: EASE_OUT_EXPO };
/**
 * The bench divider leaving. Exits are faster than arrivals — the mode is
 * over, and the eye is already back on the rows — so this undercuts
 * `ROW_SLIDE` rather than mirroring it.
 */
const DIVIDER_OUT = { duration: 0.16, ease: EASE_OUT_EXPO };

/**
 * How a released row settles into its slot. framer's default is an inertia
 * spring at stiffness 500 / damping 25 — under-damped, so a row let go with
 * any hand velocity overshoots its slot and bounces back. Critically damped
 * instead: it arrives once, in about the time a sibling takes to slide.
 */
const ROW_SETTLE = { bounceStiffness: 600, bounceDamping: 50 };

/** Column widths. Only the spacer flexes. */
/**
 * Exported for `roster-day-zero.tsx`, which draws this table holding nothing.
 * A ghost row that restates its own widths drifts from the real one silently;
 * importing them makes that impossible.
 */
export { COL, ROW, ROSTER_COLUMNS } from "./roster-table-layout";
import { COL, ROW, ROSTER_COLUMNS } from "./roster-table-layout";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { useWorkspace } from "@/components/dashboard/workspace-provider";

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
  /** Player ids with one `BENCH` between them, in display order. */
  sequence: string[];
  /** The row a keyboard user has lifted, or null. */
  lifted: string | null;
  /** The row under the pointer, or null — so it can draw itself held. */
  dragging: string | null;
}

/** "4–1", or the empty mark for somebody with nothing decided yet. */
function Record({ wins, losses }: { wins: number; losses: number }) {
  return (
    <span
      className={cn(
        COL.record,
        "tabular flex items-center text-[13px] text-[var(--ink-900)]",
      )}
    >
      {wins + losses === 0 ? (
        <EmptyMark label="No record yet" />
      ) : (
        recordLabel(wins, losses)
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
    // The mark alone. Three dashes under three headings already say "nothing
    // yet" once; a sentence beside the third said it a second time, in a
    // different voice, and pulled the eye to the one row with the least in
    // it. The words stay for a screen reader, which cannot read a dash.
    return (
      <span className={cn(COL.last, "flex items-center")}>
        <EmptyMark label="No matches yet" />
      </span>
    );
  }

  if (lastMatch.analyzing) {
    return (
      <span className={cn(COL.last, "flex items-center gap-2.5")}>
        <MarkSlot>
          <span
            aria-hidden
            className="size-[5px] rounded-full bg-[var(--ink-300)]"
          />
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
        <span className={cn(SUBTLE_PILL, "ml-auto shrink-0")}>
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
 * mode moves no column — and it swaps in for ONE row at a time, so every other
 * line keeps the number that says what the order currently is.
 *
 * The held row's own line is NOT drawn here. It rides in the gutter beside the
 * row (`SpotBadge`), which is what keeps the grip and the number on screen at
 * the same time — they answer different questions, and the row in hand is the
 * one moment both are worth asking.
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
              : "text-[var(--ink-400)] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100",
          )}
        />
        {!lifted && (
          <span
            aria-hidden
            className="mono tabular absolute text-[11px] text-[var(--ink-500)] transition-opacity group-focus-within:opacity-0 group-hover:opacity-0"
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
        spot === null ? "text-[var(--ink-400)]" : "text-[var(--ink-500)]",
      )}
    >
      {spot ?? "—"}
    </span>
  );
}

/**
 * The line the held row takes if it is let go here — a blue disc in the page
 * margin beside the card, level with the row, 10px clear of its outline.
 *
 * OUTSIDE the card on purpose (design option 2C). Beside the row it is
 * unmistakably about the row in hand and not one more value in a column of
 * five; the grip keeps the `#` cell it borrowed; and the table does not have
 * to open a gutter to make room, so nothing inside the card moves when the
 * mode begins. A row's box starts 8px inside the card, the outline adds 2, the
 * gap 10, the disc 20 — so it sits 4px past the card's border, in the 32px
 * page margin. The card stops clipping while the mode is on (see the wrapper
 * in `RosterTable`), which is what lets it show.
 *
 * It replaced a blue rule drawn across the list at the destination slot: with
 * a pointer drag the held row is already at that slot, riding the hand a few
 * pixels off it, so rule and row overlapped and read as a cut through the card.
 */
function SpotBadge({ spot }: { spot: number | null }) {
  return (
    <span
      aria-hidden
      className="mono tabular absolute top-1/2 -left-8 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--blue)] text-[10px] font-medium text-white"
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
  listRef,
  onLift,
  onMove,
  onDragStartRow,
  onDragEndRow,
  onFocusStep,
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
  /** The list — what a drag is constrained to. */
  listRef: React.RefObject<HTMLUListElement | null>;
  onLift: (playerId: string | null) => void;
  onMove: (playerId: string, direction: 1 | -1) => void;
  onDragStartRow: (playerId: string) => void;
  onDragEndRow: () => void;
  /** Move focus to the neighbouring row — the arrows' job while nothing is lifted. */
  onFocusStep: (playerId: string, direction: 1 | -1) => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { viewer } = useWorkspace();
  const href = profileHref(member.playerId);
  const inLineupMode = lineup !== null;
  // Held by either hand: lifted with Space, or under the pointer mid-drag.
  const lifted =
    lineup?.lifted === member.playerId || lineup?.dragging === member.playerId;

  return (
    <Reorder.Item
      as="li"
      value={member.playerId}
      id={rosterRowId(member.playerId)}
      tabIndex={0}
      aria-current={selected ? "true" : undefined}
      /* Only the mode makes a row a handle. Outside it the item is inert and
         the click below opens the drawer. */
      dragListener={inLineupMode}
      /* The row cannot leave the list. The card clips at its edge — its
         `overflow-x-auto` makes it a scroll box in both axes — so a row
         dragged past the last slot was cut off, outline and all, and the card
         grew a scrollbar. There is nothing below the last slot to drop on
         anyway. A little give at the ends, so the boundary feels like a
         boundary and not a wall. */
      dragConstraints={listRef}
      dragElastic={0.08}
      dragTransition={ROW_SETTLE}
      onDragStart={() => onDragStartRow(member.playerId)}
      onDragEnd={onDragEndRow}
      /* A pointer grab is also a selection: the row under the hand is the
         one the keys act on next, so it takes focus and shows it. */
      onPointerDown={(event) => {
        if (inLineupMode) event.currentTarget.focus({ preventScroll: true });
      }}
      /* `position` only: nothing here changes size, and animating size would
         re-layout the whole card each frame. The held row is exempt from the
         slide — it is under the pointer, not on its way somewhere. */
      layout="position"
      transition={{ layout: reduceMotion ? { duration: 0 } : ROW_SLIDE }}
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
          // Space lifts; Space again sets down. Between the two, the arrows
          // move the row. Outside them, the arrows move *you* — from row to
          // row — so the whole lineup is reachable without a pointer: walk,
          // lift, move, drop, walk on.
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onLift(lifted ? null : member.playerId);
            return;
          }
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            const direction = event.key === "ArrowDown" ? 1 : -1;
            if (lifted) {
              onMove(member.playerId, direction);
              // Focus follows the row it moved with.
              requestAnimationFrame(() => {
                document.getElementById(rosterRowId(member.playerId))?.focus();
              });
            } else {
              onFocusStep(member.playerId, direction);
            }
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
        "group relative transition-[background-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-expo)]",
        "focus-visible:outline-none",
        !lifted &&
          "focus-visible:bg-[var(--surface-muted)] has-[:focus-visible]:bg-[var(--surface-muted)]",
        inLineupMode ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        /* The wash is for rows still on the surface. A held row is off it —
           opaque and shadowed — so it must not take the hover tint the
           pointer sitting on top of it would otherwise give it. */
        !lifted && "hover:bg-[var(--surface-muted)]",
        selected && !inLineupMode && "bg-[var(--surface-muted)]",
        /* One outline, two weights of it.

           FOCUSED is the system's own ring, by value — the same
           `--focus-ring` `focus.css` gives every tabbable control, so a row
           reads as focused the way a button does and this table invents no
           second focus colour. It is written on plain `:focus` rather than
           `:focus-visible` because in this mode a mouse click IS a selection,
           and a row focused programmatically on pointerdown does NOT match
           `:focus-visible` (measured) — so without this rule a coach who
           clicks a row sees nothing. On a keyboard the design system's own
           rule matches too and wins the cascade, but it sets this same value,
           so the two agree and nothing is competing. That is why no
           `!important` is needed here, and `advButton()` takes the same
           approach.

           HELD is a product state the system has no token for: the row is in
           your hand. Solid `--blue`, opaque fill, raised card. This one is
           `!important` because it must beat `focus.css` — that file is
           imported OUTSIDE Tailwind's layers, so an ordinary utility loses to
           it whatever its specificity, and a held row silently wore the 40%
           ring instead. Inline style would also win, but framer-motion owns
           this element's `style` attribute and does not clear a key that
           stops being passed, which stranded the outline on rows focus had
           left. The stacking is flagged for the same layering reason: framer
           writes `z-index` inline on every item, and without `!` the row
           below painted its hover wash over this row's bottom 2px. */
        inLineupMode &&
          !lifted &&
          "focus:z-[2]! focus:shadow-[var(--focus-ring)] focus:outline-none",
        lifted &&
          "z-[3]! bg-[var(--surface-card)] shadow-[0_0_0_2px_var(--blue),var(--shadow-card-emphasis)]!",
        inLineupMode && "select-none",
      )}
    >
      {lifted && <SpotBadge spot={spot} />}
      <SpotCell spot={spot} draggable={inLineupMode} lifted={lifted} />

      <span className={cn(COL.player, "flex min-w-0 items-center gap-2.5")}>
        {isViewer ? (
          <PersonAvatar
            initials={viewer.initials}
            photoUrl={viewer.avatarUrl}
            className="size-[26px] text-[9px]"
          />
        ) : (
          <InitialsAvatar name={member.name} />
        )}
        <span className="flex min-w-0 items-baseline gap-1.5">
          {inLineupMode ? (
            <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
              {member.name}
            </span>
          ) : (
            <Link
              href={href}
              /* No `title`. A 52px row cannot give a long name the height, so
                 it truncates — but the tooltip that used to disclose it drew
                 in the OS's own style, and the full name is already one click
                 away in the drawer, which wraps it. CSS truncation hides
                 nothing from a screen reader either: the text stays in the
                 DOM and is read in full. */
              onClick={(event) => event.stopPropagation()}
              className="block truncate rounded-[var(--radius-cell)] text-[13px] font-medium text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              {member.name}
            </Link>
          )}
          {isViewer && (
            <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
              you
            </span>
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
    </Reorder.Item>
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
  settling,
  onStartLineup,
  onLift,
  onMove,
  onReorder,
  onDragStartRow,
  onDragEndRow,
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
  /** The order a Save just wrote, shown until `members` catches up. */
  settling: string[] | null;
  onStartLineup: () => void;
  onLift: (playerId: string | null) => void;
  onMove: (playerId: string, direction: 1 | -1) => void;
  /** The whole sequence after a drag — ids and the sentinel, in new order. */
  onReorder: (sequence: string[]) => void;
  onDragStartRow: (playerId: string) => void;
  onDragEndRow: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const listRef = useRef<HTMLUListElement>(null);
  const byId = new Map(members.map((member) => [member.playerId, member]));

  // The order on screen, and whether it is ours or the server's. `held` is an
  // order we are drawing over the rows: the draft being edited, or — for the
  // moment after Save, before the revalidated `members` land — the one Save
  // just wrote (`settling` in `RosterView`). Named once because two things
  // read it: the list itself, and the line numbers beside it. At rest the
  // server's order is the order, and the sentinel appears only if somebody is
  // actually out of the lineup; in the mode it is always there, because it is
  // the drop target for benching somebody.
  const held = lineup?.sequence ?? settling;
  const sequence: string[] =
    held ?? sequenceFrom(members, { sentinel: "if-needed" });
  const benchAt = sequence.indexOf(BENCH);

  /** ↑/↓ with nothing lifted: focus walks the players, skipping the sentinel. */
  const focusStep = (playerId: string, direction: 1 | -1) => {
    const players = sequence.filter((id) => id !== BENCH);
    const next = players[players.indexOf(playerId) + direction];
    if (next) document.getElementById(rosterRowId(next))?.focus();
  };

  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]",
        /* At rest the card scrolls sideways when the viewport is narrower than
           the table. In the mode it must not clip: the held row's line number
           sits OUTSIDE the card, in the page margin beside it (`SpotBadge`),
           and a scroll box clips on both axes whatever its `overflow-x` says.
           Setting a lineup is a desk job, and the page's own scroll takes the
           narrow case for the minute the mode is on. Nothing else moves —
           no padding opens, no column shifts — which is the point. */
        lineup ? "overflow-visible" : "overflow-x-auto",
      )}
    >
      {/* 768px is the row's actual intrinsic width, not a round number:
          24 + 230 + 56 + 80 + 250 of fixed columns, five 16px gaps between
          the six items, and the 48px this box pads by. The old 760 was 8px
          short, so at the threshold the shrink-0 cells overflowed their own
          padding box before `overflow-x-auto` caught them. */}
      <div className="min-w-[768px] px-6 pt-0.5 pb-1.5">
        {/* Set lineup rides this row rather than a card header of its own —
            the eyebrow row already spans the table. */}
        <div
          className={cn(
            ROW,
            "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
          )}
        >
          {ROSTER_COLUMNS.map((column) =>
            "spacer" in column ? (
              <span key="spacer" className="flex-1" />
            ) : (
              <span
                key={column.label}
                className={cn(
                  column.col,
                  "eyebrow-sm",
                  column.center && "text-center",
                  column.label === "Last match" && "flex items-center",
                )}
              >
                {column.label}
                {/* Set lineup rides INSIDE the last column, not after it. As a
                    sibling it took a column's worth of the row and pushed every
                    heading ~100px left of the cells beneath — Record sat over
                    the spacer. The column is 250px and its label is short, so
                    the action rides its far end and the headings stay over
                    their values. */}
                {column.label === "Last match" &&
                  canManage &&
                  !lineup &&
                  members.length > 1 && (
                    <button
                      type="button"
                      onClick={onStartLineup}
                      className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-cell)] text-[11px] font-medium tracking-normal text-[var(--blue)] normal-case transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    >
                      <GripVertical
                        className="size-3"
                        strokeWidth={1.5}
                        aria-hidden
                      />
                      Set lineup
                    </button>
                  )}
              </span>
            ),
          )}
        </div>

        <Reorder.Group
          ref={listRef}
          as="ul"
          axis="y"
          values={sequence}
          onReorder={onReorder}
        >
          {/* The one child that comes and goes on its own is the bench divider:
              the editor's sequence always carries it (a benched player needs
              somewhere to land) while the resting table only draws it over a
              bench with somebody on it. With nobody benched, entering and
              leaving the mode used to add and remove ~40px in one frame — the
              table's height snapped and everything under it jumped, while the
              rows themselves slid on `ROW_SLIDE`. The divider now grows and
              collapses as a row, height and opacity together, so the card
              changes height continuously and the page follows it. Rows never
              unmount here (a lineup reorders, it does not delete), so the
              presence wrapper only ever has this one exit to run — a member row
              carries no `exit`, so one removed or merged away still unmounts
              at once. Give a row an `exit` and it animates here. */}
          <AnimatePresence initial={false}>
            {sequence.map((id, index) => {
              if (id === BENCH) {
                return (
                  /* The bench divider is itself an item in the sequence — that is
                   what lets a row be dragged across it — but not a handle. */
                  <Reorder.Item
                    key={BENCH}
                    as="li"
                    value={BENCH}
                    dragListener={false}
                    layout="position"
                    /* Height, not a transform: a transform would slide the label
                     while the space it occupied stayed open, and the whole
                     point is the space. `border-box` puts the padding inside
                     `height`, so 0 → auto collapses the row entirely. Bounded
                     to this one line of text, once per mode change. */
                    initial={reduceMotion ? false : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={
                      reduceMotion
                        ? { opacity: 0, transition: { duration: 0 } }
                        : { opacity: 0, height: 0, transition: DIVIDER_OUT }
                    }
                    transition={reduceMotion ? { duration: 0 } : ROW_SLIDE}
                    /* gap-1.5 (6px) picked by eye at 11px against the eyebrow — the
                     em dash is its own aria-hidden span so this one gap value
                     produces equal spacing on both sides of it. */
                    className="flex items-center gap-1.5 overflow-hidden pt-4 pb-2 select-none"
                  >
                    <span className="eyebrow-sm">Not in the lineup</span>
                    {lineup && (
                      <>
                        <span
                          aria-hidden="true"
                          className="text-[11px] text-[var(--ink-400)]"
                        >
                          —
                        </span>
                        <span className="text-[11px] text-[var(--ink-400)]">
                          <span className="sr-only">: </span>
                          drag a row below this line to bench them
                        </span>
                      </>
                    )}
                  </Reorder.Item>
                );
              }
              const member = byId.get(id);
              if (!member) return null;
              // The number is the position in `held` whenever we are drawing our
              // own order — in the mode it is what Save will write, and just
              // after Save it is what Save wrote. Reading `member.lineupSpot`
              // there would badge a row sitting at the top with the spot it held
              // BEFORE the save, for as long as the server's rows take to
              // arrive. At rest it is the server's value, which can differ from
              // position when two players share a line from the Edit player
              // form.
              const spot = held
                ? benchAt < 0 || index < benchAt
                  ? index + 1
                  : null
                : member.lineupSpot;
              return (
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
                  listRef={listRef}
                  onLift={onLift}
                  onMove={onMove}
                  onDragStartRow={onDragStartRow}
                  onDragEndRow={onDragEndRow}
                  onFocusStep={focusStep}
                />
              );
            })}
          </AnimatePresence>

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
              <span
                className={cn(
                  COL.spot,
                  "mono text-center text-[11px] text-[var(--ink-400)]",
                )}
              >
                —
              </span>
              <span
                className={cn(COL.player, "flex min-w-0 items-center gap-2.5")}
              >
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
                        }),
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
        </Reorder.Group>
      </div>
    </div>
  );
}
