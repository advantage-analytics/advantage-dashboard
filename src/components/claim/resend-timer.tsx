"use client";

import { useEffect, useState } from "react";

const RESEND_AFTER_SECONDS = 60;

/**
 * The only wait in the flow.
 *
 * No progress bar and no estimate — the link either arrives or it is resent.
 * The counter is mono so the digits do not shift width as they tick, which is
 * the entire reason it is the one number set that way.
 */
export function ResendTimer({ email }: { email: string }) {
  const [left, setLeft] = useState(RESEND_AFTER_SECONDS);

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  if (left > 0) {
    const mins = Math.floor(left / 60);
    const secs = String(left % 60).padStart(2, "0");
    return (
      <p className="text-[12px] text-[var(--ink-500)]">
        Resend in{" "}
        <span className="font-mono text-[var(--ink-700)]">
          {mins}:{secs}
        </span>
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLeft(RESEND_AFTER_SECONDS)}
      className="text-[12px] text-[var(--blue)] underline decoration-[var(--blue)]/30 underline-offset-2 transition-colors hover:decoration-[var(--blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] rounded-sm cursor-pointer"
    >
      Resend the link to {email}
    </button>
  );
}
