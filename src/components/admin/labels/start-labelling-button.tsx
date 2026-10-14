"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { seedLabelSessionAction } from "@/app/admin/labels/actions";

/**
 * One row's "Start labelling" / "Continue": the only write this page makes.
 * Always calls `seedLabelSessionAction(jobId)`: the action returns the job's
 * open session rather than starting a second one, so this only picks the
 * button's label from `hasSession` and navigates to whatever `sessionId` comes
 * back.
 */
/**
 * Start (or continue) labelling a job: seed its session through the server
 * action, then open it. The Labels list's rows call this on a click; the
 * button below wraps it.
 */
export function useStartLabelling(jobId: string) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const start = () => {
    setError(null);
    startTransition(async () => {
      const result = await seedLabelSessionAction(jobId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/admin/labels/${result.sessionId}`);
    });
  };
  return { start, isPending, error };
}

export function StartLabellingButton({
  jobId,
  hasSession,
  variant = "primary",
}: {
  jobId: string;
  hasSession: boolean;
  /**
   * The list keeps blue for the match that still needs labelling; one already
   * under way continues from an outline button.
   */
  variant?: "primary" | "outline";
}) {
  const { start: onClick, isPending, error } = useStartLabelling(jobId);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={cn(advButton(variant, "sm"), "whitespace-nowrap")}
      >
        {isPending ? "Starting…" : hasSession ? "Continue" : "Start labelling"}
      </button>
      {error ? (
        <p
          role="alert"
          className="max-w-[220px] text-right text-[11px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
