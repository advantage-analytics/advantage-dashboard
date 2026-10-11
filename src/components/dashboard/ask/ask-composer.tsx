"use client";

import type { AskTagOptions } from "@/lib/data/ask-tags";
import { advButton } from "@/lib/ui/adv-button";
import type { AskQuestion } from "./use-ask-stream";

/**
 * How many questions are spent, as the composer and the rail are handed it.
 * `resetsOn` (`YYYY-MM-DD`) is null when only a stream's `done` has reported
 * the count and the page's own read of the quota failed.
 */
export interface AskQuotaView {
  used: number;
  cap: number;
  resetsOn: string | null;
}

export interface AskComposerProps {
  /** The draft, held by the thread so a failed question can come back. */
  value: AskQuestion;
  onChange: (value: AskQuestion) => void;
  /** Send `value`. The shell ignores it while empty or while `pending`. */
  onSubmit: () => void;
  /** What `@` can tag: the viewer's personal matches and their opponents. */
  tagOptions: AskTagOptions;
  /** Null when the count could not be read; the route still decides. */
  quota: AskQuotaView | null;
  /** An answer is in flight. */
  pending: boolean;
}

/**
 * PLACEHOLDER — the page shell's stand-in until the composer task replaces
 * this body. A labelled textarea and a send button, enough to ask a question
 * end to end; no `@` menu, no tag chips, no count, no engine label.
 * `tagOptions` and `quota` are accepted and unused so the shell does not need
 * rewiring when they are.
 *
 * Keep this file's imports clear of `next/navigation`: the real composer is
 * rendered by an offline component harness.
 */
export function AskComposer({
  value,
  onChange,
  onSubmit,
  pending,
}: AskComposerProps) {
  const empty = value.text.trim() === "";

  return (
    <form
      className="flex items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-[11px] text-[var(--ink-600)]">Your question</span>
        <textarea
          value={value.text}
          onChange={(event) => onChange({ ...value, text: event.target.value })}
          rows={2}
          className="w-full resize-none rounded-[var(--radius-button)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 py-2 text-[13px] text-[var(--ink-900)] outline-none focus-visible:shadow-[var(--focus-ring)]"
        />
      </label>
      <button
        type="submit"
        disabled={empty || pending}
        className={advButton("primary")}
      >
        Send
      </button>
    </form>
  );
}
