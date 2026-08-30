"use client";

import { useEffect, useState, useTransition } from "react";
import { resendClaim } from "@/lib/services/programs/claim-actions";

const RESEND_AFTER_SECONDS = 60;

/**
 * The only wait in the flow.
 *
 * No progress bar and no estimate — the link either arrives or it is resent.
 * The counter is mono so the digits do not shift width as they tick, which is
 * the entire reason it is the one number set that way.
 */
export function ResendTimer({
  email,
  programKey,
}: {
  email: string;
  programKey: string;
}) {
  const [left, setLeft] = useState(RESEND_AFTER_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (left <= 0) return;
    const id = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [left]);

  function onResend() {
    setError(null);
    startTransition(async () => {
      const result = await resendClaim({ programKey, email });
      if (!result.ok) {
        // Leave the countdown at zero — a failed send should not cost the
        // claimant another 60-second wait before they can try again.
        setError(result.error);
        return;
      }
      setLeft(RESEND_AFTER_SECONDS);
    });
  }

  if (left > 0) {
    const mins = Math.floor(left / 60);
    const secs = String(left % 60).padStart(2, "0");
    return (
      <span className="text-micro">
        Resend in{" "}
        <span className="mono tabular">
          {mins}:{secs}
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onResend}
        disabled={pending}
        aria-busy={pending}
        className="cursor-pointer rounded-sm text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : `Resend the link to ${email}`}
      </button>
      {error && <p className="text-micro text-[#E51837]">{error}</p>}
    </div>
  );
}
