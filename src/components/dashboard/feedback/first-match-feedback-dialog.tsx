"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  DialogProblem,
  RosterDialog,
} from "@/components/dashboard/team/dialog-shell";
import {
  FIRST_MATCH_FEEDBACK_COPY as COPY,
  FIRST_MATCH_FEEDBACK_RATINGS,
  FIRST_MATCH_FEEDBACK_WORDS,
  MAX_FIRST_MATCH_FEEDBACK_NOTE,
  ratingLabel,
  type FirstMatchFeedback,
  type FirstMatchFeedbackRating,
} from "@/lib/feedback/first-match-feedback";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * "How was your first match report?" — one five-point rating and an optional
 * note, asked once, on the first dashboard visit after the player has read
 * their first report and come back.
 *
 * The DS Dialog (v3) at its form width: the same 440px object `ConfirmDialog`
 * and the roster's dialogs draw (`RosterDialog`), so this reads as one of the
 * product's dialogs rather than a survey widget dropped on top of it. Title,
 * one-line contract, the two fields, the footer grammar — Not now and exactly
 * one primary, disabled until a rating is chosen.
 *
 * The caller owns the save and what happens after it: `onSubmit` resolves true
 * when the answer landed (the caller then closes it and says thanks), false
 * when it did not, and the dialog shows the shared `DialogProblem` line and
 * keeps the answer on screen to send again. While a save is in flight, Not now
 * and Send are held; the X and Esc still close it, which the shell treats as
 * Not now.
 */
export function FirstMatchFeedbackDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  /** `false` is Not now, from the button, the X, Esc or the scrim. */
  onOpenChange: (open: boolean) => void;
  /** Saves the answer; resolves true when it was saved. */
  onSubmit: (feedback: FirstMatchFeedback) => Promise<boolean>;
}) {
  const [rating, setRating] = useState<FirstMatchFeedbackRating | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (rating === null || pending) return;
    setPending(true);
    setError(null);
    const saved = await onSubmit({ rating, note: note.trim() || null });
    setPending(false);
    if (!saved) setError(COPY.failed);
  }

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      width={440}
      title={COPY.title}
      description={COPY.contract}
      footer={
        <>
          <span className="flex-1" />
          <button
            type="button"
            disabled={pending}
            onClick={() => onOpenChange(false)}
            className={advButton("outline", "sm")}
          >
            {COPY.notNow}
          </button>
          <SendButton
            pending={pending}
            disabled={rating === null}
            onClick={send}
          />
        </>
      }
    >
      <FirstMatchFeedbackFields
        rating={rating}
        onRating={setRating}
        note={note}
        onNote={setNote}
        disabled={pending}
      />
      <DialogProblem message={error} />
    </RosterDialog>
  );
}

/**
 * The two fields, without a shell, so `/design` can set them in other frames.
 * A 12px `--ink-700` label over each, the DS field label; neither is marked
 * required — the primary's disabled state is what says a rating is needed.
 */
export function FirstMatchFeedbackFields({
  rating,
  onRating,
  note,
  onNote,
  disabled = false,
}: {
  rating: FirstMatchFeedbackRating | null;
  onRating: (rating: FirstMatchFeedbackRating) => void;
  note: string;
  onNote: (note: string) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <RatingScale value={rating} onChange={onRating} disabled={disabled} />
      <NoteField
        label={COPY.noteLabel}
        value={note}
        onChange={onNote}
        disabled={disabled}
      />
    </>
  );
}

/** The one primary: Send, or the spinner with "Sending…" while held. */
export function SendButton({
  pending,
  disabled,
  onClick,
  label = COPY.send,
}: {
  pending: boolean;
  disabled: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={onClick}
      className={cn(
        advButton("primary", "sm"),
        // Held, not dimmed: the spinner is the state (ConfirmDialog).
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
          {COPY.sending}
        </>
      ) : (
        label
      )}
    </button>
  );
}

/**
 * The note: the one boxed input (primitives › Fields) — 13px, 6px radius,
 * field border, the focus ring — under a 12px label. Classes as
 * `AskFeedbackControl`'s textarea.
 */
