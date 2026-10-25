"use client";

import { useState } from "react";
import { ConfirmDialog, Em } from "@/components/ui/confirm-dialog";
import { deleteMatchDraft } from "@/lib/wizard/actions";

/**
 * "Discard this draft?" — the confirm behind the draft rail's ⋯.
 *
 * The shape of `DeleteMatchDialog`, for the record beside it in the same
 * header: a question for a title, the contract sentence under it, danger
 * tone, the spinner inside the action while the delete runs, and the shared
 * problem line when the database refuses. A draft is cheap and this still
 * asks: the two actions beside it in this header (Delete match, Delete event)
 * both confirm, the wizard asks before clearing less than this (Start over),
 * and a dialog is the one surface that can say "Discarding…" or show a
 * refusal — the one-click menu this replaces swallowed both, and closed the
 * rail on a draft that was still there.
 *
 * What it costs is one sentence. A draft holds the wizard's answers and a file
 * NAME, never a sent video: a draft whose match has a video job is reaped
 * before it lists, and the picked file lives only in the browser session, to
 * be picked again on Continue. So the honest reassurance is the file on the
 * device and the match library, not the old "a video already sent stays".
 *
 * "Keep draft" rather than "Cancel": beside a verb that means stop, Cancel can
 * read as "cancel the draft". The wizard's Start over makes the same call.
 */
export const DISCARD_DRAFT_REFUSED = "Couldn’t discard this draft. Try again.";

export function DiscardDraftDialog({
  draftId,
  matchName,
  open,
  onOpenChange,
  onDiscarded,
  onCloseAutoFocus,
}: {
  draftId: string;
  /** The draft's name as the rail titles it (`draftTitle`), or null before it has one. */
  matchName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The row is gone: close the rail. Called after the dialog has closed. */
  onDiscarded: () => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const result = await deleteMatchDraft(draftId);
      if (result.error) {
        setPending(false);
        setError(DISCARD_DRAFT_REFUSED);
        return;
      }
      setPending(false);
      onOpenChange(false);
      onDiscarded();
    } catch {
      setPending(false);
      setError(DISCARD_DRAFT_REFUSED);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title="Discard this draft?"
      description={
        <>
          Throws away the answers saved for{" "}
          {matchName ? (
            <>
              the match <Em>{matchName}</Em>
            </>
          ) : (
            <Em>this draft</Em>
          )}{" "}
          so far. The file you picked stays on your device, and nothing in your
          match library changes.
        </>
      }
      tone="danger"
      confirmLabel="Discard draft"
      pendingLabel="Discarding…"
      cancelLabel="Keep draft"
      pending={pending}
      error={error}
      onConfirm={() => void confirm()}
      onCloseAutoFocus={onCloseAutoFocus}
    />
  );
}
