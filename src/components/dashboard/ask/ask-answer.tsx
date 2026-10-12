"use client";

import {
  ASK_NO_ADVICE_SENTENCE,
  type AskErrorCode,
  type AskStatusStage,
} from "@/lib/services/ask/events";
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
}

/** An answer carries at most this many figure tiles (design "Answer step"). */
export const ASK_FIGURE_TILES = 3;

/** Who signs a finished answer, in its footer. */
export const ASK_SIGNATURE = "Advantage Intelligence";

/** The real step the route is on — never a percentage, never a guess. */
const STAGE_LABEL: Record<AskStatusStage, string> = {
  planning: "Planning the query",
  querying: "Reading your matches",
  writing: "Writing the answer",
};

/**
 * What the player reads when an answer fails, by the stream's `code`.
 *
 * Fixed here, not taken from the event's own sentence: these four are the
 * product's voice and a test pins them. Every one of them leaves the question
 * back in the composer (`use-ask-stream` restores the draft on any failure).
 */
export const ASK_ERROR_COPY: Record<
  AskErrorCode,
  { title: string; detail: string }
> = {
  cannot_answer: {
    title: "Your match data can't answer that",
    detail:
      "Ask covers what your own matches recorded: results and scores, serve and return numbers, points and shots.",
  },
  no_data: {
    title: "No matches in that scope",
    detail:
      "None of your matches fit the match, opponent or period you asked about, so there was nothing to compute.",
  },
  llm_unavailable: {
    title: "Advantage Intelligence didn't respond",
    detail: "Try again. Your question is kept.",
  },
  answer_failed: {
    title: "The answer couldn't be completed",
    detail: "Ask the question again.",
  },
};

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
export function AskAnswer({ answer }: AskAnswerProps) {
  return (
    <div data-ask-answer="" className="flex min-w-0 flex-col gap-5">
      {answer.status === "error" ? (
        <AnswerError error={answer.error} />
      ) : (
        <AnswerBody answer={answer} />
      )}
    </div>
  );
}

function AnswerError({ error }: { error: AskAnswerState["error"] }) {
  // `code` is a string: a slug this build has no copy for (a newer server's,
  // or a refusal's) falls through to the sentence that came with it.
  const copy =
    error?.code && Object.hasOwn(ASK_ERROR_COPY, error.code)
      ? ASK_ERROR_COPY[error.code as AskErrorCode]
      : null;
  return (
    <div
      role="alert"
      data-ask-error={error?.code ?? "interrupted"}
      className="flex flex-col gap-1"
    >
      <p className="text-title">
        {copy?.title ?? error?.message ?? ASK_ERROR_COPY.answer_failed.title}
      </p>
      {copy && <p className="text-body">{copy.detail}</p>}
    </div>
  );
}

function AnswerBody({ answer }: { answer: AskAnswerState }) {
  const paragraphs = answer.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const figures = answer.figures.slice(0, ASK_FIGURE_TILES);

  return (
    <>
      {answer.headline && (
        <p className="text-title text-balance">{answer.headline}</p>
      )}

      {figures.length > 0 && (
        <ul aria-label="Figures" className="flex flex-wrap gap-x-8 gap-y-2.5">
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

      {answer.visual && <AskVisualBlock visual={answer.visual} />}

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
              {paragraph}
            </p>
          ))}
        </div>
      )}

      {answer.status === "streaming" && (
        <p role="status" className="text-body-sm">
          {answer.stage ? STAGE_LABEL[answer.stage] : "Sending your question"}
        </p>
      )}

      {(answer.sources || answer.status === "done") && (
        <div className="flex flex-col gap-3">
          {answer.sources && <AskSources matches={answer.sources} />}
          {answer.status === "done" && (
            <p data-ask-signature="" className="text-micro max-w-[60ch]">
              {/* `text-micro` is unlayered and would beat a colour utility. */}
              <span style={{ color: "var(--ink-700)" }}>{ASK_SIGNATURE}</span>
              {answer.noAdvice && ` · ${ASK_NO_ADVICE_SENTENCE}`}
            </p>
          )}
        </div>
      )}
    </>
  );
}
