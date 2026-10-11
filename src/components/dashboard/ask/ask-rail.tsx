"use client";

import type { AskConversationSummary } from "@/lib/data/ask-server";
import type { AskQuotaView } from "./ask-composer";
import type { AskTag } from "./use-ask-stream";

export interface AskRailProps {
  /**
   * "Tagged in this question": the draft's tags while there are any,
   * otherwise the last question's. Empty when neither has one.
   */
  tags: AskTag[];
  /** Null when the count could not be read — never a made-up `0 / 20`. */
  quota: AskQuotaView | null;
  /** "Earlier questions", most recently used first. */
  conversations: AskConversationSummary[];
  /** The conversation that is open, so its row can say so. */
  activeConversationId: string | null;
}

/**
 * PLACEHOLDER — the page shell's stand-in until the rail task replaces this
 * body. The three sections as bare text: no meter, no dates, no row actions.
 * Plain `<a href>` on purpose — the real rail is rendered by an offline
 * component harness, so keep this file's imports clear of `next/navigation`.
 *
 * The page shell owns the `<aside>`, its 340px width and its hairline; this
 * renders only what goes inside.
 */
export function AskRail({
  tags,
  quota,
  conversations,
  activeConversationId,
}: AskRailProps) {
  return (
    <>
      {tags.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow-sm">Tagged in this question</h2>
          <ul className="flex flex-col gap-1">
            {tags.map((tag) => (
              <li key={`${tag.kind}:${tag.id}`} className="text-body-sm">
                {tag.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {quota && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow-sm">Questions this month</h2>
          <p className="text-body-sm tabular-nums">
            {quota.used} / {quota.cap}
          </p>
        </section>
      )}

      {conversations.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow-sm">Earlier questions</h2>
          <ul className="flex flex-col gap-1">
            {conversations.map((conversation) => (
              <li key={conversation.id} className="min-w-0">
                <a
                  href={`/dashboard/ask?c=${conversation.id}`}
                  aria-current={
                    conversation.id === activeConversationId
                      ? "page"
                      : undefined
                  }
                  className="text-body-sm block truncate rounded-sm outline-none focus-visible:shadow-[var(--focus-ring)]"
                >
                  {conversation.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
