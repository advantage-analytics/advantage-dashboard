"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The share-panel primitives: the pieces a 320px "who can open / join this"
 * popover is built from. Moved verbatim out of `share-match-button.tsx`
 * (the match Share popover) so the team join-link popover
 * (`settings/teams/join-link-popover.tsx`) draws the same ladder, link pill
 * and buttons instead of a fork of them.
 */

/**
 * The panel's one button shape: 32px, bordered, card surface, 12/500 — Copy,
 * Email and More options all wear it, so the only thing that separates them
 * is where they sit. Copy's label is darker: it is the lead action.
 */
export const SECONDARY_BUTTON = cn(
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-button)] px-2.5 text-[12px] font-medium",
  "border border-[var(--border-medium)] bg-[var(--surface-card)] text-[var(--ink-700)]",
  "hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] active:bg-[var(--ink-200)]",
  "transition-[background-color,transform,color] duration-150 ease-out active:scale-[0.97] motion-reduce:active:scale-100",
);

/**
 * Arrow keys walk focus between the rungs — and only focus. A native radio
 * group selects on arrow, and here selecting "Anyone with the link" mints a
 * public link on the spot, so a keystroke meant to reach Copy would publish
 * the match. Choosing takes a click, Enter or Space (the button's own
 * activation); arrows are navigation. The chosen rung holds the group's one
 * tab stop (roving tabindex).
 */
export function moveFocusBetweenRungs(event: React.KeyboardEvent<HTMLElement>) {
  const step =
    event.key === "ArrowDown" || event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : 0;
  if (step === 0) return;
  const rungs = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'),
  );
  const at = rungs.indexOf(document.activeElement as HTMLElement);
  if (at === -1) return;
  event.preventDefault();
  rungs[(at + step + rungs.length) % rungs.length]?.focus();
}

/**
 * One rung of the access ladder: a `role="radio"` button drawn as the DS
 * check-dot — 14px, a hairline ring at rest, solid Signal Blue with a white
 * check when chosen. The chosen row takes no fill of its own; the dot is the
 * one colour that says "chosen". A button, not a native radio, so that
 * arrowing past it cannot choose it (`moveFocusBetweenRungs`); the system's
 * focus ring draws on the row itself.
 */
export function AccessOption({
  label,
  description,
  trailing,
  chosen,
  locked,
  onChoose,
}: {
  label: string;
  description: string;
  trailing?: React.ReactNode;
  chosen: boolean;
  locked: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-disabled={locked || undefined}
      tabIndex={chosen ? 0 : -1}
      onClick={onChoose}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-[var(--radius-element)] px-2.5 py-2 text-left",
        locked
          ? "cursor-default"
          : "cursor-pointer transition-colors duration-100 hover:bg-[var(--surface-subtle)]",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
          chosen
            ? "border-[var(--blue)] bg-[var(--blue)]"
            : locked
              ? "border-[var(--ink-200)]"
              : "border-[var(--ink-300)]",
          chosen && locked && "opacity-50",
        )}
      >
        {chosen && (
          <Check className="size-[9px] text-white" strokeWidth={2.5} />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span
          className={cn(
            "text-[13px] leading-[18px]",
            locked && !chosen
              ? "text-[var(--ink-500)]"
              : "text-[var(--ink-900)]",
          )}
        >
          {label}
        </span>
        <span className="text-micro leading-[15px] text-[var(--ink-500)]">
          {description}
        </span>
      </span>
      {trailing}
    </button>
  );
}

/** The link to hand out, in a grey pill, with Copy beside it. */
export function UrlRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // silent failure
    }
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 min-w-0 flex-1 items-center rounded-[var(--radius-button)] border border-[var(--border-medium)] bg-[var(--surface-subtle)] px-2.5">
        <span className="truncate text-[12px] leading-none text-[var(--ink-600)]">
          {formatDisplayUrl(url)}
        </span>
      </div>
      <button
        type="button"
        onClick={copyToClipboard}
        aria-live="polite"
        className={cn(
          SECONDARY_BUTTON,
          "w-[76px] shrink-0 gap-1 text-[var(--ink-900)]",
        )}
      >
        {copied ? (
          <>
            <Check className="size-3.5" strokeWidth={2} aria-hidden="true" />
            Copied
          </>
        ) : (
          <>
            <Copy className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
            Copy
          </>
        )}
      </button>
    </div>
  );
}

function formatDisplayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
