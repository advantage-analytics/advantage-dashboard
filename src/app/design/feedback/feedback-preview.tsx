"use client";

import { useId, useState } from "react";
import { Check, X } from "lucide-react";
import {
  FirstMatchFeedbackDialog,
  FirstMatchFeedbackFields,
  NoteField,
  RatingScale,
  SendButton,
} from "@/components/dashboard/feedback/first-match-feedback-dialog";
import { RosterDialog } from "@/components/dashboard/team/dialog-shell";
import { DialogProblem } from "@/components/ui/dialog-problem";
import {
  FIRST_MATCH_FEEDBACK_COPY as COPY,
  FIRST_MATCH_FEEDBACK_WORDS,
  type FirstMatchFeedback,
  type FirstMatchFeedbackRating,
} from "@/lib/feedback/first-match-feedback";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

type Direction = "scale" | "words" | "two-step" | "strip" | "corner" | "home";

const DIRECTIONS: readonly {
  id: Direction;
  label: string;
  note: string;
}[] = [
  {
    id: "scale",
    label: "Scale dialog",
    note: "The shipped component. The DS form dialog at 440px — the same object as every confirm and roster dialog — with the five-point scale, the note and the footer grammar. Asked and answered in one place; the page dims behind it.",
  },
  {
    id: "words",
    label: "Words dialog",
    note: "The same dialog, but the answer is one of three sentences instead of a number: the DS's single-choice card rows with the check-dot. Easier to answer honestly, and the answers read back as words; the cost is a three-point scale.",
  },
  {
    id: "two-step",
    label: "Two-step dialog",
    note: "The question is the title and the scale is the whole first screen — one tap. The chosen box names itself underneath, and the note appears only then, with a follow-up that depends on the answer: what was missing for a low mark, what landed for a high one.",
  },
  {
    id: "strip",
    label: "Strip",
    note: "Not a dialog. A grey strip at the top of whichever dashboard page the player lands on, the scale inline, nothing dimmed. The tap saves the rating on its own; the strip then asks for a note and goes away. The quietest ask that still gets a number from one click.",
  },
  {
    id: "corner",
    label: "Corner card",
    note: "The same fields in a 360px card at the bottom right, nothing dimmed. The player can keep reading and answer when they like — and can also ignore it, so expect fewer answers. It would need to survive navigation between pages.",
  },
  {
    id: "home",
    label: "Home card",
    note: "A card at the top of Home's main column, above Matches and Focus, with the fields side by side. Quiet, and in the one place a returning player usually lands; a player who opens Matches first does not see it until they visit Home.",
  },
];

type Outcome =
  { kind: "sent"; feedback: FirstMatchFeedback } | { kind: "dismissed" } | null;

/**
 * The prompt in each shape it could take, with a fake save behind it: 700ms
 * in flight, then success or — with "Saves fail" on — the failure line, so
 * every state can be looked at. "Open again" resets the answer.
 */
