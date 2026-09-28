"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { seedLabelSessionAction } from "@/app/admin/labels/actions";

/**
 * One row's "Start labelling" / "Continue" — the only write this page makes.
 *
 * Always calls `seedLabelSessionAction(jobId)`, whether or not a session
 * already exists: the action itself returns the job's open session rather
 * than starting a second one (T3's `findOpenSession`), so this component
 * never has to decide that — it only decides the button's label from
 * `hasSession`, and navigates on whatever `sessionId` comes back.
 *
 * A client component for the same reason `ApproveChip` is one: the action
 * call and the `router.push` that follows it need a real event handler,
 * which a Server Component page cannot pass across the boundary.
 */
export function StartLabellingButton({
  jobId,
  hasSession,
}: {
  jobId: string;
  hasSession: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
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

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className={cn(advButton("primary", "sm"), "whitespace-nowrap")}
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
