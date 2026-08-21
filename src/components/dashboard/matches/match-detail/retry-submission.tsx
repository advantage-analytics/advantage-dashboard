"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

/**
 * "Try again", for a submission that never happened.
 *
 * Only rendered when `isSubmitStalled` says so — an `uploaded` job that has sat
 * still long past the seconds auto-submit takes. Until now that state had no
 * exit: the panel told the player their video was stored and nothing else was
 * needed, which was true of the bytes and false about the analysis, and no
 * reaper touches `uploaded` because the bytes really are safe.
 *
 * ── It sends only the job id ────────────────────────────────────────────────
 * Not the orientation, the ad-scoring flag or the fixed-camera flag. The route
 * reads those back from the row now, which is the entire reason this button can
 * exist: re-asking would mean putting the three questions that silently
 * misattribute every statistic in front of somebody whose only intent was to
 * press retry. The row holds the answers the first attempt used, so the retry
 * reproduces that attempt exactly rather than approximating it.
 *
 * ── No re-upload ────────────────────────────────────────────────────────────
 * The bytes are already in Azure and the job still points at them. This costs
 * the wait, not the transfer.
 */
export function RetrySubmission({ jobId }: { jobId: string }) {
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
              const response = await fetch("/api/splitstep/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // The whole payload. See the header.
                body: JSON.stringify({ jobId }),
              });

              if (!response.ok) {
                const payload = (await response
                  .json()
                  .catch(() => null)) as { error?: string } | null;
                // The route's messages are written for a person — "already
                // submitted", "still uploading", "not configured on this
                // deployment" — so they are shown rather than replaced.
                setError(payload?.error ?? "That didn't go through.");
                return;
              }

              // The job has moved to `submitting`; re-render so the panel
              // follows it rather than staying on the stalled state.
              router.refresh();
            } catch {
              setError("Couldn't reach the server. Check your connection.");
            }
          })
        }
        className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 py-1.5 text-[12px] text-[var(--ink-900)] transition-colors hover:border-[var(--blue)] hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:opacity-50"
      >
        <RotateCw
          className={`size-3.5 ${pending ? "animate-spin" : ""}`}
          strokeWidth={1.5}
          aria-hidden
        />
        {pending ? "Sending…" : "Try again"}
      </button>

      {error && (
        <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
