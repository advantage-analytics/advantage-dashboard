"use client";

import type { AskErrorCode, AskStatusStage } from "@/lib/services/ask/events";
import { AskEngineMark } from "./ask-engine-mark";
import { AskSources } from "./ask-sources";
import type { AskAnswerState } from "./use-ask-stream";

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
 * One answer from Advantage Intelligence: the engine's mark and name, then the
 * claim, up to three figures, the evidence, and the matches it was computed
 * from.
 *
 * ── In flight ───────────────────────────────────────────────────────────────
 * A `role="status"` line names the step the route says it is on. Text only —
 * no bar, no percentage, no spinner: the route knows which step it is in and
 * nothing about how long that step has left.
 *
 * ── Failed ──────────────────────────────────────────────────────────────────
 * The fixed copy for the stream's `code` and nothing else. Whatever had
 * arrived before the failure is dropped, figures first: a tile from an answer
 * that never finished is a number nobody stands behind. A failure with no
 * code is an interruption, and shows the sentence the stream reader wrote for
 * it.
 *
 * ── Colour ──────────────────────────────────────────────────────────────────
 * Ink throughout. Green and red belong to the outcome marks in the source
 * rows; a figure is not good or bad, and a failed answer is not a loss.
 *
 * Keep this file's imports clear of `next/navigation` and `next/image`: it is
 * rendered by an offline component harness (`tests/ask-answer-view.spec.ts`).
 */
export function AskAnswer({ answer }: AskAnswerProps) {
  return (
    <div className="flex gap-2.5">
      <div className="flex w-[26px] shrink-0 justify-center pt-1">
        <AskEngineMark />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <span className="pt-[3px] text-[12px] text-[var(--ink-700)]">
          Advantage Intelligence
        </span>
        {answer.status === "error" ? (
          <AnswerError error={answer.error} />
        ) : (
          <AnswerBody answer={answer} />
        )}
      </div>
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

      {paragraphs.map((paragraph, index) => (
        // `text-body` is unlayered and would beat a `leading-*` utility, so
        // the reading line height is set inline.
        <p
          key={index}
          className="text-body text-pretty"
          style={{ lineHeight: 1.65 }}
        >
          {paragraph}
        </p>
      ))}

      {answer.status === "streaming" && (
        <p role="status" className="text-body-sm">
          {answer.stage ? STAGE_LABEL[answer.stage] : "Sending your question"}
        </p>
      )}

      {answer.sources && <AskSources matches={answer.sources} />}
    </>
  );
}
