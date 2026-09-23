"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { deleteEvent } from "@/lib/schedule/actions";
import { dualScore } from "@/lib/schedule/entry-state";
import type { EventEntry } from "@/lib/schedule/types";
import { cn } from "@/lib/utils";

/**
 * The leading glyph on each menu row, as the Roster drawer's Options menu draws
 * it: 13px, neutral ink-400 — never `--blue` (`FloatMenuItem`'s default).
 */
const MENU_ROW_ICON = "size-[13px] shrink-0 text-[var(--ink-400)]";

/**
 * The destructive row rests grey like its siblings and turns `--danger` — label
 * AND icon — only on hover or keyboard focus, so red appears at the moment of
 * intent rather than standing in the menu (DS › Dropdown / Menu). The label
 * selector reaches into `FloatMenuItem`'s label span, which takes no class.
 */
const DESTRUCTIVE_ROW =
  "group hover:[&>span:last-child>span:first-child]:text-[var(--danger)] focus-visible:[&>span:last-child>span:first-child]:text-[var(--danger)]";
const DESTRUCTIVE_ICON =
  "group-hover:text-[var(--danger)] group-focus-visible:text-[var(--danger)]";

const TRIGGER =
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)] data-[state=open]:bg-[var(--surface-subtle)] data-[state=open]:text-[var(--ink-700)]";

/**
 * What deleting an event costs, counted off the lines the drawer already
 * holds — no fetch of its own. Deletion detaches rather than refuses: the
 * matches survive in the library with their line cleared, while outcome rows
 * and the dual's team result go with the event.
 */
function deleteCost(entries: EventEntry[], isDual: boolean) {
  const matchCount = entries.reduce(
    (sum, entry) => sum + entry.matches.length,
    0,
  );
  const hasOutcome = entries.some(
    (entry) => entry.forfeit !== null || (entry.outcomes?.length ?? 0) > 0,
  );
  const score = isDual ? dualScore(entries) : null;
  const teamScore =
    score && (score.us > 0 || score.them > 0)
      ? `${score.us}–${score.them}`
      : null;
  return { matchCount, hasOutcome, teamScore };
}

export function EventActionsMenu({
  eventId,
  eventName,
  isDual,
  entries,
  canDelete,
  onDeleted,
}: {
  eventId: string;
  eventName: string;
  isDual: boolean;
  /** The drawer's loaded lines; the confirm's copy is counted from these. */
  entries: EventEntry[];
  /** Presentation gate only. `deleteEvent` re-checks the active workspace. */
  canDelete: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const deletedRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { matchCount, hasOutcome, teamScore } = deleteCost(entries, isDual);
  const costsSomething = matchCount > 0 || hasOutcome;

  async function confirmDelete() {
    setDeleting(true);
    setError(null);

    try {
      const result = await deleteEvent(eventId);
      if ("error" in result) {
        setDeleting(false);
        setError(result.error);
        return;
      }

      deletedRef.current = true;
      setDeleteOpen(false);
      onDeleted();
      router.refresh();
    } catch {
      setDeleting(false);
      setError("Couldn't delete this event. Try again.");
    }
  }

  return (
    <>
      <ChromeTooltip label="Event actions" hidden={menuOpen || deleteOpen}>
        <span className="inline-flex">
          <FloatMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            width={220}
            label="Event actions"
            trigger={
              <button
                ref={triggerRef}
                type="button"
                aria-label="Event actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={TRIGGER}
              >
                <MoreHorizontal
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            }
          >
            <FloatMenuItem
              label="Edit event"
              icon={
                <Pencil
                  className={MENU_ROW_ICON}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
              onSelect={() => {
                setMenuOpen(false);
                router.push(`/dashboard/team/schedule/${eventId}/edit`);
              }}
            />

            {canDelete ? (
              <>
                <FloatMenuDivider />
                <FloatMenuItem
                  label="Delete event"
                  description="Recorded matches stay in the library"
                  icon={
                    <Trash2
                      className={cn(MENU_ROW_ICON, DESTRUCTIVE_ICON)}
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                  }
                  className={DESTRUCTIVE_ROW}
                  onSelect={() => {
                    setMenuOpen(false);
                    setError(null);
                    setDeleteOpen(true);
                  }}
                />
              </>
            ) : null}
          </FloatMenu>
        </span>
      </ChromeTooltip>

      {canDelete ? (
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open);
            if (!open) setError(null);
          }}
          title={`Delete ${eventName}?`}
          description={
            costsSomething
              ? "Removes the event and every line under it from the team schedule."
              : "Removes the event and its empty lines from the team schedule. There is no undo."
          }
          tone="danger"
          confirmLabel="Delete event"
          pendingLabel="Deleting…"
          pending={deleting}
          error={error}
          onConfirm={() => void confirmDelete()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (deletedRef.current) {
              deletedRef.current = false;
              return;
            }
            triggerRef.current?.focus();
          }}
        >
          {costsSomething ? (
            <ConfirmProse>
              {matchCount > 0 ? (
                <p>
                  {matchCount === 1 ? (
                    <>
                      <Em>1 match</Em> stays in the match library, with its
                      statistics and video, but loses its line in this event.
                    </>
                  ) : (
                    <>
                      <Em>{matchCount} matches</Em> stay in the match library,
                      with their statistics and video, but lose their lines in
                      this event.
                    </>
                  )}
                </p>
              ) : null}
              <p>
                {teamScore ? (
                  <>
                    The <Em>{teamScore}</Em> team result is removed with
                    it.{" "}
                  </>
                ) : hasOutcome ? (
                  <>
                    Lines settled by <Em>forfeit, default or withdrawal</Em>{" "}
                    lose that result.{" "}
                  </>
                ) : null}
                There is no undo.
              </p>
            </ConfirmProse>
          ) : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}
