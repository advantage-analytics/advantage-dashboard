"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { AskErrorCode } from "@/lib/services/ask/events";
import type { AskFeedback } from "@/lib/services/ask/feedback";
import { figureVideoHref } from "@/lib/services/ask/figure-video";
import { advButton } from "@/lib/ui/adv-button";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { PERSONAL_ASK_COPY, askCopy, type AskCopy } from "./ask-copy";
import { sentences } from "./ask-sentences";
import { AskFeedbackControl } from "./ask-feedback";
import { AskSources } from "./ask-sources";
import { AskShowMe } from "./ask-show";
import type { AskAnswerState, AskFigure } from "./use-ask-stream";
import { AskVisualBlock } from "./visuals/ask-visual";

export interface AskAnswerProps {
  /**
   * One answer: arriving (`status: "streaming"`, `stage` naming the step),
   * saved (`"done"`), or failed (`"error"`, with `error.code` and
   * `error.message`). A saved answer reopened from an earlier visit arrives
   * as `"done"` with whichever fields the saved row carried.
   */
  answer: AskAnswerState;
  /**
   * Whose matches the answer is about: the status line, the failure copy and
   * the footer's notice say "your matches" on the personal page and "the
   * program's" on the team one. The personal page when omitted.
   */
  scope?: AskScope;
  /**
   * When the answer is a clarifying question (`needs_clarification`), what
   * picking one of its choices does — the page re-asks with it attached.
   * Omitted for an exchange whose choices can no longer be picked.
   */
  onChoose?: (option: string) => void;
  /**
   * Saves the asker's thumb on this answer. Omitted (and the thumbs not
   * drawn) when the answer has no saved id to point at.
   */
  onRate?: (feedback: AskFeedback | null) => Promise<boolean>;
}

/** An answer carries at most this many figure tiles (design "Answer step"). */
export const ASK_FIGURE_TILES = 3;

/** Who signs a finished answer, in its footer. */
export const ASK_SIGNATURE = "Advantage Intelligence";

/** The disclosure that holds the prose when the block leads the answer. */
export const ASK_PROSE_DISCLOSURE = "The numbers in full";

/**
 * What the player reads when an answer fails, by the stream's `code` — the
 * personal page's wording; the team's is `askCopy(scope).errors`.
 *
 * Fixed in `ask-copy.ts`, not taken from the event's own sentence: these are
 * the product's voice and a test pins them. Every one of them leaves the
 * question back in the composer (`use-ask-stream` restores the draft on any
 * failure).
 */
export const ASK_ERROR_COPY = PERSONAL_ASK_COPY.errors;

/**
 * One answer from Advantage Intelligence, flush with the column's left edge:
 * the claim, up to three figures, the visual block when the answer carries
 * one, the evidence, the matches it was computed from, and a one-line footer
 * that signs it.
 *
 * ── No byline ───────────────────────────────────────────────────────────────
 * Nothing sits above the claim and there is no mark gutter. Prompts are on
 * the right, so the left of the column already says "this is the answer"; the
 * engine's name is the footer's, in micro type, under the sources.
 *
 * ── The footer ──────────────────────────────────────────────────────────────
 * The signature, and — when the question asked what to do — the sentence that
 * says Ask does not recommend (`noAdvice`). It signs a finished answer only:
 * one still arriving has its status line, and a failed one has nothing to
 * sign.
 *
 * ── In flight ───────────────────────────────────────────────────────────────
 * A `role="status"` line names the step the route says it is on. Text only —
 * no bar, no percentage, no spinner: the route knows which step it is in and
 * nothing about how long that step has left. The visual block appears when
 * its event arrives; there is no placeholder for a block that may never come.
 *
 * ── Failed ──────────────────────────────────────────────────────────────────
 * The fixed copy for the stream's `code` and nothing else. Whatever had
 * arrived before the failure is dropped, figures and block first: a number
 * from an answer that never finished is one nobody stands behind. A failure
 * with no code is an interruption, and shows the sentence the stream reader
 * wrote for it.
 *
 * ── Colour ──────────────────────────────────────────────────────────────────
 * Ink throughout the claim, figures and prose. Green and red belong to the
 * outcome marks in the source rows and the form strip; a figure is not good
 * or bad, and a failed answer is not a loss. The visual block's blue and
 * slate are roles (`visuals/ask-visual.tsx`).
 *
 * ── Watchable figures ───────────────────────────────────────────────────────
 * Over a scope of one match, a figure whose measure maps to a Video-tab
 * filter (`figure-video.ts`) is a link to that match's film on exactly
 * those points, with a quiet "Watch" after its label — the sources' own
 * affordance. The figure's `column` says which measure; a figure without
 * one (saved before it existed, or cited from words around a cell) is a
 * tile and nothing more. The block's own rows, zones and branches link the
 * same way (`visuals/ask-visual.tsx`), so the sources go to it too.
 *
 * ── Visual first ────────────────────────────────────────────────────────────
 * When the question asked for a chart (`visualLead`, from the `visual`
 * event's `lead`), the block follows the claim and the figures follow it;
 * the prose folds behind a native disclosure (design sheet "4 · Visual
 * first", `src/app/design/ask/answers`), closed until opened, as the
 * design has it. The status line, the sources and the footer stay where
 * they are.
 *
 * Every figure, in the tiles and in the prose, sits in tabular numerals, so
 * a column of them lines up and a sentence's figure does not shift its
 * neighbours as it streams in.
 *
 * Keep this file's imports clear of `next/navigation` and `next/image`: it is
 * rendered by an offline component harness (`tests/ask-answer-view.spec.ts`).
 */
