"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resubmitFailedAnalysisAction } from "@/app/admin/matches/resubmit-action";
import { actionRejected } from "@/lib/ui/action-rejected";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * "Resubmit" for a FAILED Advantage Intelligence analysis — the one button
 * Admin › Matches (row and side panel) and Admin › Today ("Analysis failed"
 * rows) all draw. It calls `resubmitFailedAnalysisAction({ jobId })`, reads
 * "Resubmitting…" while the call runs, prints a refusal's sentence beside
 * the button, and refreshes the route once the retry is sent, so the row
 * leaves the failed list.
 *
 * Never offered for a stuck submit (`uploaded`, never sent): `resubmitJob`
 * only retries a failed job, so those rows keep "Open".
 *
 * A click here never reaches the row underneath: the Matches row opens its
 * panel on a click, and this button is not that.
 *
 * Two refusals read differently from the rest, whose sentence is shown as
 * given:
 *   quota            the match's workspace is out of video hours — the
 *                    sentence, then a way to Pilots to add some. The button
 *                    stays live: once hours are added, a retry can succeed.
 *   attempt_ceiling  every attempt is spent and no retry can succeed, so the
 *                    button goes quiet; `resubmitJob`'s own sentence tells a
 *                    player to contact support, which an admin is.
 */
export function ResubmitButton({
  jobId,
  align = "start",
  className,
}: {
  jobId: string;
  /** Which edge the button and its sentence sit against. */
  align?: "start" | "end";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [refusal, setRefusal] = useState<{
    error: string;
    code: string | null;
  } | null>(null);

  const exhausted = refusal?.code === "attempt_ceiling";

  const resubmit = () => {
    setRefusal(null);
    startTransition(async () => {
      const result = await resubmitFailedAnalysisAction({ jobId }).catch(
        actionRejected,
      );
      if (!result.ok) {
        setRefusal({
          error: result.error,
          code: "code" in result ? result.code : null,
        });
        return;
      }
      setSent(true);
      router.refresh();
    });
  };

  return (
    <span
      // The Matches row opens its panel on a click; a click on the button or
      // its sentence must not.
      onClick={(event) => event.stopPropagation()}
      className={cn(
        "flex min-w-0 flex-col gap-1",
        align === "end" ? "items-end text-right" : "items-start",
        className,
      )}
    >
      <button
        type="button"
        disabled={pending || sent || exhausted}
        onClick={resubmit}
        className={advButton("outline", "sm")}
      >
        {pending ? "Resubmitting…" : sent ? "Resubmitted" : "Resubmit"}
      </button>
      {refusal ? (
        <span
          role="alert"
          className="max-w-[320px] text-[12px] leading-[18px] whitespace-normal text-[var(--danger)]"
        >
          {exhausted
            ? "Every attempt this match is allowed has been used, so it can’t be resubmitted."
            : refusal.error}
          {refusal.code === "quota" ? (
            <>
              {" "}
              <Link
                href="/admin/pilots"
                className="font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
              >
                Add hours
              </Link>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
