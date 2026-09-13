"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
} from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { deleteEvent } from "@/lib/schedule/actions";
import { advButton } from "@/lib/ui/adv-button";
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

export function EventActionsMenu({
  eventId,
  eventName,
  canDelete,
  onDeleted,
}: {
  eventId: string;
  eventName: string;
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
                  description="Empty schedule lines are removed too"
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
        <AlertDialog
          open={deleteOpen}
          onOpenChange={(open) => {
            if (deleting) return;
            setDeleteOpen(open);
            if (!open) setError(null);
          }}
        >
          <AlertDialogContent
            className="max-w-md gap-3 rounded-[14px] border-[var(--border-hairline)] p-6 shadow-[var(--shadow-dropdown)]"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (deletedRef.current) {
                deletedRef.current = false;
                return;
              }
              triggerRef.current?.focus();
            }}
          >
            <AlertDialogHeader className="gap-2 text-left">
              <AlertDialogTitle className="text-[16px] font-medium tracking-[-0.4px] text-[var(--ink-900)]">
                Delete {eventName}?
              </AlertDialogTitle>
              <AlertDialogDescription className="text-[13px] leading-5 text-[var(--ink-600)]">
                This permanently removes the event and its empty schedule lines
                from the team schedule. Events with recorded matches or outcomes
                cannot be deleted. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            {error ? (
              <p
                role="alert"
                className="rounded-[var(--radius-button)] bg-[var(--danger-tint-15)] px-3 py-2 text-[12px] text-[var(--danger)]"
              >
                {error}
              </p>
            ) : null}

            <AlertDialogFooter className="mt-2 sm:gap-2">
              <AlertDialogCancel
                disabled={deleting}
                className={cn(advButton("outline", "md"), "mt-0")}
              >
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault();
                  void confirmDelete();
                }}
                className={advButton("danger-solid", "md")}
              >
                {deleting ? (
                  <>
                    <Loader2
                      className="size-3.5 animate-spin"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    Deleting…
                  </>
                ) : (
                  "Delete event"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}