export function AskAnswer({
  answer,
  scope = PERSONAL_ASK_SCOPE,
  onChoose,
  onRate,
}: AskAnswerProps) {
  const copy = askCopy(scope);
  // An answer that mounted mid-stream is arriving now, and its parts move as
  // they land (`globals.css`, "Ask: an answer arriving"). One reopened from
  // the rail mounts already `done` and is simply there. Decided once: the
  // motion must not replay when the stream ends or the page re-renders.
  const [live] = useState(answer.status === "streaming");
  return (
    <div
      data-ask-answer=""
      data-ask-live={live ? "" : undefined}
      className="flex min-w-0 flex-col gap-5"
    >
      {answer.status === "error" &&
      answer.error?.code === "needs_clarification" ? (
        <AnswerQuestion error={answer.error} copy={copy} onChoose={onChoose} />
      ) : answer.status === "error" ? (
        <AnswerError error={answer.error} copy={copy} />
      ) : (
        <AnswerBody answer={answer} copy={copy} onRate={onRate} />
      )}
    </div>
  );
}

/**
 * Ask asking which was meant: the question in the claim's place, the choices
 * as quiet buttons under it, and a line saying a reply is free. Not an alert —
 * nothing failed. Picking a choice re-asks the question with it attached;
 * typing an answer in the composer works too, since the question is kept.
 */