export function FeedbackPreview() {
  const [direction, setDirection] = useState<Direction>("scale");
  const [fail, setFail] = useState(false);
  const [open, setOpen] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<Outcome>(null);

  async function save(
    feedback: FirstMatchFeedback,
    close = true,
  ): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (fail) return false;
    setOutcome({ kind: "sent", feedback });
    if (close) setOpen(false);
    return true;
  }

  function dismiss() {
    setOutcome((current) => current ?? { kind: "dismissed" });
    setOpen(false);
  }

  function reopen() {
    setOutcome(null);
    setAttempt((n) => n + 1);
    setOpen(true);
  }

  const current = DIRECTIONS.find((d) => d.id === direction) ?? DIRECTIONS[0];
  const onSubmit = (feedback: FirstMatchFeedback) => save(feedback, true);

  return (
    <main className="min-h-screen bg-[var(--surface-page)] px-14 py-10">
      <h1 className="text-[16px] font-medium text-[var(--ink-900)]">
        First-match feedback prompt
      </h1>
      <p className="mt-1 max-w-[64ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        One question, asked once: on the first dashboard visit after a player
        has read their first match report and come back (signed in again, or a
        day later). Six directions on the same question; pick one. The save is
        faked and takes 700ms.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2.5">
        {DIRECTIONS.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => {
              setDirection(d.id);
              reopen();
            }}
            className={advButton(
              d.id === direction ? "primary" : "outline",
              "sm",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          aria-pressed={!fail}
          onClick={() => setFail(false)}
          className={advButton(fail ? "outline" : "primary", "sm")}
        >
          Saves succeed
        </button>
        <button
          type="button"
          aria-pressed={fail}
          onClick={() => setFail(true)}
          className={advButton(fail ? "primary" : "outline", "sm")}
        >
          Saves fail
        </button>
        <span className="mx-2 h-5 w-px bg-[var(--border-hairline)]" />
        <button
          type="button"
          onClick={reopen}
          className={advButton("ghost", "sm")}
        >
          Open again
        </button>
      </div>

      <p className="mt-4 max-w-[64ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        {current.note}
      </p>

      <p
        role="status"
        className="mt-3 min-h-5 text-[12px] text-[var(--ink-700)]"
      >
        {outcome?.kind === "sent" && (
          <>
            Saved · {FIRST_MATCH_FEEDBACK_WORDS[outcome.feedback.rating]} (
            {outcome.feedback.rating} of 5)
            {outcome.feedback.note
              ? ` · “${outcome.feedback.note}”`
              : " · no note"}
            . A success toast says &ldquo;{COPY.thanks}&rdquo; and the prompt
            never returns.
          </>
        )}
        {outcome?.kind === "dismissed" && (
          <>Not now · stamped as done; the prompt never returns.</>
        )}
      </p>

      {direction === "scale" && (
        <FirstMatchFeedbackDialog
          key={attempt}
          open={open}
          onOpenChange={(next) => {
            if (!next) dismiss();
          }}
          onSubmit={onSubmit}
        />
      )}

      {direction === "words" && (
        <WordsDialogSketch
          key={attempt}
          open={open}
          onDismiss={dismiss}
          onSubmit={onSubmit}
        />
      )}

      {direction === "two-step" && (
        <TwoStepDialogSketch
          key={attempt}
          open={open}
          onDismiss={dismiss}
          onSubmit={onSubmit}
        />
      )}

      {direction === "strip" && (
        <PageFrame title="Matches">
          {open ? (
            <StripSketch
              key={attempt}
              onRate={(feedback) => save(feedback, false)}
              onNote={onSubmit}
              onDismiss={dismiss}
            />
          ) : null}
        </PageFrame>
      )}

      {direction === "corner" && open && (
        <CornerCardSketch
          key={attempt}
          onSubmit={onSubmit}
          onDismiss={dismiss}
        />
      )}

      {direction === "home" && (
        <HomeFrame>
          {open ? (
            <HomeCardSketch
              key={attempt}
              onSubmit={onSubmit}
              onDismiss={dismiss}
            />
          ) : null}
        </HomeFrame>
      )}
    </main>
  );
}

// ── Shared pieces for the sketches ──────────────────────────────────────────

/** Pending and the failure line around one save, as the shipped dialog keeps them. */
function useSketchSend(
  onSubmit: (feedback: FirstMatchFeedback) => Promise<boolean>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(feedback: FirstMatchFeedback): Promise<boolean> {
    if (pending) return false;
    setPending(true);
    setError(null);
    const saved = await onSubmit(feedback);
    setPending(false);
    if (!saved) setError(COPY.failed);
    return saved;
  }
  return { pending, error, send };
}

/** The 28px chrome close every dismissible surface draws. */
function CloseX({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClick}
      className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none touch:hit-area"
    >
      <X className="size-3.5" strokeWidth={1.5} aria-hidden />
    </button>
  );
}

/** The footer grammar's quiet text action, for a dialog that has no primary yet. */
function QuietNotNow({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="cursor-pointer rounded-[var(--radius-cell)] text-[12px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
    >
      {COPY.notNow}
    </button>
  );
}

/**
 * The fields, the failure line and the footer, holding their own answer — what
 * `FirstMatchFeedbackDialog` does inside the dialog shell, for a shell that is
 * not a dialog. `layout="row"` sets the two fields side by side (the Home
 * card); `"column"` stacks them (the corner card).
 */
