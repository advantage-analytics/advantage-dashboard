"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  RosterTable,
  rosterRowId,
} from "@/components/dashboard/team/roster-table";
import {
  DRAWER_ATTR,
  PlayerDrawer,
} from "@/components/dashboard/team/player-drawer";
import { EditPlayerDialog } from "@/components/dashboard/team/edit-player-dialog";
import { MergeProfilesDialog } from "@/components/dashboard/team/merge-profiles-dialog";
import type { InviteResult } from "@/components/dashboard/settings/team-actions";
import type { ActionResult } from "@/components/dashboard/settings/actions";
import type {
  RosterInvite,
  RosterMember,
} from "@/lib/data/team-roster-server";

/**
 * The Roster page below its title: the table, and the drawer a row opens.
 *
 * Platform Audit `Tb4c` → `Tb4`. The page is a server component and stays one
 * — it fetches, words the summary line, decides what a coach may see — and
 * hands this the parts it rendered (`title`, `notices`) plus the data. This
 * owns the one piece of state the two states of the page share: which row is
 * selected, and therefore whether there is a drawer.
 *
 * ── Rules, from `20f` and `Tb4` ─────────────────────────────────────────────
 * - Click a row: the drawer slides in from the right over 200ms, the table
 *   reflows to the remaining width, the clicked row takes the persistent wash.
 * - `Esc`, the X, or clicking the already-selected row closes it.
 * - `↑`/`↓` walk to the next player without closing. Members only — an
 *   invitation has no drawer.
 * - Nothing else on the page moves.
 * - A deep link (`?player=`) is the one case that lands with the drawer open.
 *   Selection is mirrored back into the URL with `replaceState`, so a refresh
 *   or a shared link lands on the same player, without a server round trip
 *   per click.
 *
 * ── Keys live on the window ─────────────────────────────────────────────────
 * The arrows and Esc have to work wherever focus is — on a row, in the drawer,
 * on nothing at all after a mouse click. So they are a window listener, gated
 * on the drawer being open, and they stand down when the key belongs to
 * something else: a field, an open menu, or a modal dialog (Edit player,
 * Merge). The drawer's own `role="dialog"` is told apart from those by
 * `DRAWER_ATTR`.
 *
 * ── Dialogs ─────────────────────────────────────────────────────────────────
 * Edit and Merge are one instance each, here, rather than one per row or in
 * the drawer: the drawer can unmount (a close, an Esc) while the dialog it
 * opened is still up, and a dialog whose parent disappears takes the form
 * with it.
 */
export function RosterView({
  members,
  invites,
  canManage,
  viewerId,
  initialSelectedId,
  title,
  notices,
}: {
  members: RosterMember[];
  invites: RosterInvite[];
  canManage: boolean;
  viewerId: string;
  /** `?player=` from the URL, or null. Ignored unless it names a row. */
  initialSelectedId: string | null;
  /** The title slot, rendered by the page. */
  title: React.ReactNode;
  /** Claim receipt and join requests, when there are any. */
  notices?: React.ReactNode;
}) {
  const initial =
    initialSelectedId && members.some((m) => m.playerId === initialSelectedId)
      ? initialSelectedId
      : null;

  /** The row wearing the wash. Null the moment a close begins. */
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  /** The row the drawer shows. Outlives `selectedId` by one slide-out. */
  const [drawerId, setDrawerId] = useState<string | null>(initial);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterMember | null>(null);
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

  const select = useCallback(
    (member: RosterMember, viaKeyboard: boolean) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      setClosing(false);
      setSelectedId(member.playerId);
      setDrawerId(member.playerId);
      setOpenedByKeyboard(viaKeyboard);
      syncUrl(member.playerId);
    },
    []
  );

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
      if (selectedId === member.playerId) close(viaKeyboard ? member.playerId : null);
      else select(member, viaKeyboard);
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

  // The row the drawer showed is gone — removed, or merged away — so there is
  // nothing to draw. Straight to closed, no slide-out of a ghost. Adjusted
  // during render rather than in an effect: React re-renders at once with the
  // corrected state, and nothing paints a drawer for a row that no longer
  // exists. The pending close timer, if any, is idempotent and can fire.
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
    if (!selectedId) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        // A modal dialog (Edit player, Merge) or an open menu owns its keys.
        if (target.closest(`[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"])`))
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close(selectedId);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, close, step]);

  return (
    <>
      {/* `Tb4c`'s content column, padded 28/32/32 with 20px between the title
          slot and the card, and the drawer a flex sibling so the table reflows
          to whatever it leaves. White, not the frame's grey: CJ's call
          (2026-09-04), and what every other dashboard page is. */}
      <div className="flex w-full flex-1 bg-[var(--surface-card)]">
        <div className="flex min-w-0 flex-1 flex-col gap-5 px-8 pt-7 pb-8">
          {title}
          {notices}
          {error && (
            <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
              {error}
            </p>
          )}
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
          />
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

      {/* `members` unfiltered, so the lineup-spot note can name whoever else
          is on the line the coach picks. The dialog drops the edited row from
          that list itself. */}
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

/**
 * Mirror the selection into `?player=` without a navigation.
 *
 * `history.replaceState` rather than `router.replace`: the App Router treats
 * the latter as a navigation and re-renders the page from the server, which
 * for a click on a row is a round trip to change one query string. The
 * native call is one the router listens to, so `useSearchParams` elsewhere
 * would still see it.
 */
function syncUrl(playerId: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (playerId) url.searchParams.set("player", playerId);
  else url.searchParams.delete("player");
  window.history.replaceState(window.history.state, "", url);
}