function AnswerQuestion({
  error,
  copy: { errors },
  onChoose,
}: {
  error: NonNullable<AskAnswerState["error"]>;
  copy: AskCopy;
  onChoose?: (option: string) => void;
}) {
  const fallback = errors.needs_clarification;
  return (
    <div data-ask-clarify="" className="flex flex-col gap-3">
      <p className="text-title">{error.message || fallback.title}</p>
      {onChoose && error.options && error.options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {error.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChoose(option)}
              className={`${advButton("outline", "sm")} cursor-pointer`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
      <p className="text-body-sm text-[var(--ink-500)]">{fallback.detail}</p>
    </div>
  );
}

function AnswerError({
  error,
  copy: { errors },
}: {
  error: AskAnswerState["error"];
  copy: AskCopy;
}) {
  // `code` is a string: a slug this build has no copy for (a newer server's,
  // or a refusal's) falls through to the sentence that came with it.
  const copy =
    error?.code && Object.hasOwn(errors, error.code)
      ? errors[error.code as AskErrorCode]
      : null;
  return (
    <div
      role="alert"
      data-ask-error={error?.code ?? "interrupted"}
      className="flex flex-col gap-1"
    >
      <p className="text-title">
        {copy?.title ?? error?.message ?? errors.answer_failed.title}
      </p>
      {copy && <p className="text-body">{copy.detail}</p>}
    </div>
  );
}

function AnswerBody({
  answer,
  copy,
  onRate,
}: {
  answer: AskAnswerState;
  copy: AskCopy;
  onRate?: AskAnswerProps["onRate"];
}) {
  const paragraphs = answer.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const figures = answer.figures.slice(0, ASK_FIGURE_TILES);
  // The block leads when the question asked for a chart: it comes right
  // after the claim, and the prose folds away.
  const lead = answer.visual !== null && answer.visualLead === true;

  const block = answer.visual && (
    <div data-ask-part="" style={part(lead ? 1 : 2)}>
      <AskVisualBlock
        visual={answer.visual}
        sources={answer.sources}
        trendAverageLabel={copy.trendAverage}
      />
    </div>
  );

  const prose = paragraphs.length > 0 && (
    <div className="flex flex-col gap-3">
      {paragraphs.map((paragraph, index) => (
        // `text-body` is unlayered and would beat a `leading-*` utility,
        // so the reading line height is set inline.
        <p
          key={index}
          className="text-body max-w-[66ch] text-pretty tabular-nums"
          style={{ lineHeight: 1.65 }}
        >
          {/* A sentence at a time, as the stream sends them: one that has
              been read keeps its key and stays put; a new one fades in. */}
          {sentences(paragraph).map((sentence, at) => (
            <span key={at} data-ask-sentence="">
              {sentence}
            </span>
          ))}
        </p>
      ))}
    </div>
  );

  return (
    <>
      {answer.headline && (
        <p data-ask-part="" style={part(0)} className="text-title text-balance">
          {answer.headline}
        </p>
      )}

      {lead && block}

      {figures.length > 0 && (
        <ul
          aria-label="Figures"
          data-ask-part=""
          style={part(lead ? 2 : 1)}
          className="flex flex-wrap gap-x-8 gap-y-2.5"
        >
          {figures.map((figure, index) => {
            const watch = figureVideoHref(figureColumn(figure), answer.sources);
            // Value over label, in the markup as on screen.
            const tile = (
              <>
                <div
                  data-ask-figure-value=""
                  className="text-scoreboard tabular-nums"
                >
                  {figure.value}
                </div>
                <div data-ask-figure-label="" className="text-micro">
                  {figure.label}
                  {watch && (
                    <span
                      data-ask-figure-watch=""
                      className="text-[var(--blue)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--blue-hover)]"
                    >
                      {" "}
                      · Watch
                    </span>
                  )}
                </div>
              </>
            );
            return (
              <li
                key={index}
                data-ask-figure=""
                className="flex flex-col gap-0.5"
              >
                {watch ? (
                  <Link
                    href={watch}
                    className="group flex flex-col gap-0.5 rounded-[var(--radius-element)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                  >
                    {tile}
                  </Link>
                ) : (
                  tile
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!lead && block}

      {lead && prose ? <ProseDisclosure>{prose}</ProseDisclosure> : prose}

      {answer.status === "streaming" && (
        <p
          role="status"
          key={answer.stage ?? "sending"}
          data-ask-stage=""
          className="text-body-sm"
        >
          {answer.stage ? copy.stage[answer.stage] : "Sending your question"}
        </p>
      )}

      {(answer.sources || answer.status === "done") && (
        <div data-ask-part="" style={part(3)} className="flex flex-col gap-3">
          {answer.sources && <AskSources matches={answer.sources} />}
          {answer.status === "done" && answer.answerId && (
            <AskShowMe answerId={answer.answerId} sources={answer.sources} />
          )}
          {answer.status === "done" && (
            <p data-ask-signature="" className="text-micro max-w-[60ch]">
              {/* `text-micro` is unlayered and would beat a colour utility. */}
              <span style={{ color: "var(--ink-700)" }}>{ASK_SIGNATURE}</span>
              {answer.noAdvice && ` · ${copy.noAdvice}`}
              {answer.coach && ` · ${copy.coach}`}
            </p>
          )}
          {answer.status === "done" && onRate && (
            <AskFeedbackControl feedback={answer.feedback} onRate={onRate} />
          )}
        </div>
      )}
    </>
  );
}

/** A part's place in the order the answer is read, for parts that land together. */
function part(index: number): CSSProperties {
  return { "--ask-i": index } as CSSProperties;
}

/**
 * The prose behind a native `<details>` when the block leads: the summary
 * is the design sheet's own — a quiet blue line with a chevron that turns
 * when open — and the browser's marker is hidden in favour of it. Closed
 * by default, as the design has it; a reader who wants the sentences opens
 * them, and they are in the page for a screen reader either way.
 */
function ProseDisclosure({ children }: { children: ReactNode }) {
  return (
    <details data-ask-prose="" className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-[var(--radius-button)] text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] [&::-webkit-details-marker]:hidden">
        <ChevronRight
          aria-hidden="true"
          className="size-3 transition-transform duration-[var(--duration-hover)] group-open:rotate-90"
          strokeWidth={1.5}
        />
        {ASK_PROSE_DISCLOSURE}
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  );
}

/**
 * The result column a figure was cited from, when the stream or the saved
 * answer carried it. Read through a widened type: `AskFigure` is the
 * stream reader's, and a reader that has not learnt the field yet simply
 * hands over none.
 */
function figureColumn(figure: AskFigure): string | undefined {
  const column = (figure as AskFigure & { column?: unknown }).column;
  return typeof column === "string" && column !== "" ? column : undefined;
}
