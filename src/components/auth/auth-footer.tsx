import type { ReactNode } from "react";

/**
 * The auth link treatment, stated once.
 *
 * Follows the precedent in components/claim/claim-shell.tsx, which exports
 * CLAIM_LINK for the same reason: this string was previously copy-pasted into
 * every auth page, so a change to the blue would have been a six-file grep.
 */
export const AUTH_LINK =
  "text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]";

/**
 * The way out of every auth page: centered links sitting 24px below the primary
 * action (the 16px stack gap plus this 8px), per the set spec. One
 * `text-body-sm` line for the primary escape and an optional `text-micro` line
 * for the edge case — identical on all four pages so the set ends the same way
 * regardless of which page you landed on.
 *
 * No rule above it. The footer used to be fenced off by a hairline, but the
 * page already ends there: whitespace separates it from the action without
 * drawing a line across a form that has no other horizontal rules in it.
 */
export default function AuthFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-[6px] pt-[8px] text-center">
      {children}
    </div>
  );
}
