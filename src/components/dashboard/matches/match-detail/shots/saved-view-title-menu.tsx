"use client";

import { useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { SavedViewRow } from "@/lib/data/saved-views-server";
import type { ProgramRole, WorkspaceKind } from "@/lib/workspace/types";
import { ManageTileMenu } from "./manage-tile-menu";
import { RenameViewDialog } from "./rename-view-dialog";
import { savedViewNamePool } from "./save-view-dialog";

/** What the open view's ⋯ menu can ask of the Saved wall. */
export type SavedViewAction =
  | { kind: "rename"; id: string; name: string }
  | { kind: "duplicate" | "share" | "unshare" | "delete"; id: string };

/**
 * An open saved view's ⋯, in the lightbox header beside the close
 * (`viz-lightbox.tsx`'s `headerAction`): the wall card's own menu without
 * "Reorder…" — there is no wall under the lightbox to drag on. Its place is
 * fixed whatever the name's length, and its menu opens over the header's own
 * space. The Rename popover still hangs under the view's NAME, since that is
 * what it edits.
 *
 * It mutates nothing itself. Every choice goes up as a `SavedViewAction`,
 * and the Saved wall's band runs it (`saved-views-band.tsx`), so a rename,
 * a delete and its Undo behave exactly as they do from a card.
 */
export function SavedViewTitleMenu({
  view,
  name,
  savedViews,
  workspaceKind,
  workspaceRole,
  onAction,
}: {
  view: SavedViewRow;
  /** The name on screen — the view's, or one just typed and still saving. */
  name: string;
  savedViews: readonly SavedViewRow[];
  workspaceKind: WorkspaceKind;
  workspaceRole: ProgramRole;
  onAction: (action: SavedViewAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  // The lightbox's title (`data-lightbox-title`): the Rename popover hangs
  // from its left edge, under the name.
  const rowRef = useRef<HTMLElement | null>(null);

  return (
    <>
      <ManageTileMenu
        viewName={name}
        view={view}
        workspaceKind={workspaceKind}
        role={workspaceRole}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onRename={() => setRenameOpen(true)}
        onDuplicate={() => onAction({ kind: "duplicate", id: view.id })}
        onShare={() => onAction({ kind: "share", id: view.id })}
        onUnshare={() => onAction({ kind: "unshare", id: view.id })}
        onDelete={() => onAction({ kind: "delete", id: view.id })}
        trigger={
          <button
            type="button"
            ref={(el) => {
              rowRef.current =
                el
                  ?.closest("[data-lightbox-box]")
                  ?.querySelector<HTMLElement>("[data-lightbox-title]") ?? null;
            }}
            aria-label={`Manage "${name}"`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            // The dialog's own chrome icon button (the close's shape): a
            // rounded square, never a circle.
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none aria-expanded:bg-[var(--surface-subtle)] aria-expanded:text-[var(--ink-900)] touch:hit-area"
          >
            <MoreHorizontal
              className="size-3.5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        }
      />
      <RenameViewDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        anchorRef={rowRef}
        currentName={name}
        poolNames={savedViewNamePool([...savedViews], {
          shared: view.shared,
          excludeId: view.id,
        })}
        shared={view.shared}
        onRename={(next) =>
          onAction({ kind: "rename", id: view.id, name: next })
        }
      />
    </>
  );
}
