"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { cn } from "@/lib/utils";
import { ICON_BUTTON } from "./match-drawer";
import { DiscardDraftDialog } from "./discard-draft-dialog";
import {
  DESTRUCTIVE_ICON,
  DESTRUCTIVE_ROW,
  MENU_ROW_ICON,
} from "./match-actions/menu-row-classes";

/**
 * A draft's ⋯ — one row, "Discard draft", on the same `FloatMenu` a match's
 * Edit · Delete draws: 13px `Trash2` in ink-400, grey at rest and `--danger`
 * on hover or focus, with the tooltip every icon-only control answers hover
 * with. The row opens the confirm; nothing is deleted from the menu itself.
 *
 * It sits on the draft's own row or card, because a draft has no page of its
 * own to hold it: the row travels into the wizard, and the wizard is for
 * finishing the upload, not for throwing it away.
 *
 * Everything here sits in one wrapper that stops clicks. React events bubble
 * through portals, so without it a press on the trigger, a menu row or the
 * confirm's own buttons would reach the row around it and send the reader
 * into the wizard.
 */
export function DraftDiscardMenu({
  draftId,
  matchName,
  focusAfterDiscard,
  className,
}: {
  draftId: string;
  matchName: string | null;
  /**
   * Where focus goes once the draft is gone — the row's neighbour, read just
   * before the list refreshes. Without it the refresh drops focus to the body
   * and a keyboard user starts over from the top of the page.
   */
  focusAfterDiscard?: () => HTMLElement | null;
  className?: string;
}): React.JSX.Element {
  const router = useRouter();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const discardedRef = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <span
      className={cn("inline-flex", className)}
      onClick={(event) => event.stopPropagation()}
    >
      <ChromeTooltip label="Draft actions" hidden={menuOpen || dialogOpen}>
        <span className="inline-flex">
          <FloatMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            width={220}
            label="Draft actions"
            trigger={
              <button
                ref={triggerRef}
                type="button"
                aria-label="Draft actions"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={cn(
                  ICON_BUTTON,
                  "data-[state=open]:bg-[var(--surface-subtle)] data-[state=open]:text-[var(--ink-700)]",
                )}
              >
                <MoreHorizontal
                  className="size-3.5"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </button>
            }
          >
            <FloatMenuItem
              label="Discard draft"
              description="Clears your saved answers"
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
                setDialogOpen(true);
              }}
            />
          </FloatMenu>
        </span>
      </ChromeTooltip>

      <DiscardDraftDialog
        draftId={draftId}
        matchName={matchName}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onDiscarded={() => {
          discardedRef.current = true;
          focusAfterDiscard?.()?.focus();
          router.refresh();
        }}
        onCloseAutoFocus={(event) => {
          // Back to the ⋯ on Keep draft; after a discard the row is leaving
          // and focus is already on its neighbour.
          event.preventDefault();
          if (discardedRef.current) {
            discardedRef.current = false;
            return;
          }
          triggerRef.current?.focus();
        }}
      />
    </span>
  );
}
