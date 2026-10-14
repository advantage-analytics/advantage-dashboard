"use client";

import { useState, type CSSProperties } from "react";
import type { AskErrorCode } from "@/lib/services/ask/events";
import { advButton } from "@/lib/ui/adv-button";
import { PERSONAL_ASK_SCOPE, type AskScope } from "@/lib/services/ask/scope";
import { PERSONAL_ASK_COPY, askCopy, type AskCopy } from "./ask-copy";
import { sentences } from "./ask-sentences";
import { AskSources } from "./ask-sources";
import type { AskAnswerState } from "./use-ask-stream";
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
}

/** An answer carries at most this many figure tiles (design "Answer step"). */
export const ASK_FIGURE_TILES = 3;

/** Who signs a finished answer, in its footer. */
export const ASK_SIGNATURE = "Advantage Intelligence";

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
 * Keep this file's imports clear of `next/navigation` and `next/image`: it is
 * rendered by an offline component harness (`tests/ask-answer-view.spec.ts`).
 */
export function AskAnswer({
  answer,
  scope = PERSONAL_ASK_SCOPE,
  onChoose,
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
        <AnswerBody answer={answer} copy={copy} />
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
}: {
  answer: AskAnswerState;
  copy: AskCopy;
}) {
  const paragraphs = answer.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const figures = answer.figures.slice(0, ASK_FIGURE_TILES);

  return (
    <>
      {answer.headline && (
        <p data-ask-part="" style={part(0)} className="text-title text-balance">
          {answer.headline}
        </p>
      )}

      {figures.length > 0 && (
        <ul
          aria-label="Figures"
          data-ask-part=""
          style={part(1)}
          className="flex flex-wrap gap-x-8 gap-y-2.5"
        >
          {figures.map((figure, index) => (
            // Value over label, in the markup as on screen.
            <li
              key={index}
              data-ask-figure=""
              className="flex flex-col gap-0.5"
            >
              <div data-ask-figure-value="" className="text-scoreboard">
                {figure.value}
              </div>
              <div data-ask-figure-label="" className="text-micro">
                {figure.label}
              </div>
            </li>
          ))}
        </ul>
      )}

      {answer.visual && (
        <div data-ask-part="" style={part(2)}>
          <AskVisualBlock
            visual={answer.visual}
            trendAverageLabel={copy.trendAverage}
          />
        </div>
      )}

      {paragraphs.length > 0 && (
        <div className="flex flex-col gap-3">
          {paragraphs.map((paragraph, index) => (
            // `text-body` is unlayered and would beat a `leading-*` utility,
            // so the reading line height is set inline.
            <p
              key={index}
              className="text-body max-w-[66ch] text-pretty"
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
      )}

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
          {answer.status === "done" && (
            <p data-ask-signature="" className="text-micro max-w-[60ch]">
              {/* `text-micro` is unlayered and would beat a colour utility. */}
              <span style={{ color: "var(--ink-700)" }}>{ASK_SIGNATURE}</span>
              {answer.noAdvice && ` · ${copy.noAdvice}`}
            </p>
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
