"use client";

/**
 * "Cancel this analysis?" — the confirm behind the match page stepper's quiet
 * "Cancel analysis" action, for a job still waiting in the vendor's queue.
 *
 * Red, because the place in line is what is lost (`ConfirmDialog`'s
 * red-only-when-something-is-lost rule); the video and the reserved minutes
 * are not, and the body says so. The request is `POST
 * /api/splitstep/jobs/:id/cancel` (T2). A refusal — the vendor started in the
 * meantime (409 `already_started`), the job is past cancelling (409
 * `not_cancellable`), the vendor did not answer (503) — is the route's own
 * sentence, shown in the dialog, which stays open. Who may cancel is decided
 * server-side; nothing here hides the action by role.
 *
 * Split in two so a spec can render the question in any state without a
 * browser: `CancelAnalysisConfirm` draws it from props, `CancelAnalysisDialog`
 * owns the request, and `requestCancel` / `requestResubmit` turn a response
 * into `{ ok } | { error }` against any `fetch`.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { ConfirmDialog, ConfirmNote, Em } from "@/components/ui/confirm-dialog";
import { formatDuration } from "@/lib/data/match-analysis";

export const CANCEL_DIALOG_COPY = {
  title: "Cancel this analysis?",
  description:
    "It hasn't started yet. The video stays saved, and you can send it for analysis again from the match page.",
  note: "goes back to this month's analysis time.",
  confirm: "Cancel analysis",
  keep: "Keep in line",
  pending: "Cancelling…",
} as const;

export type JobActionResult = { ok: true } | { ok: false; error: string };

const OFFLINE = "Couldn't reach the server. Check your connection.";

/**
 * POST one of a job's actions and read the answer the API writes for a person:
 * `{ error }` on a refusal (`errorResponse()`'s shape), shown verbatim.
 */
async function postJobAction(
  url: string,
  fallback: string,
  fetchImpl: typeof fetch,
): Promise<JobActionResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, { method: "POST" });
  } catch {
    return { ok: false, error: OFFLINE };
  }
  if (response.ok) return { ok: true };
  const payload = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;
  return {
    ok: false,
    error:
      typeof payload?.error === "string" && payload.error
        ? payload.error
        : fallback,
  };
}

/** `POST /api/splitstep/jobs/:id/cancel` — same-origin, the session cookie. */
export function requestCancel(
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JobActionResult> {
  return postJobAction(
    `/api/splitstep/jobs/${jobId}/cancel`,
    "Couldn't cancel the analysis. Try again.",
    fetchImpl,
  );
}

/**
 * `POST /api/splitstep/jobs/:id/resubmit` — the request `RetryAnalysis` sends,
 * which T4 opened to a cancelled parent. The stepper's "Send for analysis
 * again" fires it with no confirm.
 */
export function requestResubmit(
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JobActionResult> {
  return postJobAction(
    `/api/splitstep/jobs/${jobId}/resubmit`,
    "That didn't go through.",
    fetchImpl,
  );
}

/** The question, drawn from props alone. */
export function CancelAnalysisConfirm({
  open,
  onOpenChange,
  reservedSeconds,
  pending = false,
  error = null,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The minutes the queued job holds — absent on a row that never recorded them. */
  reservedSeconds: number | undefined;
  pending?: boolean;
  error?: string | null;
  onConfirm: () => void;
}): React.JSX.Element {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={CANCEL_DIALOG_COPY.title}
      description={CANCEL_DIALOG_COPY.description}
      tone="danger"
      confirmLabel={CANCEL_DIALOG_COPY.confirm}
      cancelLabel={CANCEL_DIALOG_COPY.keep}
      pendingLabel={CANCEL_DIALOG_COPY.pending}
      pending={pending}
      error={error}
      onConfirm={onConfirm}
    >
      {reservedSeconds !== undefined && (
        <ConfirmNote icon={<Clock aria-hidden />}>
          <Em>{formatDuration(reservedSeconds)}</Em> {CANCEL_DIALOG_COPY.note}
        </ConfirmNote>
      )}
    </ConfirmDialog>
  );
}

export function CancelAnalysisDialog({
  jobId,
  reservedSeconds,
  open,
  onOpenChange,
}: {
  jobId: string;
  reservedSeconds: number | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setPending(true);
    setError(null);
    const result = await requestCancel(jobId);
    setPending(false);
    if (!result.ok) {
      // Stays open: the sentence is why nothing changed.
      setError(result.error);
      return;
    }
    onOpenChange(false);
    // The row is cancelled; re-render so the page shows the cancelled view.
    router.refresh();
  };

  return (
    <CancelAnalysisConfirm
      open={open}
      onOpenChange={(next) => {
        // A refusal belongs to the attempt that drew it, not the next opening.
        if (!next) setError(null);
        onOpenChange(next);
      }}
      reservedSeconds={reservedSeconds}
      pending={pending}
      error={error}
      onConfirm={() => void handleConfirm()}
    />
  );
}
