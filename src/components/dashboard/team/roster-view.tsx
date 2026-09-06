"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  RosterTable,
  rosterRowId,
  type LineupDraft,
} from "@/components/dashboard/team/roster-table";
import { BENCH, lineupChanged, lineupOrder } from "@/lib/data/lineup-draft";
import {
  DRAWER_ATTR,
  PlayerDrawer,
} from "@/components/dashboard/team/player-drawer";
import { EditPlayerDialog } from "@/components/dashboard/team/edit-player-dialog";
import { MergeProfilesDialog } from "@/components/dashboard/team/merge-profiles-dialog";
import { setProgramLineup } from "@/components/dashboard/team/roster-actions";
import { advButton } from "@/lib/ui/adv-button";
import { Kbd } from "@/components/ui/kbd";
import { GripVertical } from "lucide-react";
import type { InviteResult } from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import type {
  RosterInvite,
  RosterMember,
} from "@/lib/data/team-roster-server";

/**
 * The Roster page below its title: the table, the drawer a row opens, and the
 * lineup mode Set lineup turns the table into.
 *
 * The page stays a server component — it fetches, words the summary, decides
 * what a coach may see — and hands this the rendered title block plus the data.
 * This owns the three pieces of state that outlive a render: which row is
 * selected, whether a lineup is being set, and the draft order while it is.
 *
 * ── Why the actions are rendered here ───────────────────────────────────────
 * Invite and Add player swap for Cancel and Save lineup while the mode is on,
 * and a server component cannot swap them. So the page passes its buttons as a
 * node and this decides which set is on screen. Everything else in the frame —
 * title, summary, footer — is untouched by the mode, which is the point: the
 * page must not appear to move when a coach starts dragging.
 *
 * ── Keys live on the window ─────────────────────────────────────────────────
 * Esc and the arrows have to work wherever focus is. They are a window
 * listener that stands down for fields, open menus and modal dialogs; the
 * drawer's own `role="dialog"` is told from those by `DRAWER_ATTR`. Esc cancels
 * the lineup first and the drawer second, because the mode is the more
 * expensive thing to be stuck in.
 */
