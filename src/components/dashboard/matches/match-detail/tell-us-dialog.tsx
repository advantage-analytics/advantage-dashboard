"use client";

import { useId, useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import {
  MATCH_ISSUE_MAX_LENGTH,
  type ReportPoint,
} from "@/lib/data/match-verification";
import { advButton } from "@/lib/ui/adv-button";
import { reportMatchIssue } from "./report-issue-actions";

/** Past this share of the limit the field says how much is left. */
const COUNT_FROM = 0.8;

/**
 * "Something still wrong? Tell us" (Advantage Review canvas, "Verified or
 * reviewed" › "Something still wrong? Tell us, as a dialog"): the design
 * system's 440px form dialog over the report, opened from the Verified
 * popover — which keeps the details only.
 *
 * The point it is about leads: the whole match, and the note can name the
 * point. A caller can pass a point instead (self review's Video-tab entry,
 * when it returns): it shows as a removable chip and goes with the report,
 * whose stored label the server writes from the point row. The guidance sits under the
 * field, not in the placeholder, whose grey fails contrast — the placeholder
 * is an example of a good answer. ⌘/Ctrl+Enter sends.
 *
 * The draft is the caller's (`VerifiedFact`), so Cancel — back to the
 * popover — keeps it, and so does closing. Sent swaps the same dialog to what
 * was sent, on a recessed well, and Done closes it.
 */
export function TellUsDialog({
  open,
  onOpenChange,
  onCancel,
  matchId,
  email,
  point,
  onRemovePoint,
  note,
  onNoteChange,
  onSent,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cancel: close, and return to the Verified popover. */
  onCancel: () => void;
  matchId: string;
  /** The signed-in reader's address — where the reply goes. */
  email: string | null;
  point: ReportPoint | null;
  onRemovePoint: () => void;
  note: string;
  onNoteChange: (note: string) => void;
  /** The report went in: the caller clears its draft. */
  onSent: () => void;
  /** Focus on close: the popover link that opened this is gone by then. */
  onCloseAutoFocus: (event: Event) => void;
}) {
  const fieldId = useId();
  const hintId = useId();
  const [sent, setSent] = useState<{
    point: ReportPoint | null;
    note: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const empty = note.trim().length === 0;
  const left = MATCH_ISSUE_MAX_LENGTH - note.length;
  const replyTo = email ? ` and reply to ${email}` : "";

  function changeOpen(next: boolean) {
    // Held while a Send is in flight. Not once it has landed: the transition
    // stays pending until the route's refresh after the action settles, and
    // Done must not wait for that.
    if (pending && !sent) return;
    onOpenChange(next);
    if (!next) {
      setSent(null);
      setError(null);
    }
  }

  function send() {
    if (empty || pending) return;
    setError(null);
    const asSent = { point, note: note.trim() };
    startTransition(async () => {
      const result = await reportMatchIssue(matchId, note, point?.id ?? null);
      if (result.ok) {
        setSent(asSent);
        onSent();
      } else {
        setError(result.error);
      }
    });
  }

  if (sent) {
    return (
      <RosterDialog
        open={open}
        onOpenChange={changeOpen}
        onCloseAutoFocus={onCloseAutoFocus}
        width={440}
        title="Sent to the Advantage team"
        description={`We’ll check it against the video${replyTo}.`}
        footer={
          <>
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("primary")}
              onClick={() => changeOpen(false)}
            >
              Done
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2 rounded-[var(--radius-element)] bg-[var(--surface-page)] px-3.5 py-3">
          {sent.point ? (
            <span className="text-[11px] text-[var(--ink-600)]">
              <span className="mono">{sent.point.number}</span> ·{" "}
              {sent.point.where}
            </span>
          ) : null}
          <p className="m-0 text-[13px] leading-[1.55] whitespace-pre-line text-[var(--ink-900)]">
            {sent.note}
          </p>
        </div>
        <p className="m-0 text-[11px] text-[var(--ink-600)]">
          The match stays Verified by Advantage while we look.
        </p>
      </RosterDialog>
    );
  }

  return (
    <RosterDialog
      open={open}
      onOpenChange={changeOpen}
      onCloseAutoFocus={onCloseAutoFocus}
      width={440}
      title="Tell us what’s still wrong"
      description={`It goes to the Advantage team, who’ll check it against the video${replyTo}.`}
      footer={
        <>
          <div className="flex-1" />
          <button
            type="button"
            className={advButton("ghost")}
            disabled={pending}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className={advButton("primary")}
            disabled={empty || pending}
            aria-busy={pending || undefined}
            onClick={send}
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <span className="text-[11px] text-[var(--ink-600)]">Point</span>
        {point ? (
          <span className="inline-flex h-7 max-w-full items-center gap-2 self-start rounded-[6px] bg-[var(--surface-subtle)] pr-1.5 pl-2.5 text-[12px] text-[var(--ink-900)]">
            <span className="mono shrink-0 text-[11px] text-[var(--ink-600)]">
              {point.number}
            </span>
            <span className="shrink-0">{point.where}</span>
            <span className="min-w-0 truncate text-[var(--ink-500)]">
              {point.reading}
            </span>
            <button
              type="button"
              aria-label="Remove the point"
              disabled={pending}
              onClick={onRemovePoint}
              className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-[4px] text-[var(--ink-500)] transition-colors hover:bg-[var(--ink-100)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
            >
              <X className="size-3" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </span>
        ) : (
          <span className="text-[12px] text-[var(--ink-700)]">
            The whole match{" "}
            <span className="text-[var(--ink-500)]">
              · or name the point in your note
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={fieldId}
          className="text-[12px] leading-[1.5] text-[var(--ink-700)]"
        >
          What should it say?
        </label>
        <textarea
          id={fieldId}
          rows={4}
          autoFocus
          value={note}
          maxLength={MATCH_ISSUE_MAX_LENGTH}
          disabled={pending}
          aria-describedby={hintId}
          placeholder="Nakamura’s backhand was in, so it was his winner"
          onChange={(event) => onNoteChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              send();
            }
          }}
          className="w-full resize-none rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
        />
        <div className="flex items-baseline gap-3">
          <span
            id={hintId}
            className="text-[11px] leading-[1.45] text-[var(--ink-600)]"
          >
            Who won it, how it ended, or what the score should be.
          </span>
          <span className="flex-1" />
          {note.length > MATCH_ISSUE_MAX_LENGTH * COUNT_FROM ? (
            <span className="mono shrink-0 text-[11px] text-[var(--ink-600)]">
              {left} left
            </span>
          ) : null}
        </div>
      </div>

      {error ? <DialogProblem message={error} /> : null}
    </RosterDialog>
  );
}
