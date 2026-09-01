"use client";

import { useCallback, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * The Statistics tab's Advantage Intelligence strip (artboard 46a).
 *
 * It replaces `AiInsightCard` on this page and deliberately inherits that
 * card's dismissal state rather than starting fresh: `page.tsx` passed
 * `advantage-ai-insight-dismissed:${matchId}` as the card's `storageKey`, and
 * the card stored the string `"true"` when dismissed. Both the key and the
 * sentinel are reproduced here, so a player who dismissed the old card never
 * sees the strip reappear — and a dismissal made here would equally hide the
 * old card if it were ever mounted again.
 *
 * The artboard pairs a claim sentence with a synthesized evidence sentence and
 * a "from N analyzed matches" provenance count. Neither exists in this app's
 * data: a match carries exactly one `insights.{player1|player2}.summary`
 * string and no corpus count, so the strip renders the summary alone. Writing
 * a second sentence or a match count would be fabrication dressed as
 * provenance.
 */

const EASE_PRIMARY = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * The dismissal key, shared with `AiInsightCard` — see the note above. Exported
 * so the pairing is greppable from either side.
 */
export function insightDismissedStorageKey(matchId: string): string {
  return `advantage-ai-insight-dismissed:${matchId}`;
}

/* localStorage is an external store, so the strip subscribes to it rather than
   mirroring it into state from an effect: the flag can also change in another
   tab, and a render-time read keeps the dismissed strip from flashing in and
   back out. `getServerSnapshot` says "dismissed" so the server markup and the
   hydration render agree; React re-reads the real value straight after. */

const listeners = new Set<() => void>();

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function notifyDismissalChanged(): void {
  for (const listener of listeners) listener();
}

interface InsightStripProps {
  /**
   * The viewer's own insight summary, already picked by side in `page.tsx`
   * (guardrails §4 — the strip never chooses a player itself). Null when this
   * match has no insight, in which case nothing renders.
   */
  summary: string | null;
  matchId: string;
}

export function InsightStrip({ summary, matchId }: InsightStripProps) {
  const storageKey = insightDismissedStorageKey(matchId);
  const shouldReduceMotion = useReducedMotion();

  const dismissed = useSyncExternalStore(
    subscribe,
    useCallback(
      () => localStorage.getItem(storageKey) === "true",
      [storageKey],
    ),
    () => true,
  );

  const dismiss = useCallback(() => {
    localStorage.setItem(storageKey, "true");
    notifyDismissalChanged();
  }, [storageKey]);

  if (!summary) return null;

  return (
    <AnimatePresence initial={false}>
      {!dismissed && (
        <motion.div
          key="insight-strip"
          initial={false}
          exit={{ opacity: 0, y: shouldReduceMotion ? 0 : -6 }}
          transition={{
            duration: shouldReduceMotion ? 0.15 : 0.24,
            ease: EASE_PRIMARY,
          }}
          className="relative flex items-start gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-4 py-3.5"
        >
          <span
            aria-hidden="true"
            className="mt-px flex h-5 w-5 flex-[0_0_20px] items-center justify-center rounded-[var(--radius-button)] bg-[var(--ink-900)]"
          >
            {/* Same mark, size and inversion the home Focus card's chip uses
                (home/focus-card.tsx) — the artboard's `logo-mark.svg` has no
                counterpart in this repo, and logo3 is what stands for the
                Advantage mark everywhere else. */}
            <Image
              src="/logos/logo3.svg"
              alt=""
              width={12}
              height={8}
              className="brightness-0 invert"
              aria-hidden="true"
            />
          </span>

          <div className="flex flex-col gap-[5px] pr-7">
            <p className="max-w-[56ch] text-[13px] font-medium leading-[1.45] text-[var(--ink-900)] [text-wrap:pretty]">
              {summary}
            </p>
            <div className="flex items-center gap-4 pt-px">
              <Link
                href="/dashboard/ask"
                className="text-[11px] font-medium text-[var(--blue)]"
              >
                Open the full analysis
              </Link>
              <span className="text-micro">Advantage Intelligence</span>
            </div>
          </div>

          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss insight"
            className="absolute right-2.5 top-2.5 flex h-[22px] w-[22px] cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-[var(--ink-100)]"
          >
            <X
              className="h-3 w-3 text-[var(--ink-400)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
