import { ASK_TAG_ICON, askTagKey } from "./ask-tag-menu";
import type { AskTag } from "./use-ask-stream";

/**
 * The player's own words, set against the right edge of the thread.
 *
 * A neutral wash, never blue: blue is for actions, and this is something
 * already said. Capped at 80% of the column so a long prompt still reads as
 * theirs and an answer never has to share its left edge with one. What the
 * question was tagged with sits under it as small labels — said once here
 * and once as chips in the composer while it is being written, and nowhere
 * else.
 *
 * The heading is for a screen reader: sighted, the side of the column says
 * who is speaking.
 */
export function AskPrompt({ text, tags }: { text: string; tags: AskTag[] }) {
  return (
    <div data-ask-prompt="" className="flex flex-col items-end gap-1.5">
      <h2 className="sr-only">You asked</h2>
      <p className="max-w-[80%] rounded-[var(--radius-card)] rounded-br-[var(--radius-cell)] bg-[var(--surface-subtle)] px-3.5 py-2.5 text-[13px] leading-[1.55] break-words whitespace-pre-wrap text-[var(--ink-900)]">
        {text}
      </p>
      {tags.length > 0 && (
        <ul aria-label="Tagged" className="flex flex-wrap justify-end gap-1.5">
          {tags.map((tag) => {
            const Icon = ASK_TAG_ICON[tag.kind];
            return (
              <li
                key={askTagKey(tag)}
                className="flex h-[22px] items-center gap-1.5 px-1 text-[11px] text-[var(--ink-600)]"
              >
                <Icon
                  aria-hidden="true"
                  className="size-3 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                />
                {tag.label}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
