"use client";

import {
  useId,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MoreHorizontal } from "lucide-react";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import type { ProgramRole, WorkspaceKind } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";
import { CourtTile } from "./court-tile";
import { ManageTileMenu } from "./manage-tile-menu";
import { computeViz, type Chart, type VizBandZones } from "./viz-model";
import { SharedGlyph } from "./saved-views-band";

/**
 * One manageable tile in Manage mode: the same `CourtTile`, plus the ⋯
 * overlay button/menu, an in-place rename field standing in for the name,
 * and the pointer/keyboard reorder handlers on the wrapping div.
 *
 * Round-3 review fix: rounds 1–2 tried to keep this tile a real `<Link>`
 * and selectively suppress its navigation with `preventDefault()`, checked
 * against a "was this click on a control" test. That cannot work — verified
 * live: `preventDefault()`-ing the click stops Radix's Popover trigger from
 * opening the menu (it composes its toggle with `checkForDefaultPrevented`),
 * but skipping `preventDefault()` for a control click leaves the click free
 * to also be handled by the anchor SURROUNDING that control, which then
 * navigates on the very same click a moment later — there is no
 * `preventDefault()` policy that satisfies both an anchor ONE level up and a
 * button/popover trigger nested inside it on the same click.
 *
 * So `CourtTile` renders this tile with `as="static"` — a `<div
 * role="group">`, not an `<a>`, whenever it's mounted (only ever for a
 * manageable tile in Manage mode, per `saved-views-band.tsx`'s own gate).
 * There is no anchor to accidentally activate, so nothing needs suppressing:
 * the old `onClickCapture`/`shouldSuppressTileClick`/`data-tile-control`
 * machinery is gone entirely, not just relaxed. Reorder still needs ONE
 * pointerdown guard — a press that LANDS on the ⋯ button, a `[role="menu"]`
 * row, or the rename `<input>` must not also be read as the start of a drag
 * — checked with a plain `event.target.closest("button, input,
 * [role=menu]")` against the real DOM (this still finds a `role="menu"` row
 * even though `ManageTileMenu`'s dropdown content is portaled to
 * `document.body`: the row and its `role="menu"` container are genuine DOM
 * ancestor/descendant of EACH OTHER, just not of this tile — `closest()`
 * only needs the first to be true).
 *
 * Split out of `saved-views-band.tsx` (a purely mechanical move — no
 * behaviour change, props unchanged) once that file's own state/handlers
 * plus this tile's rendering pushed it past ~1000 lines; the band still owns
 * every piece of Manage-mode state and every mutation handler, and passes
 * them all down as props here.
 */
