"use client";

import { useId } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SEND_BACK_NOTE_MAX } from "@/lib/labels/send-back";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/** Send back needs a note: the trimmed text must say something. */
export function canSendBack(note: string): boolean {
  return note.trim().length > 0;
}

/**
 * "Send back" on a Published, to check row (AdminAudit artboard): the shared
 * `ConfirmDialog` with one required field, the note the labeller reads. The
 * confirm stays held while the trimmed note is empty. The row owns the note,
 * the request and its refusal, so a closed dialog keeps what was typed.
 */
export function SendBackDialog({
  open,
  onOpenChange,
  players,
  labellerName,
  note,
  onNoteChange,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "Player vs Player", for the question. */
  players: string;
  labellerName: string | null;
  note: string;
  onNoteChange: (note: string) => void;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const fieldId = useId();
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Send ${players} back?`}
      description={`It goes back to ${labellerName ?? "its labeller"} to fix. The published version stays live for the player until they publish again.`}
      confirmLabel="Send back"
      pendingLabel="Sending back…"
      pending={pending}
      confirmDisabled={!canSendBack(note)}
      error={error}
      onConfirm={onConfirm}
    >
      <div className="flex flex-col gap-2">
        <label
          htmlFor={fieldId}
          className="text-[11px] font-medium text-[var(--ink-700)]"
        >
          What to fix
        </label>
        <textarea
          id={fieldId}
          rows={3}
          required
          maxLength={SEND_BACK_NOTE_MAX}
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          data-send-back-note=""
          data-focus-ring="none"
          placeholder="Set 2, game 5 has two points merged into one."
          className={cn(
            advField("underline"),
            "h-auto w-full resize-none py-1.5 leading-[1.55]",
          )}
        />
      </div>
    </ConfirmDialog>
  );
}
