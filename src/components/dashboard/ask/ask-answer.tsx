"use client";

import type { AskStatusStage } from "@/lib/services/ask/events";
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

/** The real step the route is on — never a percentage, never a guess. */
const STAGE_LABEL: Record<AskStatusStage, string> = {
  planning: "Planning the query",
  querying: "Reading your matches",
  writing: "Writing the answer",
};

/**
 * PLACEHOLDER — the page shell's stand-in until the answer task replaces this
 * body. The answer's own text in reading order and nothing more: no engine
 * mark, no figure tiles, no source rows, no per-code error copy.
 *
 * Keep this file's imports clear of `next/navigation`: the real answer is
 * rendered by an offline component harness.
 */
export function AskAnswer({ answer }: AskAnswerProps) {
  const paragraphs = answer.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const sourceCount = answer.sources?.length ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {answer.status === "streaming" && (
        <p role="status" className="text-body-sm">
          {answer.stage ? STAGE_LABEL[answer.stage] : "Sending your question"}
        </p>
      )}

      {answer.headline && <p className="text-data">{answer.headline}</p>}

      {answer.figures.length > 0 && (
        <dl className="flex flex-col gap-1">
          {answer.figures.map((figure) => (
            <div
              key={`${figure.label}:${figure.value}`}
              className="text-body flex gap-2"
            >
              <dt>{figure.label}</dt>
              <dd className="text-[var(--ink-900)] tabular-nums">
                {figure.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {paragraphs.map((paragraph, index) => (
        <p key={index} className="text-body" style={{ lineHeight: 1.65 }}>
          {paragraph}
        </p>
      ))}

      {sourceCount > 0 && (
        <p className="text-micro">
          Computed from {sourceCount} {sourceCount === 1 ? "match" : "matches"}
        </p>
      )}

      {answer.error && (
        <p role="alert" className="text-body">
          {answer.error.message}
        </p>
      )}
    </div>
  );
}
