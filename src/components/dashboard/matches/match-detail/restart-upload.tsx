"use client";

import { useState } from "react";

import { addVideoHref } from "@/lib/matches/add-video-href";
import { createClient } from "@/lib/supabase/client";
import { advButton } from "@/lib/ui/adv-button";
import { STEPPER_COPY } from "./analysis-steps";

/**
 * "Upload the video again", for an upload that has gone quiet.
 *
 * The job is still `uploading`, and a match has room for one live job — so
 * starting again means ending this one first. One write, keyed on the job and
 * on its still being live, then a full load of the wizard for this match.
 *
 * Ending it is also what makes a second upload safe. Both uploads write to the
 * same blob, and the tab that started this one may yet wake up; once its job
 * is `failed` it stops before writing anything more
 * (`services/splitstep/job-liveness.ts`).
 *
 * `pausedSince` is the job's last move as the page read it, and the write
 * only lands if the row still says so. "Paused" is this browser's clock
 * against a timestamp that may be stale — a dropped live connection, a laptop
 * that has itself just woken — and one click must not end a multi-gigabyte
 * upload that has started moving again. If the row has moved, nothing is
 * ended, and the wizard sends the person back to a match that is uploading.
 *
 * A real anchor, so ⌘-click and middle-click still open the wizard — without
 * ending anything, which is right: the wizard refuses while a job is live.
 * The write is best-effort for the same reason the wizard's own re-upload link
 * is: offline, the page it lands on decides from what the job says.
 */
export function RestartUpload({
  jobId,
  matchId,
  pausedSince,
}: {
  jobId: string;
  matchId: string;
  pausedSince: string;
}) {
  const href = addVideoHref(matchId);
  const [pending, setPending] = useState(false);

  return (
    <a
      href={href}
      aria-disabled={pending}
      data-testid="restart-upload"
      onClick={async (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        if (pending) return;
        setPending(true);
        try {
          await createClient()
            .from("processing_jobs")
            .update({
              status: "failed",
              error_message: "Video upload failed",
              updated_at: new Date().toISOString(),
            })
            .eq("id", jobId)
            .in("status", ["pending", "uploading"])
            .eq("updated_at", pausedSince);
        } catch {
          // Still offline: the wizard decides from what the job says.
        }
        window.location.assign(href);
      }}
      className={advButton("primary", "sm")}
    >
      {pending ? STEPPER_COPY.paused.pending : STEPPER_COPY.paused.action}
    </a>
  );
}
