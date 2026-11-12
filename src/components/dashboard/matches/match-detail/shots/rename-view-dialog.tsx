"use client";

import { useEffect, useId, useRef, useState, type RefObject } from "react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { advButton } from "@/lib/ui/adv-button";
import { hasDuplicateViewName } from "@/lib/data/saved-views-logic";
import { cn } from "@/lib/utils";

/**
 * "Rename view": the small popover a saved view's ⋯ menu opens — on its wall
 * card (`manageable-saved-view-tile.tsx`) and beside its name in the open
 * view (`saved-view-title-menu.tsx`). The same surface as "Save this view"
 * (`save-view-dialog.tsx`), with one field.
 *
 * It opens with the current name selected, so typing replaces it. Rename
 * stays disabled until committing would change something: an empty name, the
 * name it already has, and a name another view in the same pool holds all
 * leave it off. The pool is the caller's (`savedViewNamePool`, the view
 * itself excluded), and the duplicate mark follows the field as it is typed —
 * the button's state has to, so the message does too.
 *
 * The dialog only decides whether a name may be sent; the caller renames
 * (optimistically) and answers a server refusal in its own status line.
 */
export function RenameViewDialog({
  open,
  onOpenChange,
  anchorRef,
  currentName,
  poolNames,
  shared,
  onRename,
  align = "start",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  currentName: string;
  /** Names this one must not collide with — the view's own left out. */
  poolNames: readonly string[];
  /** A shared view's pool is the team's, and the message says so. */
  shared: boolean;
  onRename: (name: string) => void;
  align?: "start" | "end";
}) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameId = useId();
  const errorId = useId();

  // Every open starts from the view's current name. `open` flipping true is
  // an outside signal (a menu row was chosen), the same case
  // `save-view-dialog.tsx`'s clean-slate effect answers.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external source (dialog opened by a menu row outside this component), not a render-derivable value
      setName(currentName);
    }
    // `currentName` is read only to seed the field; a rename landing while
    // the dialog is open must not overwrite what is being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmed = name.trim();
  const duplicate =
    trimmed.length > 0 &&
    trimmed !== currentName &&
    hasDuplicateViewName(trimmed, [...poolNames]);
  const canSubmit = trimmed.length > 0 && trimmed !== currentName && !duplicate;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onOpenChange(false);
    onRename(trimmed);
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {/* Same type-only cast as `save-view-dialog.tsx`: a DOM ref starts
          null, and Radix reads `.current` at measure time. */}
      <PopoverAnchor
        virtualRef={anchorRef as unknown as React.RefObject<HTMLElement>}
      />
      <PopoverContent
        align={align}
        side="bottom"
        sideOffset={6}
        role="dialog"
        aria-label="Rename view"
        className="w-[340px] rounded-[12px] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-dropdown)]"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }}
        onKeyDown={(e) => {
          // Keys typed here are the dialog's own: a wall card's reorder
          // shortcuts and the lightbox's must not also read them.
          e.stopPropagation();
          if (e.key === "Escape") onOpenChange(false);
        }}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-[13px] font-medium text-[var(--ink-900)]">
            Rename view
          </p>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="sr-only">
              Name
            </label>
            <input
              id={nameId}
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={duplicate || undefined}
              aria-describedby={duplicate ? errorId : undefined}
              className={cn(
                "h-8 w-full rounded-[6px] border bg-[var(--surface-card)] px-2.5 text-[13px] text-[var(--ink-900)] transition-colors duration-200 outline-none",
                duplicate
                  ? "border-[var(--error)]"
                  : "border-[var(--border-field)] focus:border-[var(--blue)]",
              )}
            />
            {duplicate && (
              <p
                id={errorId}
                role="alert"
                className="text-[11px]"
                style={{ color: "var(--error)" }}
              >
                {shared
                  ? `The team already has a view called “${trimmed}”.`
                  : `You already have a view called “${trimmed}”.`}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="cursor-pointer text-[12px] font-medium text-[var(--ink-700)] hover:text-[var(--ink-900)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              aria-disabled={!canSubmit}
              className={cn(
                advButton("primary", "sm"),
                !canSubmit && "opacity-45",
              )}
              onClick={(e) => {
                if (!canSubmit) e.preventDefault();
              }}
            >
              Rename
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
