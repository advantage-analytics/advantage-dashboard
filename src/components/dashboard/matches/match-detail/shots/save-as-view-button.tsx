"use client";

import { useRef, useState } from "react";
import type { SavedView, SavedViewRow } from "@/lib/data/saved-views-server";
import type { WorkspaceKind } from "@/lib/workspace/types";
import { advButton } from "@/lib/ui/adv-button";
import { SaveViewDialog } from "./save-view-dialog";
import type { Chart, Cut, VizFilters } from "./viz-model";

/**
 * The lightbox footer's "Save as view": the outline button beside the
 * footer's primary (never blue words — a dialog carries one primary) and the
 * Save popover anchored to it, opening above and lined up with its right
 * edge. The match report's lightbox
 * (`viz-lightbox.tsx`) and the player profile's season lightbox
 * (`season-viz-lightbox.tsx`) both draw it, so a reader on a default card
 * who has set filters can keep them as a view of the workspace.
 */
export function SaveAsViewButton({
  cut,
  chart,
  filters,
  savedViews,
  workspaceKind,
  workspaceName,
  onSaved,
  note,
}: {
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  savedViews: SavedViewRow[];
  workspaceKind: WorkspaceKind;
  workspaceName: string;
  onSaved: (view: SavedView) => void;
  /** Handed to the dialog (`SaveViewDialog.note`). */
  note?: string;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen(true)}
        className={advButton("outline", "sm")}
      >
        Save as view
      </button>
      <SaveViewDialog
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        cut={cut}
        chart={chart}
        filters={filters}
        savedViews={savedViews}
        workspaceKind={workspaceKind}
        workspaceName={workspaceName}
        side="top"
        align="end"
        onSaved={onSaved}
        note={note}
      />
    </>
  );
}
