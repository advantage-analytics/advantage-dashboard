"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import {
  FileDown,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  DESTRUCTIVE_ICON,
  DESTRUCTIVE_ROW,
  MENU_ROW_ICON,
} from "@/components/dashboard/matches/match-actions/menu-row-classes";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { cn } from "@/lib/utils";

// Both dialogs mount only once their row is chosen, so their code (the edit
// form is large) is fetched then rather than with every match page.
const EditMatchDialog = dynamic(
  () =>
    import("@/components/dashboard/matches/match-actions/edit-match-dialog").then(
      (m) => m.EditMatchDialog,
    ),
  { ssr: false },
);
const DeleteMatchDialog = dynamic(
  () =>
    import("@/components/dashboard/matches/match-actions/delete-match-dialog").then(
      (m) => m.DeleteMatchDialog,
    ),
  { ssr: false },
);

/** The handler a disabled row is given and never calls (`FloatMenuItem` skips it). */
const NOT_AVAILABLE = () => undefined;

/**
 * The ⋯ menu at the end of the title row (design 04 F6): Export report,
 * Re-run analysis, Review score, then Delete match below a hairline.
 *
 * Export and Re-run have nothing behind them yet — there is no PDF, and
 * `resubmitJob` refuses any job that has not failed — so they render with the
 * frame's copy as disabled rows, and the note at the foot says so
 * (spec › Decisions 2). Every row carries a 13px ink-400 glyph even though F6
 * draws none: a `FloatMenuItem` without an `icon` is a `menuitemradio` with a
 * check slot, which an action menu is not.
 *
 * Delete follows the DS rather than F6's standing red label: it rests grey
 * and turns `--danger` on hover or focus, the same classes `MatchActionsMenu`
 * ships for the same row. The dialog names the match through
 * `useMatchSides()` — the viewer's name first — never player1/player2 order
 * (guardrails §4). With no `onDeleted`, `DeleteMatchDialog` sees it is on this
 * match's own page and routes back to the matches list.
 *
 * The trigger answers hover with a dark tooltip, hidden while the menu or one
 * of its dialogs is open (the control has already said what it is). No focus
 * classes: `focus.css` rings buttons.
 */
export function MatchReportMoreMenu() {
  const { meta } = useMatchReport();
  const sides = useMatchSides();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <ChromeTooltip label="More" hidden={open || editOpen || deleteOpen}>
        {/* The tooltip and the popover each want to own the trigger's props
            (both are `asChild`), and `FloatMenu` is a component rather than
            an element — so the tooltip anchors to this span, as in
            `MatchActionsMenu`. */}
        <span className="inline-flex">
          <FloatMenu
            open={open}
            onOpenChange={setOpen}
            width={212}
            align="end"
            label="More"
            trigger={
              <button
                type="button"
                aria-label="More"
                aria-haspopup="menu"
                aria-expanded={open}
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--nav-fg)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)]"
              >
                <MoreHorizontal
                  className="size-[15px]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            }
          >
            <FloatMenuItem
              label="Export report"
              description="PDF with the charts"
              disabled
              icon={
                <FileDown
                  className={MENU_ROW_ICON}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
              onSelect={NOT_AVAILABLE}
            />
            <FloatMenuItem
              label="Re-run analysis"
              description="Uses your latest video"
              disabled
              icon={
                <RefreshCw
                  className={MENU_ROW_ICON}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
              onSelect={NOT_AVAILABLE}
            />
            <FloatMenuItem
              label="Review score"
              icon={
                <Pencil
                  className={MENU_ROW_ICON}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
              onSelect={() => {
                setOpen(false);
                setEditOpen(true);
              }}
            />

            <FloatMenuDivider />

            <FloatMenuItem
              label="Delete match"
              icon={
                <Trash2
                  className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
              className={DESTRUCTIVE_ROW}
              onSelect={() => {
                setOpen(false);
                setDeleteOpen(true);
              }}
            />

            <FloatMenuNote>
              Export and re-run analysis aren&apos;t available yet.
            </FloatMenuNote>
          </FloatMenu>
        </span>
      </ChromeTooltip>

      {editOpen && (
        <EditMatchDialog
          matchId={meta.matchId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {deleteOpen && (
        <DeleteMatchDialog
          matchId={meta.matchId}
          matchLabel={`${sides.you.name} vs ${sides.opp.name}`}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
        />
      )}
    </>
  );
}