function SketchBody({
  layout,
  onSubmit,
  onDismiss,
}: {
  layout: "row" | "column";
  onSubmit: (feedback: FirstMatchFeedback) => Promise<boolean>;
  onDismiss: () => void;
}) {
  const [rating, setRating] = useState<FirstMatchFeedbackRating | null>(null);
  const [note, setNote] = useState("");
  const { pending, error, send } = useSketchSend(onSubmit);

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-[18px]",
          layout === "row" && "md:grid md:grid-cols-2 md:gap-6",
        )}
      >
        <FirstMatchFeedbackFields
          rating={rating}
          onRating={setRating}
          note={note}
          onNote={setNote}
          disabled={pending}
        />
      </div>
      <DialogProblem message={error} />
      <div className="flex items-center gap-2.5 pt-0.5">
        <span className="flex-1" />
        <button
          type="button"
          disabled={pending}
          onClick={onDismiss}
          className={advButton("outline", "sm")}
        >
          {COPY.notNow}
        </button>
        <SendButton
          pending={pending}
          disabled={rating === null}
          onClick={() =>
            rating !== null && void send({ rating, note: note.trim() || null })
          }
        />
      </div>
    </>
  );
}

// ── B: the answer is a sentence ─────────────────────────────────────────────

const WORD_OPTIONS: readonly {
  value: FirstMatchFeedbackRating;
  label: string;
  sub: string;
}[] = [
  {
    value: 1,
    label: "Not useful",
    sub: "I didn't learn anything I didn't already know.",
  },
  {
    value: 3,
    label: "Somewhat useful",
    sub: "A few things stood out. Most of it I'd skip.",
  },
  {
    value: 5,
    label: "Very useful",
    sub: "I'd want this after every match.",
  },
];

/** The DS check-dot: solid Signal Blue with a white 9px check; a 1px ink-300 ring at rest. */
function RadioDot({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-[3px] flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
        checked
          ? "border-[var(--blue)] bg-[var(--blue)]"
          : "border-[var(--ink-300)]",
      )}
    >
      {checked && (
        <Check
          className="size-[9px] text-white"
          strokeWidth={2.5}
          aria-hidden
        />
      )}
    </span>
  );
}

