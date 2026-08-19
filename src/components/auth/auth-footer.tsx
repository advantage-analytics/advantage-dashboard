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
 * The way out of every auth page: a hairline, then centered links at a 16px
 * offset. One `text-body-sm` line for the primary escape and an optional
 * `text-micro` line for the edge case — identical on all four pages so the set
 * ends the same way regardless of which page you landed on.
 */
export default function AuthFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-[6px] border-t border-[var(--border-hairline)] pt-[16px] text-center">
      {children}
    </div>
  );
}
