"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useId } from "react";
import { Loader2, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { useDescribedBody } from "@/hooks/use-described-body";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Every "are you sure?" in the product — sign out, delete a match or an event,
 * drop entered set scores, leave without saving.
 *
 * Before this there were four shells for the same question: a 320px card with
 * uppercase 10px buttons, two 448px ones at different radii, and the stock
 * shadcn dialog with an 18px semibold title and a blue button that removed
 * data. This is the DS Dialog (v3) geometry once, the same object
 * `RosterDialog` draws, so a confirm and a form dialog read as one family:
 * 440px, `--radius-card`, `--shadow-dropdown`, 24/24/20 padding, 18px gaps,
 * a 16/500 title over a one-line 12px `--ink-600` contract sentence, the 28px
 * chrome close, and the footer grammar — an optional quiet link left, Cancel
 * and exactly one action right.
 *
 * ── Red only when something is lost ─────────────────────────────────────────
 * `tone="danger"` is for a confirm that destroys something — a match, an event,
 * entered scores, unsaved edits. Signing out loses nothing, so it stays the
 * blue primary. The earlier red Log out made the most routine action in the app
 * look like the most dangerous one.
 *
 * ── Radix AlertDialog, and its own close ────────────────────────────────────
 * An alert dialog, not a dialog: a click on the scrim does not dismiss a
 * question, and the screen reader announces it as one. AlertDialog has no close
 * button of its own, so the X is a plain button — not a second `Cancel`, which
 * would compete for the initial focus Radix gives the footer's Cancel.
 *
 * ── The caller owns the work ────────────────────────────────────────────────
 * The action is a plain button, not `AlertDialogAction`, which closes on click
 * and would unmount the pending state and any error before the request
 * settles. While `pending`, every way out — Cancel, the X, Esc — is held, so a
 * sign-out or a delete cannot be abandoned half-done.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  pending = false,
  error = null,
  onConfirm,
  footerLeft,
  onCloseAutoFocus,
  onContentClick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A question, ending in "?". */
  title: React.ReactNode;
  /** The contract: one sentence on what happens. */
  description: React.ReactNode;
  /** Optional body — `ConfirmProse` of consequences, an account row, a note. */
  children?: React.ReactNode;
  /** A verb that names the object: "Delete match", never "OK" or "Confirm". */
  confirmLabel: string;
  /** Shown beside the spinner while `pending`, e.g. "Deleting…". */
  pendingLabel?: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
  /** A quiet blue text action at the footer's left edge (DS footer grammar). */
  footerLeft?: React.ReactNode;
  onCloseAutoFocus?: (event: Event) => void;
  /** For dialogs opened from inside a clickable row, which must not see the click. */
  onContentClick?: (event: React.MouseEvent) => void;
}) {
  // The body is what the confirm costs, so it is read with the contract on
  // open rather than left for a screen reader to stumble on.
  const bodyId = useId();
  const { descriptionRef, contentProps } = useDescribedBody(
    children ? bodyId : undefined,
  );
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <AlertDialogContent
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 outline-none sm:max-w-none"
        style={{
          width: "440px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-dropdown)",
        }}
        onCloseAutoFocus={onCloseAutoFocus}
        onClick={onContentClick}
        {...contentProps}
      >
        <div className="flex flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <AlertDialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                {title}
              </AlertDialogTitle>
              <AlertDialogDescription
                ref={descriptionRef}
                className="mt-1 text-left text-[12px] leading-[1.55] text-pretty text-[var(--ink-600)]"
              >
                {description}
              </AlertDialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              disabled={pending}
              onClick={() => onOpenChange(false)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          {children && (
            <div id={bodyId} className="flex flex-col gap-[18px]">
              {children}
            </div>
          )}

          <DialogProblem message={error} />

          <div className="flex items-center gap-2.5 pt-0.5">
            {footerLeft}
            <span className="flex-1" />
            {/* Radix's Cancel, so it takes the initial focus: Enter on open
                keeps things as they are rather than running the action. */}
            <AlertDialogPrimitive.Cancel
              disabled={pending}
              className={advButton("outline", "sm")}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <button
              type="button"
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={onConfirm}
              className={cn(
                advButton(tone === "danger" ? "danger-solid" : "primary", "sm"),
                // Held, not dimmed: the spinner is the state, and a half-opaque
                // button beside it read as "this failed".
                pending && "disabled:opacity-100",
              )}
            >
              {pending ? (
                <>
                  <Loader2
                    className="size-3.5 animate-spin"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  {pendingLabel ?? confirmLabel}
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * What a confirm costs or leaves alone, written as sentences.
 *
 * ── Why this is not a list (2026-09-22) ─────────────────────────────────────
 * It was one: `ConfirmList`, a `--surface-subtle` tub of 11px middot bullets,
 * hand-copied into Leave team, Make owner and Remove player alongside the two
 * callers of the primitive. A bulleted list promises items you will compare or
 * count, and nobody compares consequences — they read for the gist and press
 * the button. At 11px on a grey fill the block read as fine print inside a
 * dialog whose whole job is being read, so the sentences that mattered ("your
 * matches stay with the program") were the ones skimmed past.
 *
 * Prose at the body size, with the load-bearing nouns in `Em`, is read. The
 * cost is that the copy has to be written rather than assembled, which is why
 * this takes children instead of an `items` array: there is no shape to fill
 * in without deciding what the sentence says.
 *
 * Two paragraphs at most. Past that the facts are genuinely unrelated and the
 * dialog wants grouping, not prose — see the note in `reference/chrome.md`.
 */
export function ConfirmProse({
  id,
  children,
}: {
  /** Pass the dialog's `describedBodyId` so the prose is read on open. */
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className="flex flex-col gap-2.5 text-[12px] leading-[1.6] text-pretty text-[var(--ink-700)]"
    >
      {children}
    </div>
  );
}

/**
 * The trailing line in a confirm that carries no consequence — where you land
 * afterwards, how to come back. Quiet enough to skip, present enough to answer
 * the question if it is the one being asked.
 */
export function ConfirmAside({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[12px] leading-[1.6] text-pretty text-[var(--ink-500)]">
      {children}
    </p>
  );
}

/**
 * A noun in confirm prose the reader must not skim past — the match being
 * deleted, the person gaining ownership, the thing that survives.
 *
 * Use it two or three times in a dialog, never on a whole clause: emphasis
 * spread over a sentence is the same as no emphasis.
 */
export function Em({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-[var(--ink-900)]">{children}</span>;
}

/**
 * A one-line note in the body — an icon and a sentence on `--surface-subtle`.
 * Used for the thing a confirm will also throw away, like unsaved edits.
 */
export function ConfirmNote({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-2.5">
      <span className="mt-px shrink-0 text-[var(--ink-600)] [&>svg]:size-[13px] [&>svg]:stroke-[1.5]">
        {icon}
      </span>
      <span className="text-[12px] leading-[1.6] text-[var(--ink-700)]">
        {children}
      </span>
    </div>
  );
}