function WordsDialogSketch({
  open,
  onDismiss,
  onSubmit,
}: {
  open: boolean;
  onDismiss: () => void;
  onSubmit: (feedback: FirstMatchFeedback) => Promise<boolean>;
}) {
  const [rating, setRating] = useState<FirstMatchFeedbackRating | null>(null);
  const [note, setNote] = useState("");
  const { pending, error, send } = useSketchSend(onSubmit);
  const groupId = useId();

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onDismiss();
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
            onClick={onDismiss}
            className={advButton("outline", "sm")}
          >
            {COPY.notNow}
          </button>
          <SendButton
            pending={pending}
            disabled={rating === null}
            onClick={() =>
              rating !== null &&
              void send({ rating, note: note.trim() || null })
            }
          />
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <span
          id={groupId}
          className="text-[12px] leading-[1.5] text-[var(--ink-700)]"
        >
          {COPY.ratingLabel}
        </span>
        <div
          role="radiogroup"
          aria-labelledby={groupId}
          className="flex flex-col gap-2"
        >
          {WORD_OPTIONS.map((option) => {
            const chosen = rating === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={chosen}
                disabled={pending}
                onClick={() => setRating(option.value)}
                className={cn(
                  "flex w-full cursor-pointer items-start gap-3 rounded-[var(--radius-element)] border px-3.5 py-3 text-left",
                  "transition-colors duration-[var(--duration-fast)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
                  chosen
                    ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                    : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
                )}
              >
                <RadioDot checked={chosen} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] leading-[1.5] font-medium text-[var(--ink-900)]">
                    {option.label}
                  </span>
                  <span className="text-[12px] leading-[1.5] text-[var(--ink-600)]">
                    {option.sub}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <NoteField
        label={COPY.noteLabel}
        value={note}
        onChange={setNote}
        disabled={pending}
        rows={2}
      />
      <DialogProblem message={error} />
    </RosterDialog>
  );
}

// ── C: one tap, then a follow-up that depends on it ─────────────────────────

const TWO_STEP_TITLE = "How useful was your first match report?";

/** What to ask next, by the mark just given. */
function followUp(rating: FirstMatchFeedbackRating): string {
  if (rating <= 2) return "What was missing?";
  if (rating === 3) return "What would have made it more useful?";
  return "What did you get the most from?";
}

function TwoStepDialogSketch({
  open,
  onDismiss,
  onSubmit,
}: {
  open: boolean;
  onDismiss: () => void;
  onSubmit: (feedback: FirstMatchFeedback) => Promise<boolean>;
}) {
  const [rating, setRating] = useState<FirstMatchFeedbackRating | null>(null);
  const [note, setNote] = useState("");
  const { pending, error, send } = useSketchSend(onSubmit);

  return (
    <RosterDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onDismiss();
      }}
      width={440}
      title={TWO_STEP_TITLE}
      description={COPY.contract}
      footer={
        <>
          <QuietNotNow onClick={onDismiss} disabled={pending} />
          <span className="flex-1" />
          {rating !== null && (
            <SendButton
              pending={pending}
              disabled={false}
              onClick={() => void send({ rating, note: note.trim() || null })}
            />
          )}
        </>
      }
    >
      <RatingScale
        value={rating}
        onChange={setRating}
        disabled={pending}
        size="lg"
        label={null}
        ariaLabel={TWO_STEP_TITLE}
        caption="word"
      />
      {rating !== null && (
        <div
          key={followUp(rating)}
          className="animate-in duration-200 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
        >
          <NoteField
            label={followUp(rating)}
            value={note}
            onChange={setNote}
            disabled={pending}
            rows={2}
          />
        </div>
      )}
      <DialogProblem message={error} />
    </RosterDialog>
  );
}

// ── D: a strip at the top of the page ───────────────────────────────────────

/**
 * Any dashboard page at its usual measure, reduced to its outline: the strip
 * sits first in the scroll body, above the page title, so the eye reads where
 * it sits rather than what the page says.
 */
function PageFrame({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 flex max-w-[760px] flex-col gap-5">
      {children}
      <h2 className="text-[20px] leading-[1.2] font-light tracking-[-0.3px] text-[var(--ink-900)]">
        {title}
      </h2>
      <div
        aria-hidden
        className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] px-6 py-2"
      >
        {["Date", "Opponent", "Score", "Event"].map((head, i) => (
          <div
            key={head}
            className={cn(
              "flex h-11 items-center gap-6",
              i > 0 && "border-t border-[var(--border-hairline)]",
            )}
          >
            <span className="h-2 w-16 rounded-[2px] bg-[var(--ink-100)]" />
            <span className="h-2 w-40 rounded-[2px] bg-[var(--ink-100)]" />
            <span className="h-2 w-20 rounded-[2px] bg-[var(--ink-100)]" />
          </div>
        ))}
      </div>
    </section>
  );
}

const STRIP_FOLLOW_UP = "Thanks. Anything that would have made it more useful?";