export function ManageableSavedViewTile({
  view,
  data,
  hintId,
  workspaceKind,
  workspaceRole,
  isDragging,
  isRenaming,
  renameValue,
  renameDuplicate,
  menuOpen,
  onMenuOpenChange,
  onRegisterTileEl,
  onRegisterMenuTriggerEl,
  onRenameValueChange,
  onRenameCommit,
  onRenameCancel,
  onStartRename,
  onDuplicate,
  onShare,
  onUnshare,
  onDelete,
  onPointerDownTile,
  onPointerMoveTile,
  onPointerEndTile,
  onKeyDownTile,
  current,
}: {
  view: SavedViewRow;
  data: {
    subjectName: string;
    pills: string[];
    countLabel: string;
    dots: ReturnType<typeof computeViz>["dots"];
    chart: Chart;
    zones?: NonNullable<ReturnType<typeof computeViz>["zoneStats"]>;
    bandZones: VizBandZones | null;
    href: string;
  };
  /**
   * The Manage-mode hint's own id (`saved-views-band.tsx`'s `manageHintId`)
   * — review M7: keyboard reorder is otherwise undiscoverable, so every
   * manageable tile is `aria-describedby` this hint via `CourtTile`'s static
   * container, not just visually adjacent to it.
   */
  hintId: string;
  workspaceKind: WorkspaceKind;
  workspaceRole: ProgramRole;
  isDragging: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameDuplicate: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onRegisterTileEl: (el: HTMLDivElement | null) => void;
  onRegisterMenuTriggerEl: (el: HTMLButtonElement | null) => void;
  onRenameValueChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onStartRename: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onUnshare: () => void;
  onDelete: () => void;
  onPointerDownTile: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMoveTile: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEndTile: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDownTile: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  /** F4: rings the tile Signal Blue — the view currently drawn in the big
   * court, in the focused view's Views grid (a wrapping grid reached by
   * scrolling the page, not a scrolling row). Never set on the wall's own
   * Manage-mode grid. */
  current?: boolean;
}) {
  const renameFieldId = useId();

  /**
   * Reorder must not start when the press LANDS on the ⋯ button, a menu row
   * (`[role="menu"]`, checked rather than portal position — see this file's
   * top comment), or the rename `<input>`: any of those is its own control,
   * not a drag handle.
   */
  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, [role="menu"]')) return;
    onPointerDownTile(e);
  }

  return (
    <div
      ref={onRegisterTileEl}
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMoveTile}
      onPointerUp={onPointerEndTile}
      onPointerCancel={onPointerEndTile}
      onKeyDown={onKeyDownTile}
      className={cn(
        "rounded-[var(--radius-card)]",
        isDragging && "relative z-10",
      )}
      style={
        isDragging
          ? {
              boxShadow: "var(--shadow-card-emphasis)",
              outline: "2px solid var(--blue)",
              outlineOffset: "-1px",
              cursor: "grabbing",
            }
          : { cursor: "grab" }
      }
    >
      <CourtTile
        playerName={data.subjectName}
        name={view.name}
        nameAdornment={view.shared ? <SharedGlyph /> : undefined}
        nameSlot={
          isRenaming ? (
            <RenameField
              id={renameFieldId}
              value={renameValue}
              duplicate={renameDuplicate}
              onChange={onRenameValueChange}
              onCommit={onRenameCommit}
              onCancel={onRenameCancel}
            />
          ) : undefined
        }
        pills={data.pills}
        countLabel={data.countLabel}
        cut={view.cut}
        dots={data.dots}
        zones={data.zones}
        bandZones={data.bandZones}
        chart={data.chart}
        href={data.href}
        as="static"
        ariaDescribedBy={hintId}
        current={current}
        overlay={
          // No pointerdown stop needed here: `handlePointerDown` above
          // already excludes a press on this button (or anything inside it)
          // from starting a drag, via `closest("button, input, [role=menu]")`.
          <div className="absolute top-[10px] right-[10px]">
            <ManageTileMenu
              viewName={view.name}
              view={view}
              workspaceKind={workspaceKind}
              role={workspaceRole}
              open={menuOpen}
              onOpenChange={onMenuOpenChange}
              onRename={onStartRename}
              onDuplicate={onDuplicate}
              onShare={onShare}
              onUnshare={onUnshare}
              onDelete={onDelete}
              trigger={
                <button
                  type="button"
                  ref={onRegisterMenuTriggerEl}
                  aria-label={`Manage "${view.name}"`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex size-6 cursor-pointer items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: "rgba(13,13,13,.72)" }}
                >
                  <MoreHorizontal
                    className="size-3.5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              }
            />
          </div>
        }
      />
    </div>
  );
}

/**
 * The in-place rename control that stands in for a tile's name in Manage
 * mode. Enter commits, Esc reverts and returns focus to the ⋯ button (both
 * handled by the parent's callbacks) — no blur-commit: unmounting a focused
 * input on Escape's own re-render can fire a native blur the synthetic event
 * system does not reliably see, so committing on blur risked a double-fire
 * race. The parent instead abandons an in-progress rename outright whenever
 * another tile's menu opens (`handleMenuOpenChange`).
 */
function RenameField({
  id,
  value,
  duplicate,
  onChange,
  onCommit,
  onCancel,
}: {
  id: string;
  value: string;
  duplicate: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const errorId = `${id}-error`;
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <label htmlFor={id} className="sr-only">
        Rename view
      </label>
      <input
        id={id}
        value={value}
        autoFocus
        // No pointerdown stop needed: the tile wrapper's own
        // `handlePointerDown` already excludes any press landing on an
        // `input` from starting a drag.
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Stop every key here from also reaching the tile wrapper's own
          // keydown handler (⌥←/→/↑/↓ reorder) — typing a name with Alt held
          // for an accented character, say, must never be read as a reorder
          // request.
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        aria-invalid={duplicate || undefined}
        aria-describedby={duplicate ? errorId : undefined}
        className={cn(
          "w-full truncate border-b bg-transparent pb-0.5 text-[16px] leading-tight font-normal outline-none",
          duplicate ? "border-[var(--error)]" : "border-[var(--blue)]",
        )}
        style={{ letterSpacing: "-0.2px", color: "var(--ink-900)" }}
      />
      {duplicate && (
        <span
          id={errorId}
          role="alert"
          className="text-[10px]"
          style={{ color: "var(--error)" }}
        >
          A view with this name already exists.
        </span>
      )}
    </span>
  );
}
