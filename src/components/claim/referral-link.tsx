"use client";

import { useEffect, useRef, useState } from "react";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The one thing a player can actually do about a program that isn't here yet:
 * a link to hand their coach (design 4.3).
 *
 * Shown without its protocol and copied with it — the same split
 * `share-match-button` makes. `app.advantage-analytics.com/claim?ref=northgate`
 * is what a person reads back to check it looks right; `https://…` is what
 * survives being pasted into a mail client that would otherwise not linkify it.
 */
export function ReferralLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The label reverts on a timer, so leaving the screen mid-countdown would
  // otherwise set state on an unmounted component.
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused outright (an insecure origin, a
      // permissions policy). The link is on screen and selectable, so the
      // fallback is the field itself rather than an error the reader cannot
      // act on.
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-[38px] min-w-0 flex-1 items-center rounded-[var(--radius-element)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-3">
        <span className="mono truncate text-[12px] text-[var(--ink-700)]">
          {url.replace(/^https?:\/\//, "")}
        </span>
      </div>
      <button
        type="button"
        onClick={copy}
        className={advButton("outline", "sm")}
        // The label changes under the pointer, so the accessible name has to
        // change with it rather than announcing "Copy link" after the copy.
        aria-live="polite"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
