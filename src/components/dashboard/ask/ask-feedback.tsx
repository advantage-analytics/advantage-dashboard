"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useId, useState } from "react";
import {
  ASK_FEEDBACK_REASONS,
  ASK_FEEDBACK_REASON_LABELS,
  MAX_ASK_FEEDBACK_NOTE,
  type AskFeedback,
  type AskFeedbackRating,
  type AskFeedbackReason,
} from "@/lib/services/ask/feedback";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

const ASK_FEEDBACK_COPY = {
  up: "Good answer",
  down: "Bad answer",
  ask: "What went wrong?",
  notePlaceholder: "Anything else? (optional)",
  send: "Send",
  thanks: "Thanks — kept to help improve Ask.",
  failed: "Could not save that. Try again.",
} as const;

/**
 * What happens to a thumb, said where it is given and where a conversation
 * is deleted: the row keeps a copy of the exchange and outlives the thread
 * (`20261014205215_ask_feedback_keep.sql`).
 */
export const ASK_FEEDBACK_KEPT =
  "Feedback you send is kept with its question and answer to improve Ask, even if you delete the conversation.";

/**
 * Thumbs up or down on one saved answer, beside its signature.
 *
 * A thumb is saved the moment it is pressed; pressing it again takes it back.
 * A thumbs down then opens one optional step — reasons from a fixed list and
 * a short note — which updates the same row when sent. Nothing about it is
 * required: closing the page after the thumb keeps the thumb.
 *
 * The answer the thumb is on is shown as it is either way; feedback never
 * changes or hides it.
 */
export function AskFeedbackControl({
  feedback,
  onRate,
}: {
  feedback: AskFeedback | null;
  /** Saves (or with null, takes back) the thumb; resolves true when it was saved. */
  onRate: (feedback: AskFeedback | null) => Promise<boolean>;
}) {
  // Open once a thumbs down is pressed, until its reasons are sent.
  const [detailOpen, setDetailOpen] = useState(false);
  const [reasons, setReasons] = useState<AskFeedbackReason[]>(
    feedback?.reasons ?? [],
  );
  const [note, setNote] = useState(feedback?.note ?? "");
  const [said, setSaid] = useState<"thanks" | "failed" | null>(null);
  const noteId = useId();

  async function press(rating: AskFeedbackRating) {
    const next =
      feedback?.rating === rating ? null : { rating, reasons: [], note: null };
    setDetailOpen(next?.rating === "down");
    setReasons([]);
    setNote("");
    const saved = await onRate(next);
    setSaid(!saved ? "failed" : next?.rating === "up" ? "thanks" : null);
    if (!saved) setDetailOpen(false);
  }

  async function send() {
    const saved = await onRate({
      rating: "down",
      reasons,
      note: note.trim() || null,
    });
    setSaid(saved ? "thanks" : "failed");
    if (saved) setDetailOpen(false);
  }

  return (
    <div data-ask-feedback="" className="flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Thumb
          label={ASK_FEEDBACK_COPY.up}
          pressed={feedback?.rating === "up"}
          onClick={() => press("up")}
        >
          <ThumbsUp className="size-3.5" aria-hidden="true" />
        </Thumb>
        <Thumb
          label={ASK_FEEDBACK_COPY.down}
          pressed={feedback?.rating === "down"}
          onClick={() => press("down")}
        >
          <ThumbsDown className="size-3.5" aria-hidden="true" />
        </Thumb>
        <p role="status" className="text-micro ml-1">
          {said && (
            <span
              style={{
                color: said === "failed" ? "var(--danger)" : "var(--ink-500)",
              }}
            >
              {ASK_FEEDBACK_COPY[said]}
            </span>
          )}
        </p>
      </div>

      {detailOpen && feedback?.rating === "down" && (
        <div
          data-ask-feedback-detail=""
          className="flex max-w-[60ch] flex-col gap-3"
        >
          <p className="text-body-sm" style={{ color: "var(--ink-700)" }}>
            {ASK_FEEDBACK_COPY.ask}
          </p>
          <div className="flex flex-wrap gap-2">
            {ASK_FEEDBACK_REASONS.map((reason) => {
              const active = reasons.includes(reason);
              return (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setReasons((current) =>
                      active
                        ? current.filter((r) => r !== reason)
                        : [...current, reason],
                    )
                  }
                  className={cn(
                    "inline-flex h-7 shrink-0 cursor-pointer items-center rounded-full border px-3 text-[12px] whitespace-nowrap",
                    "transition-colors duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                    active
                      ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium"
                      : "border-[var(--border-hairline)] font-normal hover:bg-[var(--surface-subtle)]",
                  )}
                  // DS type colours are unlayered and beat a text utility.
                  style={{
                    color: active ? "var(--ink-900)" : "var(--ink-600)",
                  }}
                >
                  {ASK_FEEDBACK_REASON_LABELS[reason]}
                </button>
              );
            })}
          </div>
          <label htmlFor={noteId} className="sr-only">
            {ASK_FEEDBACK_COPY.notePlaceholder}
          </label>
          <textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={MAX_ASK_FEEDBACK_NOTE}
            placeholder={ASK_FEEDBACK_COPY.notePlaceholder}
            onChange={(event) => setNote(event.target.value)}
            className="w-full resize-none rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          />
          <p className="text-micro" style={{ color: "var(--ink-500)" }}>
            {ASK_FEEDBACK_KEPT}
          </p>
          <div>
            <button
              type="button"
              onClick={send}
              disabled={reasons.length === 0 && note.trim() === ""}
              className={advButton("primary", "sm")}
            >
              {ASK_FEEDBACK_COPY.send}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Thumb({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 cursor-pointer items-center justify-center rounded-[var(--radius-button)]",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        pressed && "bg-[var(--surface-subtle)]",
      )}
      style={{ color: pressed ? "var(--blue)" : "var(--ink-500)" }}
    >
      {children}
    </button>
  );
}
