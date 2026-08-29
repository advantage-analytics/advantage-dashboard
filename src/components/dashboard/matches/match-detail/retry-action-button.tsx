"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

/**
 * The shared scaffold behind RetrySubmission and RetryAnalysis.
 *
 * The two retry buttons recover from different failure classes (a hand-off
 * that never happened vs a vendor-failed job) but share everything visible:
 * the spinner button, the pending state, and the show-the-server's-words
 * error line. One component so a styling or copy fix cannot land on one and
 * be forgotten on the other.
 *
 * Refusal messages are shown verbatim — both endpoints write them for a
 * person, and each one is the actual reason the button did nothing.
 */
export function RetryActionButton({
  label,
  pendingLabel,
  request,
}: {
  label: string;
  pendingLabel: string;
  /** Fires the retry. The response's `error` field is shown on failure. */
  request: () => Promise<Response>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-4 flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const response = await request();

              if (!response.ok) {
                const payload = (await response
                  .json()
                  .catch(() => null)) as { error?: string } | null;
                setError(payload?.error ?? "That didn't go through.");
                return;
              }

              // The job has moved; re-render so the panel follows it rather
              // than staying on the stale state.
              router.refresh();
            } catch {
              setError("Couldn't reach the server. Check your connection.");
            }
          })
        }
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 py-1.5 text-[12px] text-[var(--ink-900)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
      >
        <RotateCw
          className={`size-3.5 ${pending ? "animate-spin" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
        {pending ? pendingLabel : label}
      </button>

      {error && (
        <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
