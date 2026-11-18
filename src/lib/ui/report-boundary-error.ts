import posthog from "posthog-js";
import { useEffect } from "react";
import { isPostHogConfigured } from "@/lib/posthog-client";
import { isClosedResponse, isFailedFetch } from "@/lib/ui/action-rejected";

/**
 * Reports what a segment's `error.tsx` caught, when nothing else will have.
 *
 * `capture_exceptions` only sees what nobody caught, and an error boundary
 * catches: a render crash in the browser shows the error screen and reaches no
 * one. Two kinds stay out:
 *
 * - **A `digest` means the server threw.** `onRequestError` in
 *   `instrumentation.ts` has already captured it, with the route, and this would
 *   be the same failure counted twice.
 * - **A dropped connection** — a `fetch` that never got an answer, or a
 *   response that died part-way through — is the reader's network, and
 *   nothing we can fix. Safari reports the first as `TypeError: Load failed`.
 */
export function isReportableBoundaryError(
  error: Error & { digest?: string },
): boolean {
  return !error.digest && !isClosedResponse(error) && !isFailedFetch(error);
}

export function useReportBoundaryError(
  error: Error & { digest?: string },
  source = "error_boundary",
) {
  useEffect(() => {
    if (!isPostHogConfigured || !isReportableBoundaryError(error)) return;
    posthog.captureException(error, { source });
  }, [error, source]);
}
