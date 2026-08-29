"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

/**
 * "Retry analysis", for a job the provider FAILED.
 *
 * The sibling of RetrySubmission, for the other recovery class: that one
 * re-submits a job whose hand-off never happened (same row, still `uploaded`);
 * this one asks the resubmit endpoint for a fresh attempt at a job the vendor
 * accepted and then failed. The endpoint creates a new job row linked to this
 * one and re-runs the submission from the stored video — nothing needs
 * uploading again, and none of the three silently-misattributing questions
 * get re-asked, because the failed row already holds the answers.
 *
 * Refusals are shown verbatim: the endpoint's messages are written for a
 * person — the attempt ceiling, an analysis already in progress, a video no
 * longer stored, an exhausted monthly allowance — and each one is the actual
 * reason the button did nothing.
 */
export function RetryAnalysis({ jobId }: { jobId: string }) {
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
              const response = await fetch(
                `/api/splitstep/jobs/${jobId}/resubmit`,
                { method: "POST" }
              );

              if (!response.ok) {
                const payload = (await response
                  .json()
                  .catch(() => null)) as { error?: string } | null;
                setError(payload?.error ?? "That didn't go through.");
                return;
              }

              // A new job row now exists at `queued`; re-render so the panel
              // picks it up (newest attempt wins in loadMatchAnalysis).
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
        {pending ? "Retrying…" : "Retry analysis"}
      </button>

      {error && (
        <p role="alert" className="text-[12px] leading-[18px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
