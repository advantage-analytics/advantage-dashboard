"use client";

import {
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { MoreHorizontal } from "lucide-react";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import type { ProgramRole, WorkspaceKind } from "@/lib/workspace/types";
import { cn } from "@/lib/utils";
import { ManageTileMenu } from "./manage-tile-menu";
import { RenameViewDialog } from "./rename-view-dialog";
import { SharedGlyph } from "./saved-views-band";
import { WallCard } from "./wall-card";
import type { Cut, VizDot } from "./viz-model";
import type { VizState } from "./viz-url";
import type { WallSummary } from "./wall-summary";

/** What a saved view's wall card is drawn from (`saved-views-band.tsx`). */
export interface SavedViewCardData {
  subjectName: string;
  possessive: string;
  cut: Cut;
  dots: VizDot[];
  summary: WallSummary;
  href: string;
  state: VizState;
}

/**
 * A saved view the viewer may manage, on the Saved wall: the Default wall's
 * own card (`WallCard`) with a ⋯ over its court.
 *
 * At rest the card is the same link every wall card is, and the ⋯ is its
 * SIBLING, laid over the court's corner — never inside the anchor. A button
 * nested in a link cannot be told apart from the link on a click (Radix's
 * trigger ignores a prevented click, an unprevented one navigates), so the
 * two are separate elements stacked in one `relative` box. The ⋯ shows on
 * hover and on keyboard focus within the card, stays while its menu or the
 * rename dialog is open, and is always shown on touch (`touch:opacity-100`).
 *
 * In reorder mode (the menu's "Reorder…" row) the card is `WallCard
 * as="static"` — not a link — inside a wrapper that carries the drag and
 * ⌥-arrow handlers, and the ⋯ is gone: the mode is for moving cards only.
 *
 * The band owns every piece of state and every mutation; this component
 * draws and wires.
 */
export function ManageableSavedViewTile({
  view,
  data,
  reorderMode = false,
  hintId,
  workspaceKind,
  workspaceRole,
  isDragging = false,
  menuOpen,
  onMenuOpenChange,
  renameOpen,
  onRenameOpenChange,
  renamePool,
  onRename,
  onRegisterTileEl,
  onRegisterMenuTriggerEl,
  onStartRename,
  onDuplicate,
  onShare,
  onUnshare,
  onReorder,
  onDelete,
  onPointerDownTile,
  onPointerMoveTile,
  onPointerEndTile,
  onKeyDownTile,
}: {
  view: SavedViewRow;
  data: SavedViewCardData;
  /** Omitted (the season page, which has no reorder mode): always at rest. */
  reorderMode?: boolean;
  /** The reorder hint's id — a static card is `aria-describedby` it. */
  hintId?: string;
  workspaceKind: WorkspaceKind;
  workspaceRole: ProgramRole;
  isDragging?: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  renameOpen: boolean;
  onRenameOpenChange: (open: boolean) => void;
  /** Names the new one must not collide with (`savedViewNamePool`). */
  renamePool: readonly string[];
  onRename: (name: string) => void;
  onRegisterTileEl?: (el: HTMLDivElement | null) => void;
  onRegisterMenuTriggerEl?: (el: HTMLButtonElement | null) => void;
  onStartRename: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onUnshare: () => void;
  /** Enters reorder mode. Omitted, the menu has no "Reorder…" row. */
  onReorder?: () => void;
  onDelete: () => void;
  onPointerDownTile?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMoveTile?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerEndTile?: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onKeyDownTile?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const adornment = view.shared ? <SharedGlyph /> : undefined;

  if (reorderMode) {
    return (
      <div
        ref={onRegisterTileEl}
        onPointerDown={onPointerDownTile}
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
        <WallCard
          name={view.name}
          nameAdornment={adornment}
          playerName={data.subjectName}
          possessive={data.possessive}
          cut={data.cut}
          dots={data.dots}
          summary={data.summary}
          href={data.href}
          navigateState={data.state}
          as="static"
          ariaDescribedBy={hintId}
        />
      </div>
    );
  }

  const pinned = menuOpen || renameOpen;

  return (
    <div ref={onRegisterTileEl} className="group relative">
      <WallCard
        name={view.name}
        nameAdornment={adornment}
        playerName={data.subjectName}
        possessive={data.possessive}
        cut={data.cut}
        dots={data.dots}
        summary={data.summary}
        href={data.href}
        navigateState={data.state}
      />
      <div
        className={cn(
          "absolute top-[10px] right-[10px] transition-opacity duration-200 motion-reduce:transition-none",
          pinned
            ? "opacity-100"
            : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 touch:opacity-100",
        )}
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
          onReorder={onReorder}
          onDelete={onDelete}
          trigger={
            <button
              type="button"
              ref={(el) => {
                triggerRef.current = el;
                onRegisterMenuTriggerEl?.(el);
              }}
              aria-label={`Manage "${view.name}"`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
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
      <RenameViewDialog
        open={renameOpen}
        onOpenChange={onRenameOpenChange}
        anchorRef={triggerRef}
        currentName={view.name}
        poolNames={renamePool}
        shared={view.shared}
        onRename={onRename}
        align="end"
      />
    </div>
  );
}