export function RosterView({
  members,
  invites,
  canManage,
  viewerId,
  initialSelectedId,
  title,
  actions,
  notices,
  footer,
}: {
  /** Players only. Staff are named in the footer and managed in Settings. */
  members: RosterMember[];
  invites: RosterInvite[];
  canManage: boolean;
  viewerId: string;
  /** `?player=` from the URL, or null. Ignored unless it names a row. */
  initialSelectedId: string | null;
  title: React.ReactNode;
  /** Invite + Add player. Replaced by Cancel + Save lineup while setting one. */
  actions: React.ReactNode;
  notices?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const initial =
    initialSelectedId && members.some((m) => m.playerId === initialSelectedId)
      ? initialSelectedId
      : null;

  const reduceMotion = useReducedMotion();
  // One curve for everything that moves on this page: the system's `--ease-out-expo`.
  const ease = [0.23, 1, 0.32, 1] as const;
  const quick = { duration: reduceMotion ? 0 : 0.12 };
  const settle = { duration: reduceMotion ? 0 : 0.2, ease };

  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [drawerId, setDrawerId] = useState<string | null>(initial);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [lineup, setLineup] = useState<LineupDraft | null>(null);
  /** What the last reorder did, for anyone listening rather than looking. */
  const [announcement, setAnnouncement] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterMember | null>(null);
  const [merging, setMerging] = useState<[RosterMember, RosterMember] | null>(
    null
  );
  const [pending, start] = useTransition();
  const [saving, startSaving] = useTransition();

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

  const drawerMember = drawerId
    ? members.find((m) => m.playerId === drawerId) ?? null
    : null;
  const drawerIndex = drawerMember ? members.indexOf(drawerMember) : -1;

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const select = useCallback((member: RosterMember, viaKeyboard: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
    setSelectedId(member.playerId);
    setDrawerId(member.playerId);
    setOpenedByKeyboard(viaKeyboard);
    syncUrl(member.playerId);
  }, []);

  const close = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedId(null);
      setClosing(true);
      syncUrl(null);
      // `onAnimationEnd` normally finishes this; the timer covers reduced
      // motion, where no animation runs, and is harmless when both fire.
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo) {
        document.getElementById(rosterRowId(returnFocusTo))?.focus();
      }
    },
    [finishClose]
  );

  const toggle = useCallback(
    (member: RosterMember, viaKeyboard: boolean) => {
      if (selectedId === member.playerId) {
        close(viaKeyboard ? member.playerId : null);
      } else {
        select(member, viaKeyboard);
      }
    },
    [selectedId, select, close]
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selectedId) return;
      const index = members.findIndex((m) => m.playerId === selectedId);
      const next = members[index + direction];
      if (!next) return;
      select(next, true);
      document
        .getElementById(rosterRowId(next.playerId))
        ?.scrollIntoView({ block: "nearest" });
    },
    [members, selectedId, select]
  );

  /* ── Setting the lineup ──────────────────────────────────────────────── */

  const startLineup = useCallback(() => {
    // The drawer and the mode cannot share the table: one wants a row click to
    // open a record, the other wants it to grab one.
    setSelectedId(null);
    finishClose();
    syncUrl(null);
    setError(null);
    setLineup({
      sequence: [
        ...members.filter((m) => m.lineupSpot !== null).map((m) => m.playerId),
        BENCH,
        ...members.filter((m) => m.lineupSpot === null).map((m) => m.playerId),
      ],
      lifted: null,
      dragging: null,
    });
  }, [members, finishClose]);

  const cancelLineup = useCallback(() => {
    setLineup(null);
    setAnnouncement("");
  }, []);

  /**
   * Save is live only when saving would change a spot. Not to spare the
   * database — a no-op save writes no player rows — but because it would still
   * log a `lineup.set` nobody made, and because an enabled primary is the
   * page's way of saying "you have changes". See `lineupChanged`.
   */
  const dirty = lineup !== null && lineupChanged(lineup.sequence, members);

  const saveLineup = useCallback(() => {
    if (!lineup) return;
    const order = lineupOrder(lineup.sequence);
    startSaving(async () => {
      setError(null);
      const result = await setProgramLineup(order);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The server action revalidates, so the new `members` arrive with their
      // spots already set; dropping the draft is what lets them through.
      setLineup(null);
      setAnnouncement("");
    });
  }, [lineup]);

  const onDragStartRow = useCallback((playerId: string) => {
    setLineup((current) =>
      current ? { ...current, dragging: playerId, lifted: null } : current
    );
  }, []);

  const onDragEndRow = useCallback(() => {
    setLineup((current) => (current ? { ...current, dragging: null } : current));
  }, []);

  /** `Reorder` hands back the whole sequence; the announcement names the row that moved. */
  const onReorder = useCallback(
    (sequence: string[]) => {
      setLineup((current) => {
        if (!current) return current;
        if (current.dragging) setAnnouncement(describe(sequence, current.dragging, members));
        return { ...current, sequence };
      });
    },
    [members]
  );

  const onLift = useCallback((playerId: string | null) => {
    setLineup((current) => (current ? { ...current, lifted: playerId } : current));
  }, []);

  /**
   * One step for a lifted row. The sentinel is just another position in the
   * sequence, so stepping past it is how a keyboard benches somebody or brings
   * them back — the same move the pointer makes, without a second control.
   */
  const onMove = useCallback(
    (playerId: string, direction: 1 | -1) => {
      setLineup((current) => {
        if (!current) return current;
        const from = current.sequence.indexOf(playerId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= current.sequence.length) return current;
        const sequence = [...current.sequence];
        sequence.splice(from, 1);
        sequence.splice(to, 0, playerId);
        setAnnouncement(describe(sequence, playerId, members));
        return { ...current, sequence };
      });
    },
    [members]
  );

  // The row the drawer showed is gone — removed, or merged away. Adjusted
  // during render rather than in an effect: React re-renders at once with the
  // corrected state, and nothing paints a drawer for a row that no longer
  // exists.
  if (drawerId && !drawerMember) {
    setSelectedId(null);
    setDrawerId(null);
    setClosing(false);
  }

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedId && !lineup) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (target.closest(`[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"])`))
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        if (lineup) cancelLineup();
        else if (selectedId) close(selectedId);
        return;
      }

      // The arrows walk the drawer. In lineup mode they belong to the lifted
      // row, and the row's own handler has them.
      if (lineup || !selectedId) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, lineup, close, cancelLineup, step]);

  return (
    <>
      <div className="flex w-full flex-1 bg-[var(--surface-card)]">
        <div className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-7 pb-8">
          <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-end lg:gap-10">
            {title}
            {/* The two button pairs crossfade rather than swap — the same
                spot, a different verb, and the eye should not have to re-find
                it. `popLayout` keeps the outgoing pair out of flow so the
                title never reflows underneath. */}
            <AnimatePresence mode="popLayout" initial={false}>
              {lineup ? (
                <motion.div
                  key="lineup-actions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={quick}
                  className="flex shrink-0 items-center gap-2.5"
                >
                  <button
                    type="button"
                    disabled={saving}
                    onClick={cancelLineup}
                    className={advButton("ghost")}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving || !dirty}
                    onClick={saveLineup}
                    className={advButton("primary")}
                  >
                    {saving ? "Saving…" : "Save lineup"}
                  </button>
                </motion.div>
              ) : (
                <motion.div
                  key="rest-actions"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={quick}
                  className="flex shrink-0 items-center"
                >
                  {actions}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {notices}

          {/* The mode says what it is and how to work it, once, above the
              table it changed — rather than a hint per row. */}
          {/* The banner arrives from just above its slot and leaves faster
              than it came; the table below is a layout-animated sibling, so it
              slides down to make room rather than jumping. */}
          <AnimatePresence initial={false}>
          {lineup && (
            /* The app's inline-notice register (`settings-alert.tsx`'s info
               tint: an 8% wash inside a 12% border), not a filled bar — the
               table below is the thing to look at, and this only has to say
               what mode it is in. Real keycaps from `ui/kbd.tsx`. */
            <motion.div
              key="lineup-banner"
              layout={!reduceMotion}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, transition: quick }}
              transition={settle}
              className="flex items-center gap-3 rounded-[var(--radius-element)] border border-[var(--blue-tint-12)] bg-[var(--blue-tint-08)] px-3.5 py-2.5"
            >
              <GripVertical
                className="size-3.5 shrink-0 text-[var(--blue)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] leading-[1.5] text-[var(--ink-900)]">
                <span className="font-medium">Setting the lineup.</span>
                <span className="text-[var(--ink-700)]">
                  Drag a row, or focus one and press
                </span>
                <Kbd size="sm">Space</Kbd>
                <span className="text-[var(--ink-700)]">then</span>
                <Kbd size="sm">↑</Kbd>
                <Kbd size="sm">↓</Kbd>
              </p>
              <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-600)]">
                Nothing is saved until Save lineup.
              </span>
            </motion.div>
          )}
          </AnimatePresence>

          {error && (
            <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
              {error}
            </p>
          )}

          <motion.div layout={reduceMotion ? false : "position"} transition={{ layout: settle }}>
          <RosterTable
            members={members}
            invites={invites}
            canManage={canManage}
            viewerId={viewerId}
            selectedId={selectedId}
            onToggle={toggle}
            onMerge={(row) => {
              const other = members.find(
                (m) => m.playerId === row.duplicateOfPlayerId
              );
              if (other) setMerging([row, other]);
            }}
            run={run}
            pending={pending}
            lineup={lineup}
            onStartLineup={startLineup}
            onLift={onLift}
            onMove={onMove}
            onReorder={onReorder}
            onDragStartRow={onDragStartRow}
            onDragEndRow={onDragEndRow}
          />
          </motion.div>

          {/* Announced rather than drawn: the numbers beside the rows already
              show a sighted user what moved. */}
          <span aria-live="polite" className="sr-only">
            {announcement}
          </span>

          {footer}
        </div>

        {drawerMember && (
          <PlayerDrawer
            member={drawerMember}
            index={drawerIndex}
            total={members.length}
            canManage={canManage}
            isViewer={drawerMember.userId === viewerId}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => close(drawerMember.playerId)}
            onClosed={finishClose}
            onEdit={setEditing}
            onError={setError}
            run={run}
            pending={pending}
          />
        )}
      </div>

      <EditPlayerDialog
        member={editing}
        roster={members}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />

      <MergeProfilesDialog
        pair={merging}
        onOpenChange={(open) => {
          if (!open) setMerging(null);
        }}
      />
    </>
  );
}

/** "Rafael Osei, line 2 of 6" — or that they are out of the lineup. */
function describe(
  sequence: string[],
  playerId: string,
  members: RosterMember[]
): string {
  const name =
    members.find((m) => m.playerId === playerId)?.name ?? "That player";
  const order = lineupOrder(sequence);
  const index = order.indexOf(playerId);
  if (index < 0) return `${name}, out of the lineup`;
  return `${name}, line ${index + 1} of ${order.length}`;
}

/**
 * Mirror the selection into `?player=` without a navigation.
 *
 * `history.replaceState` rather than `router.replace`: the App Router treats
 * the latter as a navigation and re-renders from the server, which for a click
 * on a row is a round trip to change one query string. The native call is one
 * the router listens to, so `useSearchParams` elsewhere still sees it.
 */
function syncUrl(playerId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (playerId) url.searchParams.set("player", playerId);
  else url.searchParams.delete("player");
  window.history.replaceState(window.history.state, "", url);
}
