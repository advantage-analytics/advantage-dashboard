"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";
import { EditMatchDialog } from "./edit-match-dialog";
import { DeleteMatchDialog } from "./delete-match-dialog";

/**
 * The leading glyph on each menu row, as the Roster drawer's Options menu and
 * the Schedule drawer's event menu draw it: 13px, neutral ink-400 — never
 * `--blue` (`FloatMenuItem`'s default).
 */
export const MENU_ROW_ICON = "size-[13px] shrink-0 text-[var(--ink-400)]";

/**
 * The destructive row rests grey like its siblings and turns `--danger` — label
 * AND icon — only on hover or keyboard focus, so red appears at the moment of
 * intent rather than standing in the menu (DS › Dropdown / Menu). The label
 * selector reaches into `FloatMenuItem`'s label span, which takes no class.
 */
export const DESTRUCTIVE_ROW =
  "group hover:[&>span:last-child>span:first-child]:text-[var(--danger)] focus-visible:[&>span:last-child>span:first-child]:text-[var(--danger)]";
export const DESTRUCTIVE_ICON =
  "group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]";

/** The 28px trigger — the roster's and the schedule's, verbatim. */
const TRIGGER =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] data-[state=open]:bg-[var(--surface-subtle)] data-[state=open]:text-[var(--ink-700)]";

interface MatchActionsMenuProps {
  matchId: string;
  matchLabel: string;
  onDeleted?: () => void;
  className?: string;
}

export function MatchActionsMenu({
  matchId,
  matchLabel,
  onDeleted,
  className,
}: MatchActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // The menu trigger is a sibling (not a child) of the card <Link>, so clicks
  // don't bubble into navigation. We still stop propagation on the trigger
  // itself for defense in depth against parents that might attach handlers.
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <ChromeTooltip
        label="Match actions"
        hidden={open || editOpen || deleteOpen}
      >
        <span className="inline-flex">
          <FloatMenu
            open={open}
            onOpenChange={setOpen}
            width={220}
            label="Match actions"
            trigger={
              <button
                type="button"
                aria-label="Match actions"
                aria-haspopup="menu"
                aria-expanded={open}
                onPointerDown={stop}
                onClick={stop}
                className={cn(TRIGGER, className)}
              >
                <MoreHorizontal
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            }
          >
            <FloatMenuItem
              label="Edit match"
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
          </FloatMenu>
        </span>
      </ChromeTooltip>

      {editOpen && (
        <EditMatchDialog
          matchId={matchId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
      {deleteOpen && (
        <DeleteMatchDialog
          matchId={matchId}
          matchLabel={matchLabel}
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}
