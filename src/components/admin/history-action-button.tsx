"use client";

import { useState, useTransition } from "react";
import { ConfirmDialog, Em } from "@/components/ui/confirm-dialog";
import { advButton } from "@/lib/ui/adv-button";

/** What every upload-history action returns: a refusal carries a sentence. */
export type HistoryActionResult = { ok: true } | { ok: false; message: string };

export type HistoryAction = (
  formData: FormData,
) => Promise<HistoryActionResult>;

/**
 * A confirm's copy as plain data, so a Server Component can hand it across
 * the client boundary and a spec can assert it without mounting Radix (whose
 * portal renders nothing under `renderToStaticMarkup`). The description is one
 * sentence split around the item's `what`, which is drawn in `Em`.
 */
export interface HistoryConfirmCopy {
  title: string;
  description: { before: string; after: string };
  confirmLabel: string;
  pendingLabel: string;
  tone: "primary" | "danger";
}

/**
 * "Abandon and delete match" purges the console-created match's storage and
 * deletes the match, so it is the one history control that asks first. The
 * attachment abandon and "Abandon pending" are recoverable by resubmitting and
 * stay one click — pass this as `confirm` to either to change that.
 */
export const ABANDON_MATCH_CONFIRM: HistoryConfirmCopy = {
  title: "Abandon and delete this match?",
  description: {
    before: "Removes ",
    after: " — the match and its uploaded video — for good, with no undo.",
  },
  confirmLabel: "Abandon and delete match",
  pendingLabel: "Deleting…",
  tone: "danger",
};

/**
 * One Admin › Uploads history control (T28): an outline button that sends the
 * fields its server action already reads and shows the action's refusal.
 *
 * A plain `<form action>` threw the `{ ok, message }` result away, so an RPC
 * refusal — a held quota, an active attempt, a failed purge, a resume by a
 * different administrator — left the page silently unchanged. Here the action
 * is awaited inside a transition and its `message` printed verbatim under the
 * button (or in the dialog, when the control confirms first). Success prints
 * nothing: the action revalidates `/admin/uploads`, the row re-renders with
 * its new state, and this control unmounts with the flag that drew it.
 */
export function HistoryActionButton({
  action,
  fields,
  label,
  confirm,
}: {
  action: HistoryAction;
  /** The form fields the action reads, e.g. `operationId`, `itemId`, `mode`. */
  fields: Record<string, string>;
  label: string;
  /** Ask in `ConfirmDialog` before running; `subject` is the item's `what`. */
  confirm?: { copy: HistoryConfirmCopy; subject: string };
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      for (const [name, value] of Object.entries(fields))
        formData.set(name, value);
      let result: HistoryActionResult;
      try {
        result = await action(formData);
      } catch {
        result = {
          ok: false,
          message: "The request did not complete. Try again.",
        };
      }
      if (result.ok) {
        setError(null);
        setOpen(false);
      } else {
        setError(result.message);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        className={advButton("outline", "sm")}
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => {
          if (!confirm) return run();
          setError(null);
          setOpen(true);
        }}
      >
        {label}
      </button>
      {!confirm && error && (
        <p role="alert" className="text-[12px] text-[var(--danger)]">
          {error}
        </p>
      )}
      {confirm && (
        <ConfirmDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setError(null);
          }}
          title={confirm.copy.title}
          description={
            <>
              {confirm.copy.description.before}
              <Em>{confirm.subject}</Em>
              {confirm.copy.description.after}
            </>
          }
          tone={confirm.copy.tone}
          confirmLabel={confirm.copy.confirmLabel}
          pendingLabel={confirm.copy.pendingLabel}
          pending={pending}
          error={error}
          onConfirm={run}
        />
      )}
    </div>
  );
}