export function NoteField({
  label,
  value,
  onChange,
  disabled = false,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (note: string) => void;
  disabled?: boolean;
  rows?: number;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-[12px] leading-[1.5] text-[var(--ink-700)]"
      >
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        maxLength={MAX_FIRST_MATCH_FEEDBACK_NOTE}
        disabled={disabled}
        placeholder={COPY.notePlaceholder}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-none rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 py-2 text-[13px] leading-[1.5] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
      />
    </div>
  );
}

const SCALE_SIZE = {
  sm: "h-8 text-[12px]",
  md: "h-9 text-[13px]",
  lg: "h-11 text-[14px]",
} as const;

/**
 * Five equal boxes, 1 to 5. Single choice, so it is a radio group to
 * assistive tech — arrow keys move the choice, Tab leaves it — and the chosen
 * box takes the DS's one "chosen" treatment for a selectable surface: a
 * `--blue` border on the 8% blue wash (the `Radio` card variant,
 * `primitives.md`). Numbers rather than five words because five words do not
 * fit a 440px dialog on one line; the scale's ends are said once, underneath,
 * in `text-micro` — or, with `caption="word"`, the chosen point's own word
 * takes that line once there is one.
 *
 * `inline` draws fixed 36px boxes in a row instead of five columns, for a
 * strip or a toolbar; `label={null}` drops the question line and names the
 * group by `ariaLabel` instead.
 */
export function RatingScale({
  value,
  onChange,
  disabled = false,
  size = "md",
  inline = false,
  label = COPY.ratingLabel,
  ariaLabel,
  caption = "ends",
}: {
  value: FirstMatchFeedbackRating | null;
  onChange: (rating: FirstMatchFeedbackRating) => void;
  disabled?: boolean;
  size?: keyof typeof SCALE_SIZE;
  inline?: boolean;
  /** The question over the boxes; null for none (then pass `ariaLabel`). */
  label?: string | null;
  ariaLabel?: string;
  caption?: "ends" | "word" | "none";
}) {
  const labelId = useId();

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const count = FIRST_MATCH_FEEDBACK_RATINGS.length;
    const current = value ?? (step > 0 ? 0 : count + 1);
    const next = Math.min(count, Math.max(1, current + step));
    const rating = FIRST_MATCH_FEEDBACK_RATINGS[next - 1];
    onChange(rating);
    (
      event.currentTarget.children[next - 1] as HTMLElement | undefined
    )?.focus();
  }

  return (
    <div className={cn("flex flex-col gap-2", inline && "gap-1.5")}>
      {label !== null && (
        <span
          id={labelId}
          className="text-[12px] leading-[1.5] text-[var(--ink-700)]"
        >
          {label}
        </span>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label !== null ? labelId : undefined}
        aria-label={label === null ? ariaLabel : undefined}
        onKeyDown={onKeyDown}
        className={inline ? "flex gap-1.5" : "grid grid-cols-5 gap-2"}
      >
        {FIRST_MATCH_FEEDBACK_RATINGS.map((rating) => {
          const chosen = value === rating;
          // One tab stop for the group: the chosen box, or the first when
          // nothing is chosen yet.
          const tabStop = chosen || (value === null && rating === 1);
          return (
            <button
              key={rating}
              type="button"
              role="radio"
              aria-checked={chosen}
              aria-label={ratingLabel(rating)}
              tabIndex={tabStop ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(rating)}
              className={cn(
                "tabular flex cursor-pointer items-center justify-center rounded-[var(--radius-button)] border",
                SCALE_SIZE[size],
                inline && "w-9",
                "transition-colors duration-[var(--duration-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                chosen
                  ? "border-[var(--blue)] bg-[var(--blue-tint-08)] font-medium"
                  : "border-[var(--border-field)] bg-[var(--surface-card)] font-normal hover:bg-[var(--surface-subtle)]",
              )}
              // DS type colours are unlayered and beat a text utility.
              style={{ color: chosen ? "var(--ink-900)" : "var(--ink-700)" }}
            >
              {rating}
            </button>
          );
        })}
      </div>
      {caption !== "none" &&
        (caption === "word" && value !== null ? (
          <p
            role="status"
            className="text-micro text-center"
            style={{ color: "var(--ink-700)" }}
          >
            {FIRST_MATCH_FEEDBACK_WORDS[value]}
          </p>
        ) : (
          <div className="flex justify-between">
            <span className="text-micro">{COPY.ratingLow}</span>
            <span className="text-micro">{COPY.ratingHigh}</span>
          </div>
        ))}
    </div>
  );
}
