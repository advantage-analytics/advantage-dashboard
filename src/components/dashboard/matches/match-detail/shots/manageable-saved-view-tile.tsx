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
import { computeViz } from "./viz-model";
import { SharedGlyph } from "./saved-views-band";

/**
 * One manageable tile in Manage mode: the same `CourtTile`, plus the ⋯
 * overlay button/menu, an in-place rename field standing in for the name,
 * and the pointer/keyboard reorder handlers on the wrapping div.
 *
 * The wrapper intercepts the inner `<Link>`'s own click in the capture phase
 * — `preventDefault` there cancels the anchor's navigation before it fires,
 * for both a mouse click and an Enter/Space activation, without needing to
 * turn the tile into a non-link element. That is what keeps it "keyboard
 * reachable" (task-9-brief.md's own wording): it is still a real, focusable
 * `<a>`, just one whose default action this wrapper cancels while the tile
 * is a drag target instead of a navigation target.
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
}: {
  view: SavedViewRow;
  data: {
    subjectName: string;
    pills: string[];
    countLabel: string;
    dots: ReturnType<typeof computeViz>["dots"];
    href: string;
  };
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
}) {
  const renameFieldId = useId();

  return (
    <div
      ref={onRegisterTileEl}
      onPointerDown={onPointerDownTile}
      onPointerMove={onPointerMoveTile}
      onPointerUp={onPointerEndTile}
      onPointerCancel={onPointerEndTile}
      onKeyDown={onKeyDownTile}
      onClickCapture={(e) => e.preventDefault()}
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
        href={data.href}
        overlay={
          // Only `onPointerDown` needs to stop here — it keeps a press on the
          // ⋯ button from also being read as the START of a drag by the tile
          // wrapper's own (bubble-phase) pointerdown handler. A click does
          // NOT need stopping: the wrapper's `onClickCapture` above only
          // calls `preventDefault()` (cancelling the anchor's navigation),
          // never `stopPropagation()`, so the button's own click — and every
          // `FloatMenuItem` inside the portaled menu, which React still
          // treats as a descendant for event purposes — keeps working.
          <div
            className="absolute top-[10px] right-[10px]"
            onPointerDown={(e) => e.stopPropagation()}
          >
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
        onPointerDown={(e) => e.stopPropagation()}
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