function StripSketch({
  onRate,
  onNote,
  onDismiss,
}: {
  /** Saves the rating the moment it is tapped; the strip stays for the note. */
  onRate: (feedback: FirstMatchFeedback) => Promise<boolean>;
  /** Saves the note against the rating already saved, then the strip goes. */
  onNote: (feedback: FirstMatchFeedback) => Promise<boolean>;
  onDismiss: () => void;
}) {
  const [rated, setRated] = useState<FirstMatchFeedbackRating | null>(null);
  const [note, setNote] = useState("");
  const rate = useSketchSend(onRate);
  const noteSend = useSketchSend(onNote);
  const noteId = useId();
  const pending = rate.pending || noteSend.pending;

  async function tap(rating: FirstMatchFeedbackRating) {
    const saved = await rate.send({ rating, note: null });
    if (saved) setRated(rating);
  }

  return (
    <div
      role="region"
      aria-label="Feedback"
      className="flex flex-col gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-4 py-3"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        {rated === null ? (
          <>
            <p className="text-[13px] leading-[1.5] text-[var(--ink-900)]">
              {TWO_STEP_TITLE}
            </p>
            <div className="flex items-center gap-2.5">
              <span className="text-micro">{COPY.ratingLow}</span>
              <RatingScale
                value={rated}
                onChange={(rating) => void tap(rating)}
                disabled={pending}
                size="sm"
                inline
                label={null}
                ariaLabel={TWO_STEP_TITLE}
                caption="none"
              />
              <span className="text-micro">{COPY.ratingHigh}</span>
            </div>
          </>
        ) : (
          <>
            <label
              htmlFor={noteId}
              className="text-[13px] leading-[1.5] text-[var(--ink-900)]"
            >
              {STRIP_FOLLOW_UP}
            </label>
            <div className="flex min-w-[280px] flex-1 items-center gap-2">
              <input
                id={noteId}
                type="text"
                value={note}
                disabled={pending}
                placeholder={COPY.notePlaceholder}
                onChange={(event) => setNote(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 text-[13px] text-[var(--ink-900)] placeholder:text-[var(--ink-400)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
              />
              <SendButton
                pending={noteSend.pending}
                disabled={note.trim() === ""}
                onClick={() =>
                  void noteSend.send({ rating: rated, note: note.trim() })
                }
              />
            </div>
          </>
        )}
        <span className="flex-1" />
        <CloseX onClick={onDismiss} />
      </div>
      <DialogProblem message={rate.error ?? noteSend.error} />
    </div>
  );
}

// ── E: corner card ──────────────────────────────────────────────────────────

function CornerCardSketch({
  onSubmit,
  onDismiss,
}: {
  onSubmit: (feedback: FirstMatchFeedback) => Promise<boolean>;
  onDismiss: () => void;
}) {
  const titleId = useId();
  return (
    <div
      role="dialog"
      aria-labelledby={titleId}
      className="fixed right-6 bottom-6 z-40 flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-[18px] rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-floating)]"
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
            className="text-[14px] leading-[1.4] font-medium text-[var(--ink-900)]"
          >
            {COPY.title}
          </h2>
          <p className="mt-1 text-[12px] leading-[1.55] text-pretty text-[var(--ink-600)]">
            {COPY.contract}
          </p>
        </div>
        <CloseX onClick={onDismiss} />
      </div>
      <SketchBody layout="column" onSubmit={onSubmit} onDismiss={onDismiss} />
    </div>
  );
}

// ── F: a card at the top of Home ────────────────────────────────────────────

/**
 * Home's main column at its usual measure, with the two cards under the
 * prompt reduced to their outlines so the eye reads where the prompt sits,
 * not what the rest of the page says.
 */
function HomeFrame({ children }: { children: React.ReactNode }) {
  return (
    <section className="mt-8 flex max-w-[760px] flex-col gap-4">
      <h2 className="text-[20px] leading-[1.2] font-light tracking-[-0.3px] text-[var(--ink-900)]">
        Good evening, Lina
      </h2>
      {children}
      {["Matches", "Focus"].map((label) => (
        <div
          key={label}
          aria-hidden
          className="flex h-[132px] items-start rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-[var(--pad-card)]"
        >
          <span className="eyebrow">{label}</span>
        </div>
      ))}
    </section>
  );
}

function HomeCardSketch({
  onSubmit,
  onDismiss,
}: {
  onSubmit: (feedback: FirstMatchFeedback) => Promise<boolean>;
  onDismiss: () => void;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-[18px] rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-[var(--pad-card)] shadow-[var(--shadow-card)]"
    >
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Feedback</span>
          <h3
            id={titleId}
            className="mt-2 text-[14px] leading-[1.4] font-medium text-[var(--ink-900)]"
          >
            {COPY.title}
          </h3>
          <p className="mt-1 text-[12px] leading-[1.55] text-pretty text-[var(--ink-600)]">
            {COPY.contract}
          </p>
        </div>
        <CloseX onClick={onDismiss} />
      </div>
      <SketchBody layout="row" onSubmit={onSubmit} onDismiss={onDismiss} />
    </section>
  );
}
